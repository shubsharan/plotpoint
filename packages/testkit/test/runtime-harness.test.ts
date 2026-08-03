import { describe, expect, it } from "vitest";

import { defineCommand, type Aggregate, type Command, type JsonObject } from "@plotpoint/runtime";
import { clock, createRuntimeHarness } from "@plotpoint/testkit";

type State = JsonObject & { readonly count: number };

function fixture(): {
  aggregate: Aggregate<State, "player">;
  command: Command<JsonObject, "player">;
} {
  return {
    aggregate: {
      kind: "player",
      id: "p1",
      schemaVersion: 1,
      stateVersion: 0,
      authority: "local",
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
      definitionId: "repeat.v1",
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
      definition,
      aggregate,
      command,
      observations: [],
    });

    expect(result.kind).toBe("accepted");
    if (result.kind !== "accepted") throw new Error("expected accepted");
    expect(result.record.terminal).toBe("accepted");
  });

  it("reports the first material path for nondeterministic repeats", () => {
    const { aggregate, command } = fixture();
    let count = 0;
    const definition = defineCommand<"player", State, JsonObject, JsonObject>({
      definitionId: "vary.v1",
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
        definition,
        aggregate,
        command,
        observations: [],
      }),
    ).toThrow(/\/aggregate\/state\/count/);
  });

  it("detects caller and non-target mutation", () => {
    const source = fixture();
    const nonTarget: Aggregate<State> = {
      ...source.aggregate,
      kind: "team",
      id: "team-1",
      state: { count: 0 },
    };
    const definition = defineCommand<"player", State, JsonObject, JsonObject>({
      definitionId: "mutation.v1",
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
        definition,
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
      definitionId: "consume.v1",
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
        definition,
        aggregate,
        command,
        observations: [clock(1)],
      }).kind,
    ).toBe("accepted");
  });
});
