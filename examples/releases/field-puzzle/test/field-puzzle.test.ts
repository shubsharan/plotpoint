import {
  executeCommand,
  initialProgression,
  type Aggregate,
  type Observation,
} from "@plotpoint/runtime";
import { describe, expect, it } from "vitest";

import { advanceCommand } from "../src/commands/advance.js";
import { fieldGame } from "../src/config.js";
import { initializeField, type FieldState } from "../src/initial-state.js";
import { fieldProgression } from "../src/progression/route.js";

function aggregate(
  state: FieldState = initializeField(fieldGame),
  stateVersion = 0,
): Aggregate<FieldState, "player"> {
  return {
    aggregateId: "field-player",
    modelId: "field.player",
    aggregateKind: "player",
    schemaId: "field.player-state",
    stateVersion,
    state,
    progression: initialProgression(fieldProgression),
  };
}

const checkIn = {
  id: "check-in",
  type: "advance",
  target: { kind: "player" as const, id: "field-player" },
  expectedStateVersion: 0,
  payload: { action: "check-in" as const },
};

const atCheckpoint = (checkpoint: typeof fieldGame.firstCheckpoint): Observation => ({
  kind: "location.foreground",
  key: "current",
  value: {
    availability: "available",
    ageMs: 0,
    latitude: checkpoint.latitude,
    longitude: checkpoint.longitude,
    horizontalAccuracy: 5,
  },
});

describe("field puzzle", () => {
  it("advances at the first checkpoint and rejects inaccurate observations", () => {
    const accepted = advanceCommand.handle(aggregate(), checkIn, {
      take: () => atCheckpoint(fieldGame.firstCheckpoint).value,
    });
    expect(accepted).toMatchObject({ kind: "accepted", nextState: { phase: "puzzle" } });

    const inaccurate = advanceCommand.handle(aggregate(), checkIn, {
      take: () => ({
        availability: "available",
        ageMs: 0,
        latitude: fieldGame.firstCheckpoint.latitude,
        longitude: fieldGame.firstCheckpoint.longitude,
        horizontalAccuracy: 100,
      }),
    });
    expect(inaccurate).toEqual({ kind: "rejected", outcome: { result: "inaccurate" } });
  });

  it("reports denied, unavailable, stale, and distant observations without advancing", () => {
    const outcomes = [
      { value: { availability: "permission-denied" }, result: "permission-denied" },
      { value: { availability: "unavailable" }, result: "unavailable" },
      { value: { availability: "failed" }, result: "failed" },
      {
        value: { ...atCheckpoint(fieldGame.firstCheckpoint).value, ageMs: -1 },
        result: "future",
      },
      {
        value: {
          availability: "available",
          ageMs: 120_000,
          latitude: fieldGame.firstCheckpoint.latitude,
          longitude: fieldGame.firstCheckpoint.longitude,
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
      expect(advanceCommand.handle(aggregate(), checkIn, { take: () => outcome.value })).toEqual({
        kind: "rejected",
        outcome: { result: outcome.result },
      });
    }
  });

  it("completes both checkpoints with the release-owned puzzle between them", () => {
    const first = advanceCommand.handle(aggregate(), checkIn, {
      take: () => atCheckpoint(fieldGame.firstCheckpoint).value,
    });
    expect(first).toMatchObject({ kind: "accepted", nextState: { phase: "puzzle" } });
    if (first.kind !== "accepted" || first.nextState === undefined) {
      throw new Error("first-checkpoint-not-accepted");
    }

    const solved = advanceCommand.handle(
      aggregate(first.nextState, 1),
      {
        ...checkIn,
        id: "solve",
        expectedStateVersion: 1,
        payload: { action: "solve", answer: fieldGame.puzzle.answer } as const,
      },
      { take: () => ({}) },
    );
    expect(solved).toMatchObject({
      kind: "accepted",
      nextState: { attempts: 1, phase: "second-checkpoint" },
    });
    if (solved.kind !== "accepted" || solved.nextState === undefined) {
      throw new Error("puzzle-not-accepted");
    }

    const complete = advanceCommand.handle(
      aggregate(solved.nextState, 2),
      { ...checkIn, id: "second-checkpoint", expectedStateVersion: 2 },
      { take: () => atCheckpoint(fieldGame.secondCheckpoint).value },
    );
    expect(complete).toMatchObject({ kind: "accepted", nextState: { phase: "complete" } });
  });

  it("requires the correct puzzle answer without mutating attempts for a rejection", () => {
    const puzzleTarget = aggregate({ ...initializeField(fieldGame), phase: "puzzle" }, 1);
    const incorrect = advanceCommand.handle(
      puzzleTarget,
      {
        id: "incorrect",
        type: "advance",
        target: { kind: "player" as const, id: "field-player" },
        expectedStateVersion: 1,
        payload: { action: "solve" as const, answer: "wrong" },
      },
      { take: () => ({}) },
    );
    expect(incorrect).toEqual({ kind: "rejected", outcome: { result: "incorrect" } });

    const solved = advanceCommand.handle(
      puzzleTarget,
      {
        id: "correct",
        type: "advance",
        target: { kind: "player" as const, id: "field-player" },
        expectedStateVersion: 1,
        payload: { action: "solve" as const, answer: "map" },
      },
      { take: () => ({}) },
    );
    expect(solved).toMatchObject({
      kind: "accepted",
      nextState: { attempts: 1, phase: "second-checkpoint" },
    });
  });

  it("records exact accepted and rejected execution terminals through the runtime", () => {
    const accepted = executeCommand({
      definition: advanceCommand,
      aggregate: aggregate(),
      command: { ...checkIn, id: "accepted" },
      observations: [atCheckpoint(fieldGame.firstCheckpoint)],
      progression: fieldProgression,
    });
    expect(accepted).toMatchObject({
      kind: "recorded",
      aggregate: { stateVersion: 1, state: { phase: "puzzle" } },
      record: {
        definitionId: "field.advance",
        terminal: "accepted",
        outcome: { result: "advanced" },
        domainEvents: [{ type: "field.advanced", payload: {} }],
      },
    });

    const rejected = executeCommand({
      definition: advanceCommand,
      aggregate: aggregate(),
      command: { ...checkIn, id: "rejected" },
      observations: [
        {
          kind: "location.foreground",
          key: "current",
          value: { availability: "permission-denied" },
        },
      ],
      progression: fieldProgression,
    });
    expect(rejected).toMatchObject({
      kind: "recorded",
      aggregate: { stateVersion: 0, state: { phase: "first-checkpoint" } },
      record: { terminal: "rejected", outcome: { result: "permission-denied" } },
    });
  });

  it("keeps preflight failures unrecorded and records execution failures", () => {
    const preflight = executeCommand({
      definition: advanceCommand,
      aggregate: aggregate(),
      command: { ...checkIn, id: "preflight", expectedStateVersion: -1 },
      observations: [],
      progression: fieldProgression,
    });
    expect(preflight).toMatchObject({ kind: "preflight-invalid", diagnostics: expect.any(Array) });

    const execution = executeCommand({
      definition: advanceCommand,
      aggregate: aggregate(),
      command: { ...checkIn, id: "execution" },
      observations: [],
      progression: fieldProgression,
    });
    expect(execution).toMatchObject({
      kind: "recorded",
      record: { terminal: "invalid", diagnostics: expect.any(Array) },
    });
  });
});
