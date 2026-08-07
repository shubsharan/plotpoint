import { describe, expect, it } from "vitest";

import {
  defineCommand,
  resolveCommandBinding,
  type Aggregate,
  type Command,
  type JsonObject,
} from "@plotpoint/runtime";
import {
  capability,
  clock,
  createRuntimeHarness,
  identifier,
  observation,
  random,
} from "@plotpoint/testkit";
import { isJsonObject, modelFixture, runtimeSchema } from "./runtime-model.js";

describe("scripted observations", () => {
  it("constructs canonical clock, identifier, random, generic, and capability entries", () => {
    expect(clock("2030-01-01T00:00:00.000Z")).toEqual({
      kind: "clock",
      key: "now",
      value: "2030-01-01T00:00:00.000Z",
    });
    expect(identifier("id-1")).toEqual({ kind: "identifier", key: "next", value: "id-1" });
    expect(random(0.25)).toEqual({ kind: "random", key: "next", value: 0.25 });
    expect(observation("weather", "temperature", 20)).toEqual({
      kind: "weather",
      key: "temperature",
      value: 20,
    });
    expect(capability("location", { latitude: 1 })).toEqual({
      kind: "capability",
      key: "location",
      value: { latitude: 1 },
    });
  });

  it("rejects non-canonical scripts", () => {
    expect(() => observation("custom", "bad", (() => undefined) as never)).toThrow();
    expect(() => random(Number.NaN)).toThrow();
  });

  it("preserves runtime exhaustion and order diagnostics without fallbacks", () => {
    type State = JsonObject & { readonly value: string };
    const aggregate: Aggregate<State, "player"> = {
      aggregateId: "p1",
      modelId: "observation.player",
      aggregateKind: "player",
      schemaId: "observation.state",
      stateVersion: 0,
      state: { value: "" },
    };
    const command: Command<JsonObject, "player"> = {
      id: "c1",
      type: "observe",
      target: { kind: "player", id: "p1" },
      expectedStateVersion: 0,
      payload: {},
    };
    const definition = defineCommand<"player", State, JsonObject, JsonObject>({
      definitionId: "observe",
      commandType: "observe",
      aggregateKind: "player",
      handle(_target, _command, context) {
        return {
          kind: "accepted",
          nextState: { value: context.take<string>("clock", "now") },
          outcome: {},
          domainEvents: [],
          effectIntents: [],
          progressionIntents: [],
        };
      },
    });

    const jsonSchema = runtimeSchema("observation.json", isJsonObject);
    const stateSchema = runtimeSchema(
      "observation.state",
      (value): value is State =>
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        "value" in value &&
        typeof value.value === "string",
    );
    const observedModel = modelFixture({
      modelId: "observation.player",
      aggregateKind: "player",
      authority: "local",
      stateSchema,
      initializeState: () => ({ value: "" }),
      commandsByType: {
        observe: resolveCommandBinding({
          registrationId: "observe",
          definition,
          payloadSchema: jsonSchema,
          outcomeSchema: jsonSchema,
        }),
      },
    });
    const missing = observedModel.execute({ aggregate, command, observations: [] });
    const wrongOrder = observedModel.execute({
      aggregate,
      command,
      observations: [identifier("id-1")],
    });

    expect(missing).toMatchObject({
      kind: "recorded",
      record: {
        terminal: "invalid",
        diagnostics: [{ code: "observation-exhausted" }],
      },
    });
    expect(wrongOrder).toMatchObject({
      kind: "recorded",
      record: {
        terminal: "invalid",
        diagnostics: [{ code: "observation-order-mismatch" }],
      },
    });

    const harness = createRuntimeHarness();
    const unusedDefinition = defineCommand<"player", State, JsonObject, JsonObject>({
      definitionId: "unused",
      commandType: "observe",
      aggregateKind: "player",
      handle(target) {
        return {
          kind: "accepted",
          nextState: { value: `${target.state.value}changed` },
          outcome: {},
          domainEvents: [],
          effectIntents: [],
          progressionIntents: [],
        };
      },
    });
    const unusedBinding = resolveCommandBinding({
      registrationId: "unused",
      definition: unusedDefinition,
      payloadSchema: jsonSchema,
      outcomeSchema: jsonSchema,
    });
    const model = modelFixture({
      modelId: "observation.player",
      aggregateKind: "player",
      authority: "local",
      stateSchema,
      initializeState: () => ({ value: "" }),
      commandsByType: { observe: unusedBinding },
    });
    expect(() =>
      harness.run({
        name: "unused observation",
        model,
        aggregate,
        command,
        observations: [clock(1)],
      }),
    ).toThrow(/observation-unused/);
  });
});
