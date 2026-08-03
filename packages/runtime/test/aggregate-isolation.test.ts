import { describe, expect, it, vi } from "vitest";

import {
  defineCommand,
  executeCommand,
  type Aggregate,
  type AggregateKind,
  type Command,
  type JsonObject,
} from "@plotpoint/runtime";

type State = JsonObject & { readonly nested: { readonly value: number } };
type Outcome = JsonObject & { readonly result: string };

function aggregateFor<Kind extends AggregateKind>(
  kind: Kind,
  stateVersion = 2,
): Aggregate<State, Kind> {
  return {
    kind,
    id: `${kind}-1`,
    schemaVersion: 1,
    stateVersion,
    authority: "local",
    state: { nested: { value: 1 } },
  };
}

function commandFor<Kind extends AggregateKind>(
  kind: Kind,
  expectedStateVersion = 2,
): Command<JsonObject, Kind> {
  return {
    id: `command-${kind}`,
    type: "change",
    target: { kind, id: `${kind}-1` },
    expectedStateVersion,
    payload: {},
  };
}

describe("aggregate isolation", () => {
  it.each(["player", "team", "session"] as const)(
    "advances only an accepted %s target once",
    (kind) => {
      const source = aggregateFor(kind);
      const definition = defineCommand<typeof kind, State, JsonObject, Outcome>({
        definitionId: `change-${kind}.v1`,
        commandType: "change",
        aggregateKind: kind,
        handle() {
          return {
            kind: "accepted",
            nextState: { nested: { value: 2 } },
            outcome: { result: "changed" },
            domainEvents: [],
            effectIntents: [],
            progressionIntents: [],
          };
        },
      });

      const result = executeCommand({
        definition,
        aggregate: source,
        command: commandFor(kind),
        observations: [],
      });

      expect(result.kind).toBe("accepted");
      if (result.kind !== "accepted") throw new Error("expected accepted");
      expect(result.aggregate.stateVersion).toBe(3);
      expect(source.stateVersion).toBe(2);
      expect(source.state.nested.value).toBe(1);
    },
  );

  it("short-circuits stale versions before the handler or observations", () => {
    const handler = vi.fn();
    const definition = defineCommand<"player", State, JsonObject, Outcome>({
      definitionId: "stale.v1",
      commandType: "change",
      aggregateKind: "player",
      handle: handler,
    });
    const result = executeCommand({
      definition,
      aggregate: aggregateFor("player"),
      command: commandFor("player", 1),
      observations: [{ kind: "clock", key: "now", value: 1 }],
    });

    expect(result.kind).toBe("invalid");
    expect(handler).not.toHaveBeenCalled();
    if (result.kind !== "invalid" || result.phase !== "execution") {
      throw new Error("expected recorded invalid result");
    }
    expect(result.record.observationTrace).toEqual([]);
  });

  it("rejects an exact target mismatch", () => {
    const definition = defineCommand<"player", State, JsonObject, Outcome>({
      definitionId: "target.v1",
      commandType: "change",
      aggregateKind: "player",
      handle: vi.fn(),
    });
    const command = {
      ...commandFor("player"),
      target: { kind: "player" as const, id: "other" },
    };

    const result = executeCommand({
      definition,
      aggregate: aggregateFor("player"),
      command,
      observations: [],
    });

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid")
      expect(result.diagnostics[0]?.code).toBe("command-target-mismatch");
  });

  it("rejects version overflow without changing the target", () => {
    const source = aggregateFor("team", Number.MAX_SAFE_INTEGER);
    const definition = defineCommand<"team", State, JsonObject, Outcome>({
      definitionId: "overflow.v1",
      commandType: "change",
      aggregateKind: "team",
      handle() {
        return {
          kind: "accepted",
          nextState: { nested: { value: 2 } },
          outcome: { result: "changed" },
          domainEvents: [],
          effectIntents: [],
          progressionIntents: [],
        };
      },
    });

    const result = executeCommand({
      definition,
      aggregate: source,
      command: commandFor("team", Number.MAX_SAFE_INTEGER),
      observations: [],
    });

    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid" || result.phase !== "execution") {
      throw new Error("expected recorded invalid result");
    }
    expect(result.aggregate).toEqual(source);
  });

  it("isolates shared aliases and caller-owned inputs", () => {
    const shared = { value: 1 };
    const source = { ...aggregateFor("session"), state: { nested: shared } };
    const nonTarget = { ...aggregateFor("team"), state: { nested: shared } };
    const definition = defineCommand<"session", State, JsonObject, Outcome>({
      definitionId: "alias.v1",
      commandType: "change",
      aggregateKind: "session",
      handle(target) {
        expect(target.state.nested).not.toBe(shared);
        return {
          kind: "accepted",
          nextState: { nested: { value: 2 } },
          outcome: { result: "changed" },
          domainEvents: [],
          effectIntents: [],
          progressionIntents: [],
        };
      },
    });

    executeCommand({
      definition,
      aggregate: source,
      command: commandFor("session"),
      observations: [],
    });

    expect(source.state.nested.value).toBe(1);
    expect(nonTarget.state.nested.value).toBe(1);
  });
});
