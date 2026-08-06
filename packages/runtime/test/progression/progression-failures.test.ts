import { describe, expect, it } from "vitest";

import {
  bindExecutableAggregateModel,
  canonicalizeValue,
  defineCommand,
  defineProgression,
  initialProgression,
  resolveCommandBinding,
  type Aggregate,
  type AggregateKind,
  type Command,
  type CommandDefinition,
  type ExecutionResult,
  type JsonObject,
  type Observation,
  type ProgressionDefinition,
  type ProgressionInstance,
  type RuntimePolicy,
  type RuntimeSchema,
} from "@plotpoint/runtime";
import { executeCommandWithEvaluator } from "../../src/execute-command.js";
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

function runtimeObjectSchema(
  id: string,
  schemaDigest: RuntimeSchema<JsonObject>["schemaDigest"],
): RuntimeSchema<JsonObject> {
  return {
    id,
    schemaDigest,
    validate(value) {
      return value !== null && typeof value === "object" && !Array.isArray(value)
        ? { valid: true, value: value as JsonObject }
        : { valid: false, diagnostics: [] };
    },
  };
}

function executablePlayerModel(input: {
  readonly progression?: ProgressionDefinition<JsonObject, "player">;
  readonly terminal: "accepted" | "no-op" | "rejected";
  readonly onHandle: () => void;
}) {
  const definition = defineCommand<"player", JsonObject, JsonObject, JsonObject>({
    definitionId: "player.advance",
    commandType: "advance",
    aggregateKind: "player",
    handle() {
      input.onHandle();
      if (input.terminal === "no-op" || input.terminal === "rejected") {
        return { kind: input.terminal, outcome: {} };
      }
      return {
        kind: "accepted",
        nextState: { changed: true },
        outcome: {},
        domainEvents: [],
        effectIntents: [],
        progressionIntents: [],
      };
    },
  });
  const binding = resolveCommandBinding({
    registrationId: "player.advance",
    definition,
    payloadSchema: runtimeObjectSchema(
      "player.advance.payload",
      "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    ),
    outcomeSchema: runtimeObjectSchema(
      "player.advance.outcome",
      "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    ),
  });
  return bindExecutableAggregateModel({
    modelId: "player.model",
    aggregateKind: "player",
    authority: "local",
    stateSchema: runtimeObjectSchema(
      "player.state",
      "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    ),
    initializationSchema: runtimeObjectSchema(
      "player.initialization",
      "sha256:4444444444444444444444444444444444444444444444444444444444444444",
    ),
    initializeState: () => ({}),
    commandsByType: { advance: binding },
    eventSchemas: {},
    effectSchemas: {},
    ...(input.progression === undefined ? {} : { progression: input.progression }),
  });
}

function executeDefinition<
  Kind extends AggregateKind,
  StateValue extends JsonObject,
  PayloadValue extends JsonObject,
  OutcomeValue extends JsonObject,
>(input: {
  readonly definition: CommandDefinition<StateValue, PayloadValue, OutcomeValue, Kind>;
  readonly aggregate: Aggregate<StateValue, Kind>;
  readonly command: Command<PayloadValue, Kind>;
  readonly observations: readonly Observation[];
  readonly progression?: ProgressionDefinition<StateValue, Kind>;
  readonly policy?: Partial<RuntimePolicy>;
}): ExecutionResult<StateValue, OutcomeValue, PayloadValue, Kind> {
  return executeCommandWithEvaluator({
    definitionId: input.definition.definitionId,
    commandType: input.definition.commandType,
    aggregateKind: input.definition.aggregateKind,
    aggregate: input.aggregate,
    command: input.command,
    observations: input.observations,
    ...(input.progression === undefined ? {} : { progression: input.progression }),
    ...(input.policy === undefined ? {} : { policy: input.policy }),
    evaluate(target, runtimeCommand, context) {
      return {
        kind: "decision",
        decision: input.definition.handle(target, runtimeCommand, context),
      };
    },
  });
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
    if (result.kind === "invalid") {
      expect(result.attemptedTrace.map((step) => [step.round, step.transitionId])).toEqual([
        [1, "deactivate"],
        [2, "activate"],
      ]);
      expect(result.diagnostic).toMatchObject({
        code: "progression-cycle",
        details: {
          commandId: "c1",
          cycleLength: 2,
          firstSeenTransition: 0,
          graphId: "cycle",
          repeatedSnapshot: {
            graphId: "cycle",
            nodes: [{ nodeId: "a", status: "active" }],
          },
          repeatedTransition: 2,
        },
      });
    }
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
    const result = executeDefinition({
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
    const result = executeDefinition({
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

  it.each(["accepted", "no-op", "rejected"] as const)(
    "validates the current progression before invoking a %s handler",
    (terminal) => {
      let handlerCalls = 0;
      const progression = defineProgression({
        aggregateKind: "player",
        graphId: "pre-handler-validation",
        nodes: [{ nodeId: "node", initialStatus: "locked" }],
        transitions: [],
      });
      const model = executablePlayerModel({
        progression,
        terminal,
        onHandle: () => {
          handlerCalls += 1;
        },
      });
      const aggregate = playerAggregate({
        graphId: progression.graphId,
        nodes: "invalid",
      } as never);

      const result = model.execute({ aggregate, command, observations: [] });

      expect(result).toMatchObject({
        kind: "recorded",
        aggregate,
        record: {
          terminal: "invalid",
          diagnostics: [{ code: "progression-state-invalid" }],
        },
      });
      expect(handlerCalls).toBe(0);
    },
  );

  it("validates progression definition-instance pairing before typed handlers", () => {
    let handlerCalls = 0;
    const progression = defineProgression({
      aggregateKind: "player",
      graphId: "paired",
      nodes: [{ nodeId: "node", initialStatus: "locked" }],
      transitions: [],
    });
    const onHandle = () => {
      handlerCalls += 1;
    };
    const progressionModel = executablePlayerModel({
      progression,
      terminal: "rejected",
      onHandle,
    });
    const progressionlessModel = executablePlayerModel({ terminal: "no-op", onHandle });
    const progressionlessAggregate: Aggregate<JsonObject, "player"> = {
      aggregateId: "p1",
      modelId: "player.model",
      aggregateKind: "player",
      schemaId: "player.state",
      stateVersion: 0,
      state: {},
    };

    const results = [
      progressionModel.execute({
        aggregate: progressionlessAggregate,
        command,
        observations: [],
      }),
      progressionlessModel.execute({
        aggregate: playerAggregate(initialProgression(progression)),
        command,
        observations: [],
      }),
    ];

    for (const result of results) {
      expect(result).toMatchObject({
        kind: "recorded",
        record: {
          terminal: "invalid",
          diagnostics: [
            {
              code: "progression-graph-invalid",
              details: { reason: "definition-instance-pair-required" },
            },
          ],
        },
      });
    }
    expect(handlerCalls).toBe(0);
  });

  it("rejects a progression definition for another model kind at binding", () => {
    const teamProgression = defineProgression({
      aggregateKind: "team",
      graphId: "wrong-kind",
      nodes: [],
      transitions: [],
    });

    expect(() =>
      executablePlayerModel({
        progression: teamProgression as never,
        terminal: "no-op",
        onHandle: () => undefined,
      }),
    ).toThrow("Aggregate model progression kind must match the model kind");
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
    const result = executeDefinition({
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
    const result = executeDefinition({
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

  it("accepts durable local logic that intentionally omits progression", () => {
    type OptionalState = JsonObject & { readonly count: number };
    const aggregate: Aggregate<OptionalState, "player"> = {
      aggregateId: "p1",
      modelId: "player.without-progression",
      aggregateKind: "player",
      schemaId: "player.without-progression.state",
      stateVersion: 0,
      state: { count: 0 },
    };
    const definition = defineCommand<
      "player",
      OptionalState,
      { readonly amount: number },
      { readonly count: number }
    >({
      definitionId: "increment-without-progression",
      commandType: "increment",
      aggregateKind: "player",
      handle: (target, input) => ({
        kind: "accepted",
        nextState: { count: target.state.count + input.payload.amount },
        outcome: { count: target.state.count + input.payload.amount },
        domainEvents: [],
        effectIntents: [],
        progressionIntents: [],
      }),
    });
    const result = executeDefinition({
      definition,
      aggregate,
      command: {
        id: "increment-1",
        type: "increment",
        target: { kind: "player", id: aggregate.aggregateId },
        expectedStateVersion: 0,
        payload: { amount: 1 },
      },
      observations: [],
    });

    expect(result).toMatchObject({
      kind: "recorded",
      aggregate: { state: { count: 1 }, stateVersion: 1 },
      record: {
        progressionTrace: [],
        terminal: "accepted",
      },
    });
    if (result.kind !== "recorded") throw new Error("expected recorded increment");
    expect(result.aggregate).not.toHaveProperty("progression");
    expect(result.record.aggregateAfter).not.toHaveProperty("progression");
  });
});
