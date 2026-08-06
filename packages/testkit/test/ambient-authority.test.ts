import { describe, expect, it } from "vitest";

import {
  defineCommand,
  resolveCommandBinding,
  type Aggregate,
  type Command,
  type JsonObject,
} from "@plotpoint/runtime";
import { createRuntimeHarness } from "@plotpoint/testkit";
import { isJsonObject, modelFixture, runtimeSchema } from "./runtime-model.js";

const aggregate: Aggregate<JsonObject, "player"> = {
  aggregateId: "p1",
  modelId: "audit.player",
  aggregateKind: "player",
  schemaId: "audit.state",
  stateVersion: 0,
  state: { value: 0 },
};
const command: Command<JsonObject, "player"> = {
  id: "c1",
  type: "audit",
  target: { kind: "player", id: "p1" },
  expectedStateVersion: 0,
  payload: {},
};

describe.sequential("ambient authority audit", () => {
  it.each([
    ["clock", () => Date.now()],
    ["randomness", () => Math.random()],
    ["identifier", () => globalThis.crypto.randomUUID()],
    ["network", () => globalThis.fetch("https://example.invalid")],
    ["storage", () => globalThis.localStorage.getItem("value")],
  ] as const)("blocks %s access and restores the global", (_name, access) => {
    const originalNow = Date.now;
    const definition = defineCommand<"player", JsonObject, JsonObject, JsonObject>({
      definitionId: "audit",
      commandType: "audit",
      aggregateKind: "player",
      handle() {
        access();
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
    const jsonSchema = runtimeSchema("audit.json", isJsonObject);
    const binding = resolveCommandBinding({
      registrationId: "audit",
      definition,
      payloadSchema: jsonSchema,
      outcomeSchema: jsonSchema,
    });
    const model = modelFixture({
      modelId: "audit.player",
      aggregateKind: "player",
      authority: "local",
      stateSchema: runtimeSchema("audit.state", isJsonObject),
      initializeState: () => ({ value: 0 }),
      commandsByType: { audit: binding },
    });

    expect(() =>
      createRuntimeHarness({ auditKnownAmbientApis: true }).run({
        name: "ambient access",
        model,
        aggregate,
        command,
        observations: [],
      }),
    ).toThrow(`ambient-authority-used:${_name}`);
    expect(Date.now).toBe(originalNow);
    expect(() => Date.now()).not.toThrow();
  });
});
