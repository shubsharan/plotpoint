import { describe, expect, it } from "vitest";

import { advanceCommand } from "../src/commands/advance.js";
import { fieldGame } from "../src/config.js";
import { logic } from "../src/logic.js";

const target = {
  kind: "player" as const,
  id: "field-player",
  schemaVersion: 1,
  stateVersion: 0,
  authority: "local" as const,
  state: { attempts: 0, phase: "first-checkpoint" as const },
};

describe("field puzzle", () => {
  const checkIn = {
    id: "check-in",
    type: "advance",
    target: { kind: "player" as const, id: "field-player" },
    expectedStateVersion: 0,
    payload: { action: "check-in" as const },
  };
  const atCheckpoint = (checkpoint: typeof fieldGame.firstCheckpoint) => ({
    availability: "available",
    ageMs: 0,
    latitude: checkpoint.latitude,
    longitude: checkpoint.longitude,
    horizontalAccuracy: 5,
  });

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
      { value: { availability: "failed" }, result: "failed" },
      {
        value: { ...atCheckpoint(fieldGame.firstCheckpoint), ageMs: -1 },
        result: "future",
      },
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

  it("completes both checkpoints with the release-owned puzzle between them", () => {
    const first = advanceCommand.handle(target, checkIn, {
      take: () => atCheckpoint(fieldGame.firstCheckpoint),
    });
    expect(first).toMatchObject({ kind: "accepted", nextState: { phase: "puzzle" } });
    if (first.kind !== "accepted") throw new Error("first-checkpoint-not-accepted");

    const solved = advanceCommand.handle(
      { ...target, stateVersion: 1, state: first.nextState },
      {
        ...checkIn,
        id: "solve",
        expectedStateVersion: 1,
        payload: { action: "solve", answer: fieldGame.puzzle.answer } as const,
      },
      { take: () => ({}) },
    );
    expect(solved).toMatchObject({ kind: "accepted", nextState: { phase: "second-checkpoint" } });
    if (solved.kind !== "accepted") throw new Error("puzzle-not-accepted");

    const complete = advanceCommand.handle(
      { ...target, stateVersion: 2, state: solved.nextState },
      { ...checkIn, id: "second-checkpoint", expectedStateVersion: 2 },
      { take: () => atCheckpoint(fieldGame.secondCheckpoint) },
    );
    expect(complete).toMatchObject({ kind: "accepted", nextState: { phase: "complete" } });
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

  it("maps accepted and rejected execution terminals to exact Host API candidates", () => {
    const accepted = logic.run({
      commandId: "candidate-accepted",
      state: target.state,
      stateVersion: 0,
      payload: { action: "check-in" },
      observation: {
        version: 1,
        observationId: "location-accepted",
        recordedAt: "2030-01-01T00:00:00.000Z",
        capturedAt: "2030-01-01T00:00:00.000Z",
        availability: "available",
        ageMs: 0,
        latitude: fieldGame.firstCheckpoint.latitude,
        longitude: fieldGame.firstCheckpoint.longitude,
        horizontalAccuracy: 5,
      },
    });
    expect(accepted).toMatchObject({
      kind: "candidate",
      candidate: {
        commandId: "candidate-accepted",
        target: {
          aggregateId: "field-player",
          aggregateKind: "player",
          schemaId: "field.player-state",
          schemaVersion: 1,
        },
        expectedVersion: 0,
        terminal: "accepted",
        nextState: { attempts: 0, phase: "puzzle" },
        outcome: { result: "advanced" },
        observationIds: ["location-accepted"],
      },
    });

    const rejected = logic.run({
      commandId: "candidate-rejected",
      state: target.state,
      stateVersion: 0,
      payload: { action: "check-in" },
      observation: {
        version: 1,
        observationId: "location-denied",
        recordedAt: "2030-01-01T00:00:00.000Z",
        availability: "permission-denied",
      },
    });
    expect(rejected).toEqual({
      kind: "candidate",
      candidate: {
        commandId: "candidate-rejected",
        target: {
          aggregateId: "field-player",
          aggregateKind: "player",
          schemaId: "field.player-state",
          schemaVersion: 1,
        },
        expectedVersion: 0,
        terminal: "rejected",
        outcome: { result: "permission-denied" },
        observationIds: ["location-denied"],
      },
    });
  });

  it("keeps preflight failures local and maps recorded execution failures to invalid candidates", () => {
    expect(
      logic.run({
        commandId: "preflight-invalid",
        state: target.state,
        stateVersion: -1,
        payload: { action: "solve", answer: "map" },
      }),
    ).toMatchObject({ kind: "preflight-invalid", diagnosticCodes: expect.any(Array) });

    expect(
      logic.run({
        commandId: "execution-invalid",
        state: target.state,
        stateVersion: 0,
        payload: { action: "check-in" },
      }),
    ).toMatchObject({
      kind: "candidate",
      candidate: {
        commandId: "execution-invalid",
        terminal: "invalid",
        diagnosticCodes: expect.any(Array),
      },
    });
  });
});
