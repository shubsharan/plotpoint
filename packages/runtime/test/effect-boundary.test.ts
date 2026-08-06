import { describe, expect, it, vi } from "vitest";

import {
  defineCommand,
  executeCommand,
  type Aggregate,
  type Command,
  type JsonObject,
} from "@plotpoint/runtime";

type State = JsonObject & { readonly done: boolean };
type Outcome = JsonObject & { readonly result: string };

const aggregate: Aggregate<State, "session"> = {
  aggregateId: "s1",
  modelId: "session.model",
  aggregateKind: "session",
  schemaId: "session.state",
  stateVersion: 0,
  state: { done: false },
};
const command: Command<JsonObject, "session"> = {
  id: "c1",
  type: "finish",
  target: { kind: "session", id: "s1" },
  expectedStateVersion: 0,
  payload: {},
};

describe("event and effect boundary", () => {
  it("preserves order and never invokes effect-shaped data", () => {
    const invoked = vi.fn();
    const definition = defineCommand<"session", State, JsonObject, Outcome>({
      definitionId: "finish",
      commandType: "finish",
      aggregateKind: "session",
      handle() {
        return {
          kind: "accepted",
          nextState: { done: true },
          outcome: { result: "finished" },
          domainEvents: [{ order: 1 }, { order: 2 }],
          effectIntents: [{ type: "callback", marker: "effect-handler" }],
          progressionIntents: [],
        };
      },
    });

    const result = executeCommand({ definition, aggregate, command, observations: [] });

    expect(result).toMatchObject({ kind: "recorded", record: { terminal: "accepted" } });
    if (result.kind === "recorded") {
      expect(result.record.domainEvents).toEqual([{ order: 1 }, { order: 2 }]);
      expect(result.record.effectIntents).toEqual([{ marker: "effect-handler", type: "callback" }]);
    }
    expect(invoked).not.toHaveBeenCalled();
  });

  it("accepts an effect-only durable fact and advances the aggregate once", () => {
    const definition = defineCommand<"session", State, JsonObject, Outcome>({
      definitionId: "noop-output",
      commandType: "finish",
      aggregateKind: "session",
      handle(target) {
        return {
          kind: "accepted",
          nextState: target.state,
          outcome: { result: "unchanged" },
          domainEvents: [],
          effectIntents: [{ type: "forbidden" }],
          progressionIntents: [],
        };
      },
    });

    const result = executeCommand({ definition, aggregate, command, observations: [] });

    expect(result).toMatchObject({ kind: "recorded", record: { terminal: "accepted" } });
    if (result.kind === "recorded") {
      expect(result.record.effectIntents).toEqual([{ type: "forbidden" }]);
      expect(result.aggregate.stateVersion).toBe(1);
    }
  });
});
