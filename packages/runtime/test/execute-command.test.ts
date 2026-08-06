import { describe, expect, it } from "vitest";

import {
  bindExecutableAggregateModel,
  canonicalizeValue,
  defineCommand,
  defineProgression,
  executeCommand as executeResolvedCommand,
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
  type ResolvedAggregateModel,
  type RuntimePolicy,
  type RuntimeSchema,
} from "@plotpoint/runtime";
import { executeCommandWithEvaluator } from "../src/execute-command.js";

type State = JsonObject & { readonly count: number };
type Payload = JsonObject & { readonly amount: number };
type Outcome = JsonObject & { readonly result: string };

const aggregate: Aggregate<State, "player"> = {
  aggregateId: "player-1",
  modelId: "counter.player",
  aggregateKind: "player",
  schemaId: "counter.state",
  stateVersion: 4,
  state: { count: 1 },
};

const command: Command<Payload, "player"> = {
  id: "command-1",
  type: "increment",
  target: { kind: "player", id: "player-1" },
  expectedStateVersion: 4,
  payload: { amount: 2 },
};

function executeCommand<
  Kind extends AggregateKind,
  State extends JsonObject,
  PayloadValue extends JsonObject,
  OutcomeValue extends JsonObject,
>(input: {
  readonly definition: CommandDefinition<State, PayloadValue, OutcomeValue, Kind>;
  readonly aggregate: Aggregate<State, Kind>;
  readonly command: Command<PayloadValue, Kind>;
  readonly observations: readonly Observation[];
  readonly policy?: Partial<RuntimePolicy>;
  readonly progression?: ProgressionDefinition<State, Kind>;
}): ExecutionResult<State, OutcomeValue, PayloadValue, Kind> {
  return executeCommandWithEvaluator({
    definitionId: input.definition.definitionId,
    commandType: input.definition.commandType,
    aggregateKind: input.definition.aggregateKind,
    aggregate: input.aggregate,
    command: input.command,
    observations: input.observations,
    ...(input.policy === undefined ? {} : { policy: input.policy }),
    ...(input.progression === undefined ? {} : { progression: input.progression }),
    evaluate(target, runtimeCommand, context) {
      return {
        kind: "decision",
        decision: input.definition.handle(target, runtimeCommand, context),
      };
    },
  });
}

