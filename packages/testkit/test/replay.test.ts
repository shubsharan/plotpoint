import { describe, expect, it } from "vitest";

import {
  defineCommand,
  resolveCommandBinding,
  type Aggregate,
  type Command,
  type JsonObject,
} from "@plotpoint/runtime";
import { replayScenario } from "@plotpoint/testkit";
import { isJsonObject, modelFixture, runtimeSchema } from "./runtime-model.js";

type State = JsonObject & { readonly value: number };

const aggregate: Aggregate<State, "player"> = {
  aggregateId: "p1",
  modelId: "replay.player",
  aggregateKind: "player",
  schemaId: "replay.state",
  stateVersion: 0,
  state: { value: 0 },
};
const stateSchema = runtimeSchema(
  "replay.state",
  (value): value is State =>
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "value" in value &&
    typeof value.value === "number",
);
const jsonSchema = runtimeSchema("replay.json", isJsonObject);
const command: Command<JsonObject, "player"> = {
  id: "c1",
  type: "change",
  target: { kind: "player", id: "p1" },
  expectedStateVersion: 0,
  payload: {},
};

describe("record replay", () => {
  it("matches the complete canonical record", () => {
    const definition = defineCommand<"player", State, JsonObject, JsonObject>({
      definitionId: "replay",
      commandType: "change",
      aggregateKind: "player",
      handle() {
        return {
          kind: "accepted",
          nextState: { value: 1 },
          outcome: { result: "ok" },
          domainEvents: [],
          effectIntents: [],
          progressionIntents: [],
        };
      },
    });
    const binding = resolveCommandBinding({
      registrationId: "replay",
      definition,
      payloadSchema: jsonSchema,
      outcomeSchema: jsonSchema,
    });
    const model = modelFixture({
      modelId: "replay.player",
      aggregateKind: "player",
      authority: "local",
      stateSchema,
      initializeState: () => ({ value: 0 }),
      commandsByType: { change: binding },
    });
    const original = model.execute({ aggregate, command, observations: [] });
    if (original.kind !== "recorded") throw new Error("expected recorded result");

    const replay = replayScenario({ record: original.record, model });

    expect(replay.kind).toBe("match");
  });

  it("reports the first divergent record path", () => {
    const originalDefinition = defineCommand<"player", State, JsonObject, JsonObject>({
      definitionId: "replay",
      commandType: "change",
      aggregateKind: "player",
      handle() {
        return {
          kind: "accepted",
          nextState: { value: 1 },
          outcome: {},
          domainEvents: [],
          effectIntents: [],
          progressionIntents: [],
        };
      },
    });
    const changedDefinition = defineCommand<"player", State, JsonObject, JsonObject>({
      ...originalDefinition,
      handle() {
        return {
          kind: "accepted",
          nextState: { value: 2 },
          outcome: {},
          domainEvents: [],
          effectIntents: [],
          progressionIntents: [],
        };
      },
    });
    const originalBinding = resolveCommandBinding({
      registrationId: "replay",
      definition: originalDefinition,
      payloadSchema: jsonSchema,
      outcomeSchema: jsonSchema,
    });
    const changedBinding = resolveCommandBinding({
      registrationId: "replay",
      definition: changedDefinition,
      payloadSchema: jsonSchema,
      outcomeSchema: jsonSchema,
    });
    const originalModel = modelFixture({
      modelId: "replay.player",
      aggregateKind: "player",
      authority: "local",
      stateSchema,
      initializeState: () => ({ value: 0 }),
      commandsByType: { change: originalBinding },
    });
    const changedModel = modelFixture({
      modelId: "replay.player",
      aggregateKind: "player",
      authority: "local",
      stateSchema,
      initializeState: () => ({ value: 0 }),
      commandsByType: { change: changedBinding },
    });
    const original = originalModel.execute({ aggregate, command, observations: [] });
    if (original.kind !== "recorded") throw new Error("expected recorded result");

    const replay = replayScenario({ record: original.record, model: changedModel });

    expect(replay.kind).toBe("mismatch");
    if (replay.kind === "mismatch") expect(replay.path).toBe("/aggregateAfter/state/value");
  });
});
