import { describe, expect, it } from "vitest";

import { defineCommand, type Aggregate, type Command, type JsonObject } from "@plotpoint/runtime";
import { createRuntimeHarness } from "@plotpoint/testkit";

const aggregate: Aggregate<JsonObject, "player"> = {
  kind: "player",
  id: "p1",
  schemaVersion: 1,
  stateVersion: 0,
  authority: "local",
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
      definitionId: "audit.v1",
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

    expect(() =>
      createRuntimeHarness({ auditKnownAmbientApis: true }).run({
        name: "ambient access",
        definition,
        aggregate,
        command,
        observations: [],
      }),
    ).toThrow(`ambient-authority-used:${_name}`);
    expect(Date.now).toBe(originalNow);
    expect(() => Date.now()).not.toThrow();
  });
});