describe("executeCommand", () => {
  it("returns an accepted deterministic state change", () => {
    const definition = defineCommand<"player", State, Payload, Outcome>({
      definitionId: "increment",
      commandType: "increment",
      aggregateKind: "player",
      handle(target, input) {
        return {
          kind: "accepted",
          nextState: { count: target.state.count + input.payload.amount },
          outcome: { result: "incremented" },
          domainEvents: [],
          effectIntents: [],
          progressionIntents: [],
        };
      },
    });

    const result = executeCommand({
      definition,
      aggregate,
      command,
      observations: [],
    });

    expect(result).toMatchObject({ kind: "recorded", record: { terminal: "accepted" } });
    if (result.kind !== "recorded") throw new Error("expected recorded acceptance");
    expect(result.aggregate.stateVersion).toBe(5);
    expect(result.aggregate.state).toEqual({ count: 3 });
    expect(result.record).toMatchObject({
      priorStateVersion: 4,
      resultingStateVersion: 5,
    });
    expect(aggregate.stateVersion).toBe(4);
  });

  it("returns semantic rejection without changing state", () => {
    const definition = defineCommand<"player", State, Payload, Outcome>({
      definitionId: "reject",
      commandType: "increment",
      aggregateKind: "player",
      handle() {
        return { kind: "rejected", outcome: { result: "not-allowed" } };
      },
    });

    const result = executeCommand({
      definition,
      aggregate,
      command,
      observations: [],
    });

    expect(result).toMatchObject({ kind: "recorded", record: { terminal: "rejected" } });
    if (result.kind !== "recorded") throw new Error("expected recorded rejection");
    expect(result.aggregate).toEqual(aggregate);
    expect(result.record).toMatchObject({
      priorStateVersion: 4,
      resultingStateVersion: 4,
    });
    expect(result.record).not.toHaveProperty("aggregateAfter");
  });

  it("returns a true no-op without advancing the version", () => {
    const definition = defineCommand<"player", State, Payload, Outcome>({
      definitionId: "noop",
      commandType: "increment",
      aggregateKind: "player",
      handle() {
        return { kind: "no-op", outcome: { result: "unchanged" } };
      },
    });

    const result = executeCommand({
      definition,
      aggregate,
      command,
      observations: [],
    });

    expect(result).toMatchObject({ kind: "recorded", record: { terminal: "no-op" } });
    if (result.kind !== "recorded") throw new Error("expected recorded no-op");
    expect(result.aggregate.stateVersion).toBe(4);
    expect(result.record).toMatchObject({
      priorStateVersion: 4,
      resultingStateVersion: 4,
    });
    expect(result.record).not.toHaveProperty("aggregateAfter");
  });

  it("accepts a progression-only fact and advances the version exactly once", () => {
    const progression = defineProgression<"player", State>({
      aggregateKind: "player",
      graphId: "counter.progression",
      nodes: [{ nodeId: "counter", initialStatus: "active" }],
      transitions: [
        {
          transitionId: "counter-complete",
          targetNodeId: "counter",
          from: ["active"],
          to: "completed",
          priority: 0,
          trigger: "intent",
        },
      ],
    });
    const aggregateWithProgression: Aggregate<State, "player"> = {
      ...aggregate,
      progression: initialProgression(progression),
    };
    const definition = defineCommand<"player", State, Payload, Outcome>({
      definitionId: "progression-only",
      commandType: "increment",
      aggregateKind: "player",
      handle() {
        return {
          kind: "accepted",
          outcome: { result: "progressed" },
          domainEvents: [],
          effectIntents: [],
          progressionIntents: [{ transitionId: "counter-complete" }],
        };
      },
    });

    const result = executeCommand({
      definition,
      aggregate: aggregateWithProgression,
      command,
      observations: [],
      progression,
    });

    expect(result).toMatchObject({
      kind: "recorded",
      aggregate: {
        state: aggregate.state,
        stateVersion: 5,
        progression: {
          graphId: "counter.progression",
          nodes: [{ nodeId: "counter", status: "completed" }],
        },
      },
      record: {
        terminal: "accepted",
        priorStateVersion: 4,
        resultingStateVersion: 5,
      },
    });
  });

  it.each([
    {
      name: "handler throw",
      handle: () => {
        throw new Error("host prose must not enter the record");
      },
      code: "handler-threw",
    },
    {
      name: "promise-shaped result",
      handle: () => Promise.resolve({ kind: "rejected", outcome: { result: "late" } }),
      code: "handler-result-invalid",
    },
  ])("returns invalid for $name", ({ handle, code }) => {
    const definition = defineCommand<"player", State, Payload, Outcome>({
      definitionId: "invalid",
      commandType: "increment",
      aggregateKind: "player",
      handle: handle as never,
    });

    const result = executeCommand({
      definition,
      aggregate,
      command,
      observations: [],
    });

    expect(result).toMatchObject({ kind: "recorded", record: { terminal: "invalid" } });
    if (result.kind === "recorded") {
      expect(result.record.diagnostics[0]?.code).toBe(code);
      expect(result.record).toMatchObject({
        priorStateVersion: 4,
        resultingStateVersion: 4,
      });
    }
    expect(JSON.stringify(result)).not.toContain("host prose");
  });

  it("produces identical complete records across 100 executions", () => {
    const definition = defineCommand<"player", State, Payload, Outcome>({
      definitionId: "repeat",
      commandType: "increment",
      aggregateKind: "player",
      handle(target, input) {
        return {
          kind: "accepted",
          nextState: { count: target.state.count + input.payload.amount },
          outcome: { result: "ok" },
          domainEvents: [],
          effectIntents: [],
          progressionIntents: [],
        };
      },
    });

    const texts = Array.from({ length: 100 }, () => {
      const result = executeCommand({
        definition,
        aggregate,
        command,
        observations: [],
      });
      if (!("record" in result)) throw new Error("expected recorded result");
      const canonical = canonicalizeValue(result.record);
      if (canonical.kind === "invalid") throw new Error(canonical.diagnostic.code);
      return canonical.canonical.text;
    });

    expect(new Set(texts).size).toBe(1);
  });

  it("diagnoses malformed JavaScript command and handler output shapes", () => {
    const definition = defineCommand<"player", State, Payload, Outcome>({
      definitionId: "shape",
      commandType: "increment",
      aggregateKind: "player",
      handle: (() => ({
        kind: "accepted",
        nextState: { count: 2 },
        outcome: { result: "invalid" },
        domainEvents: [1],
        effectIntents: [],
        progressionIntents: [],
      })) as never,
    });

    const malformedCommand = executeCommand({
      definition,
      aggregate,
      command: {} as never,
      observations: [],
    });
    const malformedOutput = executeCommand({ definition, aggregate, command, observations: [] });

    expect(malformedCommand.kind).toBe("preflight-invalid");
    if (malformedCommand.kind === "preflight-invalid") {
      expect(malformedCommand.diagnostics[0]?.code).toBe("command-invalid");
    }
    expect(malformedOutput).toMatchObject({
      kind: "recorded",
      record: { terminal: "invalid" },
    });
    if (malformedOutput.kind === "recorded") {
      expect(malformedOutput.record.diagnostics[0]?.code).toBe("handler-result-invalid");
    }
  });

  it("returns preflight invalidity for non-canonical inputs without throwing", () => {
    const definition = defineCommand<"player", State, Payload, Outcome>({
      definitionId: "preflight",
      commandType: "increment",
      aggregateKind: "player",
      handle: () => ({ kind: "rejected", outcome: { result: "unused" } }),
    });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    const cyclicCommandPayload: Record<string, unknown> = {};
    cyclicCommandPayload.self = cyclicCommandPayload;
    const inputs = [
      {
        definition,
        aggregate: { ...aggregate, state: cyclic as never },
        command,
        observations: [],
      },
      {
        definition,
        aggregate,
        command: { ...command, payload: cyclicCommandPayload as never },
        observations: [],
      },
      {
        definition,
        aggregate,
        command,
        observations: [{ kind: "clock", key: "now" } as never],
      },
      {
        definition,
        aggregate,
        command,
        observations: [],
        policy: { maxCanonicalNodes: -1 },
      },
    ];

    for (const input of inputs) {
      expect(() => executeCommand(input)).not.toThrow();
      const result = executeCommand(input);
      expect(result).toMatchObject({ kind: "preflight-invalid" });
      expect("record" in result).toBe(false);
      expect("aggregate" in result).toBe(false);
    }
  });

  it.each([NaN, Infinity, -Infinity, -1, "many"])(
    "returns canonical preflight invalidity for malformed policy value %s",
    (maxCanonicalNodes) => {
      const definition = defineCommand<"player", State, Payload, Outcome>({
        definitionId: "policy",
        commandType: "increment",
        aggregateKind: "player",
        handle: () => ({ kind: "rejected", outcome: { result: "unused" } }),
      });
      const input = {
        definition,
        aggregate,
        command,
        observations: [],
        policy: { maxCanonicalNodes },
      } as never;

      expect(() => executeCommand(input)).not.toThrow();
      const result = executeCommand(input);
      expect(result).toMatchObject({
        kind: "preflight-invalid",
        diagnostics: [
          {
            code: "runtime-policy-invalid",
            details: {
              field: "maxCanonicalNodes",
              reason: "non-negative-safe-integer-required",
            },
          },
        ],
      });
      expect("record" in result).toBe(false);
      expect("aggregate" in result).toBe(false);
      expect(canonicalizeValue(result).kind).toBe("valid");
    },
  );

  it.each(["definitionId", "commandType"] as const)(
    "rejects a non-canonical static %s",
    (field) => {
      expect(() =>
        defineCommand({
          definitionId: "identity",
          commandType: "increment",
          aggregateKind: "player",
          handle: () => ({ kind: "rejected", outcome: { result: "unused" } }),
          [field]: "invalid\ud800",
        } as never),
      ).toThrow("canonical non-empty string");
    },
  );

  it("does not impose the component node limit again on the assembled record", () => {
    const definition = defineCommand<"player", State, Payload, Outcome>({
      definitionId: "record-budget",
      commandType: "increment",
      aggregateKind: "player",
      handle: () => ({ kind: "rejected", outcome: { result: "bounded" } }),
    });

    const result = executeCommand({
      definition,
      aggregate,
      command,
      observations: [],
      policy: { maxCanonicalNodes: 20 },
    });

    expect(result).toMatchObject({ kind: "recorded", record: { terminal: "rejected" } });
    if (result.kind === "recorded") {
      expect(Object.isFrozen(result.record)).toBe(true);
      expect(Object.isFrozen(result.record.observations)).toBe(true);
      expect(Object.isFrozen(result.record.observationTrace)).toBe(true);
      expect(Object.isFrozen(result.record.progressionTrace)).toBe(true);
      expect(Object.isFrozen(result.record.diagnostics)).toBe(true);
    }
  });
});

