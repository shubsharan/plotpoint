import { describe, expect, it } from "vitest";

import { advanceCommand } from "../src/commands/advance.js";

const target = {
  kind: "player" as const,
  id: "field-player",
  schemaVersion: 1,
  stateVersion: 0,
  authority: "local" as const,
  state: { attempts: 0, phase: "first-checkpoint" as const },
};

describe("field puzzle", () => {
  it("advances at the first checkpoint and rejects inaccurate observations", () => {
    const command = {
      id: "one",
      type: "advance",
      target: { kind: "player" as const, id: "field-player" },
      expectedStateVersion: 0,
      payload: { action: "check-in" as const },
    };
    const accepted = advanceCommand.handle(target, command, {
      take: () => ({
        availability: "available",
        ageMs: 0,
        latitude: 37.76942,
        longitude: -122.48621,
        horizontalAccuracy: 5,
      }),
    });
    expect(accepted).toMatchObject({ kind: "accepted", nextState: { phase: "puzzle" } });
    const inaccurate = advanceCommand.handle(target, command, {
      take: () => ({
        availability: "available",
        ageMs: 0,
        latitude: 37.76942,
        longitude: -122.48621,
        horizontalAccuracy: 100,
      }),
    });
    expect(inaccurate).toEqual({ kind: "rejected", outcome: { result: "inaccurate" } });
  });

  it("reports denied, unavailable, stale, and distant observations without advancing", () => {
    const command = {
      id: "one",
      type: "advance",
      target: { kind: "player" as const, id: "field-player" },
      expectedStateVersion: 0,
      payload: { action: "check-in" as const },
    };
    const outcomes = [
      { value: { availability: "permission-denied" }, result: "permission-denied" },
      { value: { availability: "unavailable" }, result: "unavailable" },
      {
        value: {
          availability: "available",
          ageMs: 120_000,
          latitude: 37.76942,
          longitude: -122.48621,
          horizontalAccuracy: 5,
        },
        result: "stale",
      },
      {
        value: {
          availability: "available",
          ageMs: 0,
          latitude: 37.77942,
          longitude: -122.49621,
          horizontalAccuracy: 5,
        },
        result: "outside",
      },
    ];
    for (const outcome of outcomes) {
      expect(advanceCommand.handle(target, command, { take: () => outcome.value })).toEqual({
        kind: "rejected",
        outcome: { result: outcome.result },
      });
    }
  });

  it("requires the puzzle between the two checkpoints", () => {
    const puzzleTarget = {
      ...target,
      state: { attempts: 0, phase: "puzzle" as const },
      stateVersion: 1,
    };
    const incorrect = advanceCommand.handle(
      puzzleTarget,
      {
        id: "two",
        type: "advance",
        target: { kind: "player" as const, id: "field-player" },
        expectedStateVersion: 1,
        payload: { action: "solve" as const, answer: "wrong" },
      },
      { take: () => ({}) },
    );
    expect(incorrect).toMatchObject({
      kind: "accepted",
      nextState: { attempts: 1, phase: "puzzle" },
    });
    const solved = advanceCommand.handle(
      puzzleTarget,
      {
        id: "three",
        type: "advance",
        target: { kind: "player" as const, id: "field-player" },
        expectedStateVersion: 1,
        payload: { action: "solve" as const, answer: "map" },
      },
      { take: () => ({}) },
    );
    expect(solved).toMatchObject({ kind: "accepted", nextState: { phase: "second-checkpoint" } });
  });
});
