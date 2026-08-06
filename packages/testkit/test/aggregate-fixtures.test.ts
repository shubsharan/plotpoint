import { describe, expect, it } from "vitest";

import { type Aggregate, type JsonObject, type ProgressionInstance } from "@plotpoint/runtime";
import { playerFixture, sessionFixture, teamFixture } from "@plotpoint/testkit";
import { modelFixture, runtimeSchema } from "./runtime-model.js";

type NestedState = JsonObject & {
  readonly nested: { readonly value: number };
};

function isNestedState(value: unknown): value is NestedState {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "nested" in value &&
    value.nested !== null &&
    typeof value.nested === "object" &&
    !Array.isArray(value.nested) &&
    "value" in value.nested &&
    typeof value.nested.value === "number"
  );
}

const stateSchema = runtimeSchema("fixture.state", isNestedState);
const initialState: NestedState = { nested: { value: 0 } };
const playerModel = modelFixture({
  modelId: "fixture.player",
  aggregateKind: "player",
  authority: "local",
  stateSchema,
  initializeState: () => initialState,
});
const teamModel = modelFixture({
  modelId: "fixture.team",
  aggregateKind: "team",
  authority: "server",
  stateSchema,
  initializeState: () => initialState,
});
const sessionModel = modelFixture({
  modelId: "fixture.session",
  aggregateKind: "session",
  authority: "server",
  stateSchema,
  initializeState: () => initialState,
});

describe("aggregate fixtures", () => {
  function expectStableFixture(
    aggregate: Aggregate<JsonObject>,
    kind: "player" | "team" | "session",
    modelId: string,
  ): void {
    expect(aggregate).toMatchObject({
      aggregateKind: kind,
      aggregateId: `${kind}-fixture`,
      modelId,
      schemaId: "fixture.state",
      stateVersion: 0,
    });
  }

  it("creates detached aggregates with model-derived identities and stable defaults", () => {
    const nested = { value: 1 };
    const player = playerFixture({ model: playerModel, state: { nested } });
    const team = teamFixture({ model: teamModel, state: { nested } });
    const session = sessionFixture({ model: sessionModel, state: { nested } });

    expectStableFixture(player, "player", "fixture.player");
    expectStableFixture(team, "team", "fixture.team");
    expectStableFixture(session, "session", "fixture.session");
    expect(player.state.nested).not.toBe(nested);
    expect(Object.isFrozen(player.state.nested)).toBe(true);
  });

  it("does not share nested references between fixture calls", () => {
    const nested = { value: 1 };
    const first = playerFixture({ model: playerModel, state: { nested } });
    const second = playerFixture({ model: playerModel, state: { nested } });

    expect(first.state.nested).not.toBe(second.state.nested);
  });

  it("rejects state, version, and progression that disagree with the complete model", () => {
    expect(() =>
      playerFixture({
        model: playerModel,
        state: { nested: { value: "invalid" } } as never,
      }),
    ).toThrow(/state-invalid/);
    expect(() =>
      playerFixture({ model: playerModel, state: initialState, stateVersion: -1 }),
    ).toThrow(/state-version-invalid/);
    expect(() =>
      playerFixture({
        model: playerModel,
        state: initialState,
        progression: {
          graphId: "undeclared",
          nodes: [],
        } satisfies ProgressionInstance,
      }),
    ).toThrow(/progression-model-mismatch/);
  });
});
