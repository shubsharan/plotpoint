import { describe, expect, it } from "vitest";

import {
  canonicalizeValue,
  defineCommand,
  defineProgression,
  executeCommand,
  initialProgression,
  type Aggregate,
  type Command,
  type JsonObject,
  type ProgressionDefinition,
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
  definition: ProgressionDefinition<JsonObject, "player">,
  progression: ProgressionInstance,
  maxAutomaticTransitions: number,
) {
  return evaluateProgression({
    definition,
    progression,
    intents: [],
    aggregateState: {},
    commandId: command.id,
    domainEvents: [],
    maxAutomaticTransitions,
  });
}

function playerAggregate(progression: ProgressionInstance): Aggregate<JsonObject, "player"> {
  return {
    aggregateId: "p1",
    modelId: "player.model",
    aggregateKind: "player",
    schemaId: "player.state",
    stateVersion: 0,
    state: {},
    progression,
  };
}

describe("progression failures", () => {
  const parallel = defineProgression({
    aggregateKind: "player",
    graphId: "parallel",
    nodes: [
      { nodeId: "a", initialStatus: "locked" },
      { nodeId: "b", initialStatus: "locked" },
    ],
    transitions: [
      {
        transitionId: "unlock-a",
        targetNodeId: "a",
        from: ["locked"],
        to: "available",
        priority: 0,
        trigger: "automatic",
        when: () => true,
      },
      {
        transitionId: "unlock-b",
        targetNodeId: "b",
        from: ["locked"],
        to: "available",
        priority: 0,
        trigger: "automatic",
        when: () => true,
      },
    ],
  });
  const start = initialProgression(parallel);

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
      nodes: [{ nodeId: "a", initialStatus: "active" }],
      transitions: [
        {
          transitionId: "deactivate",
          targetNodeId: "a",
          from: ["active"],
          to: "available",
          priority: 0,
          trigger: "automatic",
          when: () => true,
        },
        {
          transitionId: "activate",
          targetNodeId: "a",
          from: ["available"],
          to: "active",
          priority: 0,
          trigger: "automatic",
          when: () => true,
        },
      ],
    });
    const result = evaluate(cyclic, initialProgression(cyclic), 10);

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") expect(result.diagnostic.code).toBe("progression-cycle");
  });

  it("rolls back aggregate and candidate facts when progression fails", () => {
    const aggregate = playerAggregate(start);
    const definition = defineCommand<"player", JsonObject, JsonObject, JsonObject>({
      definitionId: "atomic",
      commandType: "advance",
      aggregateKind: "player",
      handle: () => ({
        kind: "accepted",
        nextState: { changed: true },
        outcome: { result: "candidate" },
        domainEvents: [{ type: "candidate" }],
        effectIntents: [{ type: "candidate-effect" }],
        progressionIntents: [],
      }),
    });
    const result = executeCommand({
      definition,
      aggregate,
      command,
      observations: [],
      progression: parallel,
      policy: { maxAutomaticTransitions: 1 },
    });

    expect(result).toMatchObject({ kind: "recorded", record: { terminal: "invalid" } });
    if (result.kind !== "recorded") throw new Error("expected recorded invalid result");
    expect(result.aggregate).toEqual(aggregate);
    expect(result.record.diagnostics[0]?.code).toBe("progression-limit-overrun");
    expect(result.record.effectIntents).toBeUndefined();
    expect(result.record.domainEvents).toBeUndefined();
  });

  it("records malformed progression state as deterministic invalidity", () => {
    const progression = defineProgression({
      aggregateKind: "player",
      graphId: "malformed",
      nodes: [],
      transitions: [],
    });
    const aggregate = playerAggregate({ nodes: [] } as never);
    const definition = defineCommand<"player", JsonObject, JsonObject, JsonObject>({
      definitionId: "malformed",
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
    const result = executeCommand({
      definition,
      aggregate,
      command,
      observations: [],
      progression,
    });

    expect(result).toMatchObject({ kind: "recorded", record: { terminal: "invalid" } });
    if (result.kind !== "recorded") throw new Error("expected recorded invalid result");
    expect(result.record.diagnostics[0]?.code).toBe("progression-state-invalid");
    expect(canonicalizeValue(result.record).kind).toBe("valid");
  });

  it("rejects a progression definition for another aggregate kind before evaluation", () => {
    let evaluated = false;
    const aggregate = playerAggregate({
      graphId: "kind-mismatch",
      nodes: [{ nodeId: "node", status: "locked" }],
    });
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
      nodes: [{ nodeId: "node", initialStatus: "locked" }],
      transitions: [
        {
          transitionId: "evaluate",
          targetNodeId: "node",
          from: ["locked"],
          to: "available",
          priority: 0,
          trigger: "automatic",
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

    expect(result).toMatchObject({ kind: "recorded", record: { terminal: "invalid" } });
    if (result.kind !== "recorded") throw new Error("expected recorded invalid result");
    expect(result.record.diagnostics[0]).toMatchObject({
      code: "progression-graph-invalid",
      details: { reason: "aggregate-kind-mismatch" },
    });
    expect(evaluated).toBe(false);
  });

  it("rejects progression that returns to its starting state without another durable fact", () => {
    const reverted = defineProgression({
      aggregateKind: "player",
      graphId: "reverted",
      nodes: [{ nodeId: "node", initialStatus: "active" }],
      transitions: [
        {
          transitionId: "deactivate",
          targetNodeId: "node",
          from: ["active"],
          to: "available",
          priority: 0,
          trigger: "intent",
        },
        {
          transitionId: "restore",
          targetNodeId: "node",
          from: ["available"],
          to: "active",
          priority: 0,
          trigger: "automatic",
          when: () => true,
        },
      ],
    });
    const aggregate = playerAggregate(initialProgression(reverted));
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
        progressionIntents: [{ transitionId: "deactivate" }],
      }),
    });
    const result = executeCommand({
      definition,
      aggregate,
      command,
      observations: [],
      progression: reverted,
    });

    expect(result).toMatchObject({ kind: "recorded", record: { terminal: "invalid" } });
    if (result.kind !== "recorded") throw new Error("expected recorded invalid result");
    expect(result.record.diagnostics[0]?.code).toBe("no-op-output-invalid");
  });
});