describe("executable aggregate model initialization", () => {
  it("contains initializer exceptions as a stable invalid result without a partial aggregate", () => {
    const stateSchema: RuntimeSchema<State> = {
      id: "counter.state",
      schemaDigest: "sha256:6666666666666666666666666666666666666666666666666666666666666666",
      validate(value) {
        if (
          value !== null &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          "count" in value &&
          typeof value.count === "number"
        ) {
          return { valid: true, value: { count: value.count } };
        }
        return { valid: false, diagnostics: [] };
      },
    };
    const initializationSchema: RuntimeSchema<JsonObject> = {
      id: "counter.initialization",
      schemaDigest: "sha256:7777777777777777777777777777777777777777777777777777777777777777",
      validate(value) {
        if (
          value !== null &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          "seed" in value &&
          typeof value.seed === "number"
        ) {
          return { valid: true, value: { seed: value.seed } };
        }
        return { valid: false, diagnostics: [] };
      },
    };
    const model: ResolvedAggregateModel<"player", State> = {
      modelId: "counter.player",
      aggregateKind: "player",
      authority: "local",
      stateSchema,
      initializationSchema,
      initializeState(input) {
        throw new Error(`sensitive initializer detail: ${String(input.seed)}`);
      },
      commandsByType: {},
      eventSchemas: {},
      effectSchemas: {},
    };
    const executableModel = bindExecutableAggregateModel(model);

    const initialize = (seed: number) => executableModel.initialize({ seed });
    expect(() => initialize(1)).not.toThrow();

    const first = initialize(1);
    const second = initialize(2);
    expect(first).toEqual(second);
    expect(first).toEqual({
      kind: "invalid",
      diagnostics: [
        {
          code: "initializer-threw",
          details: { modelId: "counter.player" },
        },
      ],
    });
    expect("aggregate" in first).toBe(false);
  });

  it("narrows erased model state and command payload before invoking typed logic", () => {
    const stateSchema: RuntimeSchema<State> = {
      id: "counter.state",
      schemaDigest: "sha256:8888888888888888888888888888888888888888888888888888888888888888",
      validate(value) {
        if (
          value !== null &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          "count" in value &&
          typeof value.count === "number"
        ) {
          return { valid: true, value: { count: value.count } };
        }
        return { valid: false, diagnostics: [] };
      },
    };
    const initializationSchema: RuntimeSchema<JsonObject> = {
      id: "counter.initialization",
      schemaDigest: "sha256:9999999999999999999999999999999999999999999999999999999999999999",
      validate: () => ({ valid: true, value: {} }),
    };
    const payloadSchema: RuntimeSchema<Payload> = {
      id: "counter.increment.payload",
      schemaDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      validate(value) {
        if (
          value !== null &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          "amount" in value &&
          typeof value.amount === "number"
        ) {
          return { valid: true, value: { amount: value.amount } };
        }
        return { valid: false, diagnostics: [] };
      },
    };
    const outcomeSchema: RuntimeSchema<Outcome> = {
      id: "counter.increment.outcome",
      schemaDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      validate(value) {
        if (
          value !== null &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          "result" in value &&
          typeof value.result === "string"
        ) {
          return { valid: true, value: { result: value.result } };
        }
        return { valid: false, diagnostics: [] };
      },
    };
    let handlerCalls = 0;
    const binding = resolveCommandBinding({
      registrationId: "counter.increment",
      definition: defineCommand<"player", State, Payload, Outcome>({
        definitionId: "counter.increment",
        commandType: "increment",
        aggregateKind: "player",
        handle(target, input) {
          handlerCalls += 1;
          return {
            kind: "accepted",
            nextState: { count: target.state.count + input.payload.amount },
            outcome: { result: "incremented" },
            domainEvents: [],
            effectIntents: [],
            progressionIntents: [],
          };
        },
      }),
      payloadSchema,
      outcomeSchema,
    });
    const executableModel = bindExecutableAggregateModel({
      modelId: "counter.player",
      aggregateKind: "player",
      authority: "local",
      stateSchema,
      initializationSchema,
      initializeState: () => ({ count: 0 }),
      commandsByType: { increment: binding },
      eventSchemas: {},
      effectSchemas: {},
    });
    const erasedAggregate: Aggregate<JsonObject, "player"> = aggregate;

    const invalidPayloadResult = executableModel.execute({
      aggregate: erasedAggregate,
      command: { ...command, payload: { amount: "invalid" } },
      observations: [],
    });
    expect(invalidPayloadResult).toMatchObject({
      kind: "recorded",
      record: {
        terminal: "invalid",
        diagnostics: [{ code: "command-payload-invalid" }],
      },
    });
    expect(handlerCalls).toBe(0);

    const acceptedResult = executableModel.execute({
      aggregate: erasedAggregate,
      command,
      observations: [],
    });
    expect(acceptedResult).toMatchObject({
      kind: "recorded",
      aggregate: { state: { count: 3 }, stateVersion: 5 },
      record: { terminal: "accepted" },
    });
    expect(handlerCalls).toBe(1);

    const invalidStateResult = executableModel.execute({
      aggregate: { ...erasedAggregate, state: { count: "invalid" } },
      command,
      observations: [],
    });
    expect(invalidStateResult).toMatchObject({
      kind: "preflight-invalid",
      diagnostics: [{ code: "aggregate-state-invalid" }],
    });
    expect(handlerCalls).toBe(1);
  });
});

