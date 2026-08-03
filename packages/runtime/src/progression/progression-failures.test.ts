import { describe, expect, it } from "vitest";

import {
  defineCommand,
  evaluateProgression,
  executeCommand,
  type Aggregate,
  type Command,
  type JsonObject,
  type ProgressionDefinition,
  type ProgressionInstance,
} from "../index.js";

const command: Command = {
  id: "c1",
  type: "advance",
  target: { kind: "player", id: "p1" },
  expectedStateVersion: 0,
  payload: {},
};

function evaluate(
  definition: ProgressionDefinition,
  progression: ProgressionInstance,
  maxAutomaticTransitions: number,
) {
  return evaluateProgression({
    definition,
    progression,
    intents: [],
    aggregateState: {},
    command,
    outcome: {},
    domainEvents: [],
    observationTrace: [],
    maxAutomaticTransitions,
  });
}

describe("progression failures", () => {
  const parallel: ProgressionDefinition = {
    graphId: "parallel.v1",
    graphVersion: 1,
    nodes: [
      { nodeId: "a", initialStatus: "locked" },
      { nodeId: "b", initialStatus: "locked" },
    ],
    automaticRules: [
      {
        ruleId: "unlock-a",
        targetNodeId: "a",
        from: ["locked"],
        to: "available",
        priority: 0,
        when: () => true,
      },
      {
        ruleId: "unlock-b",
        targetNodeId: "b",
        from: ["locked"],
        to: "available",
        priority: 0,
        when: () => true,
      },
    ],
  };
  const start: ProgressionInstance = {
    graphId: "parallel.v1",
    graphVersion: 1,
    nodes: [
      { nodeId: "a", status: "locked" },
      { nodeId: "b", status: "locked" },
    ],
  };

  it.each([0, 1])("rejects a parallel batch atomically at limit %i", (limit) => {
    const result = evaluate(parallel, start, limit);
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.diagnostic.code).toBe("progression-limit-overrun");
      expect(result.attemptedTrace).toEqual([]);
    }
    expect(start.nodes.every((node) => node.status === "locked")).toBe(true);
  });

  it("accepts an exact limit when the resulting state is stable", () => {
    const result = evaluate(parallel, start, 2);
    expect(result.kind).toBe("stable");
    if (result.kind === "stable") expect(result.trace).toHaveLength(2);
  });

  it("diagnoses a complete-state cycle", () => {
    const cyclic: ProgressionDefinition = {
      graphId: "cycle.v1",
      graphVersion: 1,
      nodes: [{ nodeId: "a", initialStatus: "active" }],
      automaticRules: [
        {
          ruleId: "deactivate",
          targetNodeId: "a",
          from: ["active"],
          to: "available",
          priority: 0,
          when: () => true,
        },
        {
          ruleId: "activate",
          targetNodeId: "a",
          from: ["available"],
          to: "active",
          priority: 0,
          when: () => true,
        },
      ],
    };
    const result = evaluate(
      cyclic,
      { graphId: "cycle.v1", graphVersion: 1, nodes: [{ nodeId: "a", status: "active" }] },
      10,
    );

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") expect(result.diagnostic.code).toBe("progression-cycle");
  });

  it("rolls back the aggregate and suppresses candidate effects when progression fails", () => {
    type AtomicState = JsonObject & { readonly changed: boolean };
    const aggregate: Aggregate<AtomicState> = {
      kind: "player",
      id: "p1",
      schemaVersion: 1,
      stateVersion: 0,
      authority: "local",
      state: { changed: false },
      progression: start,
    };
    const definition = defineCommand<AtomicState, JsonObject, JsonObject>({
      definitionId: "atomic.v1",
      commandType: "advance",
      aggregateKind: "player",
      handle() {
        return {
          kind: "accepted" as const,
          nextState: { changed: true },
          outcome: { result: "candidate" },
          domainEvents: [{ type: "candidate" }],
          effectIntents: [{ type: "candidate-effect" }],
          progressionIntents: [],
        };
      },
    });

    const result = executeCommand({
      definition,
      aggregate,
      command,
      observations: [],
      progression: parallel,
      policy: { maxAutomaticTransitions: 1 },
    });

    expect(result.kind).toBe("invalid");
    expect(result.aggregate).toEqual(aggregate);
    if (result.kind === "invalid") {
      expect(result.diagnostics[0]?.code).toBe("progression-limit-overrun");
      expect(result.record.effectIntents).toBeUndefined();
      expect(result.record.domainEvents).toBeUndefined();
    }
  });
});
