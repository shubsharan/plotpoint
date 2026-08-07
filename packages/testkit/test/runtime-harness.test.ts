import { describe, expect, it } from "vitest";

import {
  defineCommand,
  resolveCommandBinding,
  type Aggregate,
  type Command,
  type CommandDefinition,
  type JsonObject,
} from "@plotpoint/runtime";
import {
  assertAccepted,
  clock,
  createRuntimeHarness,
  PlotpointAssertionError,
} from "@plotpoint/testkit";
import { isJsonObject, modelFixture, runtimeSchema } from "./runtime-model.js";

type State = JsonObject & { readonly count: number };
const stateSchema = runtimeSchema(
  "counter.state",
  (value): value is State =>
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "count" in value &&
    typeof value.count === "number",
);
const jsonSchema = runtimeSchema("counter.json", isJsonObject);

function executable(definition: CommandDefinition<State, JsonObject, JsonObject, "player">) {
  const binding = resolveCommandBinding({
    registrationId: definition.definitionId,
    definition,
    payloadSchema: jsonSchema,
    outcomeSchema: jsonSchema,
  });
  return modelFixture({
    modelId: "counter.player",
    aggregateKind: "player",
    authority: "local",
    stateSchema,
    initializeState: () => ({ count: 0 }),
    commandsByType: { change: binding },
  });
}

function fixture(): {
  aggregate: Aggregate<State, "player">;
  command: Command<JsonObject, "player">;
} {
  return {
    aggregate: {
      aggregateId: "p1",
      modelId: "counter.player",
      aggregateKind: "player",
      schemaId: "counter.state",
      stateVersion: 0,
      state: { count: 0 },
    },
    command: {
      id: "c1",
      type: "change",
      target: { kind: "player", id: "p1" },
      expectedStateVersion: 0,
      payload: {},
    },
  };
}

describe("runtime harness", () => {
  it("runs a strict scenario 100 times with identical records", () => {
    const { aggregate, command } = fixture();
    const definition = defineCommand<"player", State, JsonObject, JsonObject>({
      definitionId: "repeat",
      commandType: "change",
      aggregateKind: "player",
      handle() {
        return {
          kind: "accepted",
          nextState: { count: 1 },
          outcome: { result: "changed" },
          domainEvents: [],
          effectIntents: [],
          progressionIntents: [],
        };
      },
    });

    const result = createRuntimeHarness({ repeat: 100 }).run({
      name: "repeatable",
      model: executable(definition),
      aggregate,
      command,
      observations: [],
    });

    expect(result).toMatchObject({ kind: "recorded", record: { terminal: "accepted" } });
    if (result.kind !== "recorded") throw new Error("expected recorded result");
    expect(result.record.terminal).toBe("accepted");
  });

  it("reports the first material path for nondeterministic repeats", () => {
    const { aggregate, command } = fixture();
    let count = 0;
    const definition = defineCommand<"player", State, JsonObject, JsonObject>({
      definitionId: "vary",
      commandType: "change",
      aggregateKind: "player",
      handle() {
        count += 1;
        return {
          kind: "accepted",
          nextState: { count },
          outcome: {},
          domainEvents: [],
          effectIntents: [],
          progressionIntents: [],
        };
      },
    });

    expect(() =>
      createRuntimeHarness({ repeat: 2 }).run({
        name: "varies",
        model: executable(definition),
        aggregate,
        command,
        observations: [],
      }),
    ).toThrow(/\/aggregate\/state\/count/);
  });

  it("compares complete records even when repeated aggregate state is identical", () => {
    const { aggregate, command } = fixture();
    let run = 0;
    const definition = defineCommand<"player", State, JsonObject, JsonObject>({
      definitionId: "vary-outcome",
      commandType: "change",
      aggregateKind: "player",
      handle() {
        run += 1;
        return {
          kind: "accepted",
          nextState: { count: 1 },
          outcome: { run },
          domainEvents: [],
          effectIntents: [],
          progressionIntents: [],
        };
      },
    });

    expect(() =>
      createRuntimeHarness({ repeat: 2 }).run({
        name: "outcome-varies",
        model: executable(definition),
        aggregate,
        command,
        observations: [],
      }),
    ).toThrow(/\/record\/outcome\/run/);
  });

  it("rejects an incomplete accepted record instead of asserting from its terminal alone", () => {
    const { aggregate, command } = fixture();
    const incomplete = {
      kind: "recorded",
      aggregate,
      record: {
        definitionId: "incomplete",
        policy: {
          maxCanonicalDepth: 64,
          maxCanonicalNodes: 10_000,
          maxAutomaticTransitions: 100,
        },
        aggregateBefore: aggregate,
        command,
        observations: [],
        observationTrace: [],
        terminal: "accepted",
        outcome: {},
        domainEvents: [],
        effectIntents: [],
        progressionTrace: [],
        diagnostics: [],
      },
    } as never;

    expect(() => assertAccepted(incomplete)).toThrow(PlotpointAssertionError);
  });

  it("detects caller and non-target mutation", () => {
    const source = fixture();
    const nonTarget: Aggregate<State> = {
      ...source.aggregate,
      aggregateKind: "team",
      aggregateId: "team-1",
      modelId: "counter.team",
      state: { count: 0 },
    };
    const definition = defineCommand<"player", State, JsonObject, JsonObject>({
      definitionId: "mutation",
      commandType: "change",
      aggregateKind: "player",
      handle() {
        (source.aggregate.state as { count: number }).count = 9;
        (nonTarget.state as { count: number }).count = 9;
        return {
          kind: "accepted",
          nextState: { count: 1 },
          outcome: {},
          domainEvents: [],
          effectIntents: [],
          progressionIntents: [],
        };
      },
    });

    expect(() =>
      createRuntimeHarness().run({
        name: "mutation",
        model: executable(definition),
        aggregate: source.aggregate,
        command: source.command,
        observations: [],
        nonTargetAggregates: [nonTarget],
      }),
    ).toThrow(/input-mutated/);
  });

  it("enforces exact observation consumption", () => {
    const { aggregate, command } = fixture();
    const definition = defineCommand<"player", State, JsonObject, JsonObject>({
      definitionId: "consume",
      commandType: "change",
      aggregateKind: "player",
      handle(_target, _command, context) {
        context.take("clock", "now");
        return {
          kind: "accepted",
          nextState: { count: 1 },
          outcome: {},
          domainEvents: [],
          effectIntents: [],
          progressionIntents: [],
        };
      },
    });

    expect(
      createRuntimeHarness().run({
        name: "exact",
        model: executable(definition),
        aggregate,
        command,
        observations: [clock(1)],
      }).kind,
    ).toBe("recorded");
  });
});
