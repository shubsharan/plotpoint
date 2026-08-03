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
  kind: "session",
  id: "s1",
  schemaVersion: 1,
  stateVersion: 0,
  authority: "server",
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
      definitionId: "finish.v1",
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

    expect(result.kind).toBe("accepted");
    if (result.kind === "accepted") {
      expect(result.domainEvents).toEqual([{ order: 1 }, { order: 2 }]);
      expect(result.effectIntents).toEqual([{ marker: "effect-handler", type: "callback" }]);
    }
    expect(invoked).not.toHaveBeenCalled();
  });

  it("rejects commit-dependent outputs on a no-op", () => {
    const definition = defineCommand<"session", State, JsonObject, Outcome>({
      definitionId: "noop-output.v1",
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

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") expect(result.diagnostics[0]?.code).toBe("no-op-output-invalid");
  });
});
