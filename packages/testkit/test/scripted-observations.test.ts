import { describe, expect, it } from "vitest";

import {
  defineCommand,
  executeCommand,
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
    const aggregate: Aggregate<State> = {
      kind: "player",
      id: "p1",
      schemaVersion: 1,
      stateVersion: 0,
      authority: "local",
      state: { value: "" },
    };
    const command: Command = {
      id: "c1",
      type: "observe",
      target: { kind: "player", id: "p1" },
      expectedStateVersion: 0,
      payload: {},
    };
    const definition = defineCommand<State, JsonObject, JsonObject>({
      definitionId: "observe.v1",
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

    const missing = executeCommand({ definition, aggregate, command, observations: [] });
    const wrongOrder = executeCommand({
      definition,
      aggregate,
      command,
      observations: [identifier("id-1")],
    });

    expect(missing.kind).toBe("invalid");
    expect(wrongOrder.kind).toBe("invalid");
    if (missing.kind === "invalid")
      expect(missing.diagnostics[0]?.code).toBe("observation-exhausted");
    if (wrongOrder.kind === "invalid") {
      expect(wrongOrder.diagnostics[0]?.code).toBe("observation-order-mismatch");
    }

    const harness = createRuntimeHarness();
    expect(() =>
      harness.run({
        name: "unused observation",
        definition: defineCommand<State, JsonObject, JsonObject>({
          definitionId: "unused.v1",
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
        }),
        aggregate,
        command,
        observations: [clock(1)],
      }),
    ).toThrow(/observation-unused/);
  });
});
