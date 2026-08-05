import { describe, expect, it } from "vitest";

import {
  canonicalizeValue,
  defineProgression,
  defineCommand,
  executeCommand,
  type Aggregate,
  type Command,
  type JsonObject,
  type DefinedProgression,
  type ProgressionInstance,
} from "@plotpoint/runtime";
import { evaluateProgression } from "../../src/progression/evaluate-progression.js";

const command: Command<JsonObject, "player"> = {
  id: "c1",
  type: "advance",
  target: { kind: "player", id: "p1" },
  expectedStateVersion: 0,
  payload: {},
};

function evaluate(
  definition: DefinedProgression<JsonObject, JsonObject, JsonObject, "player">,
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
  const parallel = defineProgression({
    aggregateKind: "player",
    graphId: "parallel",
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
  });
  const start: ProgressionInstance = {
    graphId: "parallel",
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
    const cyclic = defineProgression({
      aggregateKind: "player",
      graphId: "cycle",
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
    });
    const result = evaluate(
      cyclic,
      { graphId: "cycle", graphVersion: 1, nodes: [{ nodeId: "a", status: "active" }] },
      10,
    );

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") expect(result.diagnostic.code).toBe("progression-cycle");
  });

  it("rolls back the aggregate and suppresses candidate effects when progression fails", () => {
    type AtomicState = JsonObject & { readonly changed: boolean };
    const aggregate: Aggregate<AtomicState, "player"> = {
      kind: "player",
      id: "p1",
      schemaVersion: 1,
      stateVersion: 0,
      authority: "local",
      state: { changed: false },
      progression: start,
    };
    const definition = defineCommand<"player", AtomicState, JsonObject, JsonObject>({
      definitionId: "atomic",
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
    if (result.kind !== "invalid" || result.phase !== "execution") {
      throw new Error("expected recorded invalid result");
    }
    expect(result.aggregate).toEqual(aggregate);
    expect(result.diagnostics[0]?.code).toBe("progression-limit-overrun");
    expect(result.record.effectIntents).toBeUndefined();
    expect(result.record.domainEvents).toBeUndefined();
  });

  it("returns recorded invalidity for malformed progression identity", () => {
    const aggregate: Aggregate<JsonObject, "player"> = {
      kind: "player",
      id: "p1",
      schemaVersion: 1,
      stateVersion: 0,
      authority: "local",
      state: {},
      progression: { nodes: [] } as never,
    };
    const definition = defineCommand<"player", JsonObject, JsonObject, JsonObject>({
      definitionId: "malformed-progression",
      commandType: "advance",
      aggregateKind: "player",
      handle: () => ({
        kind: "accepted",
        nextState: { changed: true },
        outcome: {},
        domainEvents: [],
        effectIntents: [],
        progressionIntents: [],
      }),
    });
    const progression = defineProgression({
      aggregateKind: "player",
      graphId: "malformed-progression",
      graphVersion: 1,
      nodes: [],
      automaticRules: [],
    });

    expect(() =>
      executeCommand({ definition, aggregate, command, observations: [], progression }),
    ).not.toThrow();
    const result = executeCommand({
      definition,
      aggregate,
      command,
      observations: [],
      progression,
    });
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid" || result.phase !== "execution") {
      throw new Error("expected recorded invalid result");
    }
    expect(result.diagnostics[0]?.code).toBe("progression-state-invalid");
    expect(canonicalizeValue(result.record).kind).toBe("valid");
  });

  it("rejects a progression definition for another aggregate kind before evaluation", () => {
    let evaluated = false;
    const aggregate: Aggregate<JsonObject, "player"> = {
      kind: "player",
      id: "p1",
      schemaVersion: 1,
      stateVersion: 0,
      authority: "local",
      state: {},
      progression: {
        graphId: "kind-mismatch",
        graphVersion: 1,
        nodes: [{ nodeId: "node", status: "locked" }],
      },
    };
    const definition = defineCommand<"player", JsonObject, JsonObject, JsonObject>({
      definitionId: "kind-mismatch",
      commandType: "advance",
      aggregateKind: "player",
      handle: () => ({
        kind: "accepted",
        nextState: { changed: true },
        outcome: {},
        domainEvents: [],
        effectIntents: [],
        progressionIntents: [],
      }),
    });
    const progression = defineProgression({
      aggregateKind: "team",
      graphId: "kind-mismatch",
      graphVersion: 1,
      nodes: [{ nodeId: "node", initialStatus: "locked" }],
      automaticRules: [
        {
          ruleId: "evaluate",
          targetNodeId: "node",
          from: ["locked"],
          to: "available",
          priority: 0,
          when: () => {
            evaluated = true;
            return true;
          },
        },
      ],
    });

    const result = executeCommand({
      definition,
      aggregate,
      command,
      observations: [],
      progression: progression as never,
    });

    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid" || result.phase !== "execution") {
      throw new Error("expected recorded invalid result");
    }
    expect(result.diagnostics[0]).toMatchObject({
      code: "progression-graph-invalid",
      details: { reason: "aggregate-kind-mismatch" },
    });
    expect(evaluated).toBe(false);
  });

  it("rejects reverted progression instead of returning a traced no-op", () => {
    const reverted = defineProgression({
      aggregateKind: "player",
      graphId: "reverted",
      graphVersion: 1,
      nodes: [{ nodeId: "node", initialStatus: "active" }],
      automaticRules: [
        {
          ruleId: "restore",
          targetNodeId: "node",
          from: ["available"],
          to: "active",
          priority: 0,
          when: () => true,
        },
      ],
    });
    const aggregate: Aggregate<JsonObject, "player"> = {
      kind: "player",
      id: "p1",
      schemaVersion: 1,
      stateVersion: 0,
      authority: "local",
      state: {},
      progression: {
        graphId: "reverted",
        graphVersion: 1,
        nodes: [{ nodeId: "node", status: "active" }],
      },
    };
    const definition = defineCommand<"player", JsonObject, JsonObject, JsonObject>({
      definitionId: "reverted",
      commandType: "advance",
      aggregateKind: "player",
      handle: (target) => ({
        kind: "accepted",
        nextState: target.state,
        outcome: {},
        domainEvents: [],
        effectIntents: [],
        progressionIntents: [{ nodeId: "node", from: "active", to: "available" }],
      }),
    });

    const result = executeCommand({
      definition,
      aggregate,
      command,
      observations: [],
      progression: reverted,
    });

    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") throw new Error("expected invalid");
    expect(result.diagnostics[0]?.code).toBe("no-op-output-invalid");
  });
});
