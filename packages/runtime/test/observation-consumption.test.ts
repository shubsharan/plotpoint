import { describe, expect, it } from "vitest";

import {
  defineCommand,
  executeCommand,
  type Aggregate,
  type Command,
  type JsonObject,
} from "@plotpoint/runtime";

type State = JsonObject & { readonly seen: string };
type Payload = JsonObject;
type Outcome = JsonObject & { readonly result: string };

const aggregate: Aggregate<State, "player"> = {
  kind: "player",
  id: "p1",
  schemaVersion: 1,
  stateVersion: 0,
  authority: "local",
  state: { seen: "" },
};
const command: Command<Payload, "player"> = {
  id: "c1",
  type: "observe",
  target: { kind: "player", id: "p1" },
  expectedStateVersion: 0,
  payload: {},
};
const definition = defineCommand<"player", State, Payload, Outcome>({
  definitionId: "observe.v1",
  commandType: "observe",
  aggregateKind: "player",
  handle(_target, _input, context) {
    const seen = context.take<string>("clock", "now");
    return {
      kind: "accepted",
      nextState: { seen },
      outcome: { result: "observed" },
      domainEvents: [],
      effectIntents: [],
      progressionIntents: [],
    };
  },
});

describe("ordered observation consumption", () => {
  it("consumes the exact next identity and records its canonical value", () => {
    const result = executeCommand({
      definition,
      aggregate,
      command,
      observations: [{ kind: "clock", key: "now", value: "2030-01-01T00:00:00.000Z" }],
    });

    expect(result.kind).toBe("accepted");
    if (result.kind !== "accepted") throw new Error("expected accepted");
    expect(result.record.observationTrace).toEqual([
      {
        index: 0,
        kind: "clock",
        key: "now",
        value: "2030-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("diagnoses exhaustion without ambient fallback", () => {
    const result = executeCommand({
      definition,
      aggregate,
      command,
      observations: [],
    });

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid")
      expect(result.diagnostics[0]?.code).toBe("observation-exhausted");
  });

  it("diagnoses an out-of-order identity", () => {
    const result = executeCommand({
      definition,
      aggregate,
      command,
      observations: [{ kind: "identifier", key: "next", value: "id-1" }],
    });

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid")
      expect(result.diagnostics[0]?.code).toBe("observation-order-mismatch");
  });
});
