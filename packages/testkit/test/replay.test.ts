import { describe, expect, it } from "vitest";

import {
  defineCommand,
  executeCommand,
  type Aggregate,
  type Command,
  type JsonObject,
} from "@plotpoint/runtime";
import { replayScenario } from "@plotpoint/testkit";

type State = JsonObject & { readonly value: number };

const aggregate: Aggregate<State, "player"> = {
  kind: "player",
  id: "p1",
  schemaVersion: 1,
  stateVersion: 0,
  authority: "local",
  state: { value: 0 },
};
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
      definitionId: "replay.v1",
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
    const original = executeCommand({ definition, aggregate, command, observations: [] });
    if (!("record" in original)) throw new Error("expected recorded result");

    const replay = replayScenario({ record: original.record, definition });

    expect(replay.kind).toBe("match");
  });

  it("reports the first divergent record path", () => {
    const originalDefinition = defineCommand<"player", State, JsonObject, JsonObject>({
      definitionId: "replay.v1",
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
    const original = executeCommand({
      definition: originalDefinition,
      aggregate,
      command,
      observations: [],
    });
    if (!("record" in original)) throw new Error("expected recorded result");

    const replay = replayScenario({ record: original.record, definition: changedDefinition });

    expect(replay.kind).toBe("mismatch");
    if (replay.kind === "mismatch") expect(replay.path).toBe("/aggregateAfter/state/value");
  });
});