describe("resolved output schema validation", () => {
  type ValidationPayload = JsonObject & {
    readonly output: "outcome" | "event" | "effect" | "prototype-event" | "prototype-effect";
  };
  type ValidationEvent = JsonObject & { readonly type: "counter.changed"; readonly count: number };
  type ValidationEffect = JsonObject & {
    readonly type: "counter.notify";
    readonly channel: string;
  };

  const schema = <Value extends JsonObject>(input: {
    readonly id: string;
    readonly digest: RuntimeSchema<Value>["schemaDigest"];
    readonly accepts: (value: unknown) => value is Value;
  }): RuntimeSchema<Value> => ({
    id: input.id,
    schemaDigest: input.digest,
    validate(value) {
      return input.accepts(value) ? { valid: true, value } : { valid: false, diagnostics: [] };
    },
  });
  const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const stateSchema = schema<State>({
    id: "counter.state",
    digest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    accepts: (value): value is State => isObject(value) && typeof value.count === "number",
  });
  const initializationSchema = schema<JsonObject>({
    id: "counter.initialization",
    digest: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    accepts: (value): value is JsonObject => isObject(value),
  });
  const payloadSchema = schema<ValidationPayload>({
    id: "counter.validate.payload",
    digest: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    accepts: (value): value is ValidationPayload =>
      isObject(value) &&
      ["outcome", "event", "effect", "prototype-event", "prototype-effect"].includes(
        String(value.output),
      ),
  });
  const outcomeSchema = schema<Outcome>({
    id: "counter.validate.outcome",
    digest: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    accepts: (value): value is Outcome => isObject(value) && typeof value.result === "string",
  });
  const eventSchema = schema<ValidationEvent>({
    id: "counter.changed",
    digest: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    accepts: (value): value is ValidationEvent =>
      isObject(value) && value.type === "counter.changed" && typeof value.count === "number",
  });
  const effectSchema = schema<ValidationEffect>({
    id: "counter.notify",
    digest: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    accepts: (value): value is ValidationEffect =>
      isObject(value) && value.type === "counter.notify" && typeof value.channel === "string",
  });
  const binding = resolveCommandBinding({
    registrationId: "counter.validate",
    definition: defineCommand<"player", State, ValidationPayload, Outcome>({
      definitionId: "counter.validate",
      commandType: "validate-output",
      aggregateKind: "player",
      handle(target, input) {
        return {
          kind: "accepted",
          nextState: { count: target.state.count + 1 },
          outcome:
            input.payload.output === "outcome" ? ({ result: 7 } as never) : { result: "validated" },
          domainEvents:
            input.payload.output === "event"
              ? [{ type: "counter.changed", count: "invalid" }]
              : input.payload.output === "prototype-event"
                ? [{ type: "constructor" }]
                : [],
          effectIntents:
            input.payload.output === "effect"
              ? [{ type: "counter.notify", channel: 7 }]
              : input.payload.output === "prototype-effect"
                ? [{ type: "toString" }]
                : [],
          progressionIntents: [],
        };
      },
    }),
    payloadSchema,
    outcomeSchema,
  });
  const executable = bindExecutableAggregateModel({
    modelId: "counter.player",
    aggregateKind: "player",
    authority: "local",
    stateSchema,
    initializationSchema,
    initializeState: () => ({ count: 0 }),
    commandsByType: { "validate-output": binding },
    eventSchemas: { "counter.changed": eventSchema },
    effectSchemas: { "counter.notify": effectSchema },
  });

  it.each([
    ["outcome", "counter.validate.outcome"],
    ["event", "counter.changed"],
    ["effect", "counter.notify"],
  ] as const)("records invalid %s output before exposing an aggregate", (output, schemaId) => {
    const result = executeResolvedCommand({
      model: executable,
      aggregate,
      command: {
        id: `validate-${output}`,
        type: "validate-output",
        target: { kind: "player", id: aggregate.aggregateId },
        expectedStateVersion: aggregate.stateVersion,
        payload: { output },
      },
      observations: [],
    });

    expect(result).toMatchObject({
      kind: "recorded",
      aggregate,
      record: {
        terminal: "invalid",
        priorStateVersion: 4,
        resultingStateVersion: 4,
        diagnostics: [{ details: { schemaId } }],
      },
    });
  });

  it.each([
    ["prototype-event", "domain-event", "constructor"],
    ["prototype-effect", "effect-intent", "toString"],
  ] as const)(
    "treats inherited object key %s as an undeclared output schema",
    (output, outputKind, type) => {
      const result = executeResolvedCommand({
        model: executable,
        aggregate,
        command: {
          id: `validate-${output}`,
          type: "validate-output",
          target: { kind: "player", id: aggregate.aggregateId },
          expectedStateVersion: aggregate.stateVersion,
          payload: { output },
        },
        observations: [],
      });

      expect(result).toMatchObject({
        kind: "recorded",
        aggregate,
        record: {
          terminal: "invalid",
          diagnostics: [
            {
              code: "handler-result-invalid",
              details: { output: outputKind, reason: "schema-missing", type },
            },
          ],
        },
      });
    },
  );
});
