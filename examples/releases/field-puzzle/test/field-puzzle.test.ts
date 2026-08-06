import {
  bindExecutableAggregateModel,
  resolveCommandBinding,
  type Aggregate,
  type JsonObject,
  type Observation,
  type ResolvedAggregateModel,
  type RuntimeSchema,
} from "@plotpoint/runtime";
import { describe, expect, it } from "vitest";

import {
  advanceCommand,
  type AdvanceOutcome,
  type AdvancePayload,
} from "../src/commands/advance.js";
import { fieldGame } from "../src/config.js";
import {
  initializeField,
  type FieldCheckpoint,
  type FieldGameContent,
  type FieldState,
} from "../src/initial-state.js";
import { fieldProgression } from "../src/progression/route.js";

const TEST_DIGEST =
  "sha256:0000000000000000000000000000000000000000000000000000000000000000" as const;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function schema<Value extends JsonObject>(
  id: string,
  validate: (value: unknown) => value is Value,
): RuntimeSchema<Value> {
  return Object.freeze({
    id,
    schemaDigest: TEST_DIGEST,
    validate(value: unknown) {
      return validate(value)
        ? { valid: true as const, value }
        : { valid: false as const, diagnostics: [] };
    },
  });
}

function isCheckpoint(value: unknown): value is FieldCheckpoint {
  return (
    isObject(value) &&
    typeof value.name === "string" &&
    typeof value.latitude === "number" &&
    typeof value.longitude === "number" &&
    typeof value.radiusMeters === "number" &&
    typeof value.maximumAccuracyMeters === "number"
  );
}

function isFieldGameContent(value: unknown): value is FieldGameContent {
  return (
    isObject(value) &&
    typeof value.title === "string" &&
    isCheckpoint(value.firstCheckpoint) &&
    isObject(value.puzzle) &&
    typeof value.puzzle.prompt === "string" &&
    typeof value.puzzle.answer === "string" &&
    isCheckpoint(value.secondCheckpoint) &&
    typeof value.maximumObservationAgeMs === "number"
  );
}

function isFieldState(value: unknown): value is FieldState {
  return (
    isObject(value) &&
    Number.isSafeInteger(value.attempts) &&
    Array.isArray(value.visitedCheckpoints) &&
    value.visitedCheckpoints.every(
      (checkpoint) => checkpoint === "first-checkpoint" || checkpoint === "second-checkpoint",
    ) &&
    typeof value.puzzleSolved === "boolean" &&
    isCheckpoint(value.firstCheckpoint) &&
    typeof value.puzzleAnswer === "string" &&
    isCheckpoint(value.secondCheckpoint) &&
    typeof value.maximumObservationAgeMs === "number" &&
    !("phase" in value)
  );
}

function isAdvancePayload(value: unknown): value is AdvancePayload {
  return (
    isObject(value) &&
    (value.action === "check-in" || value.action === "solve") &&
    (value.answer === undefined || typeof value.answer === "string")
  );
}

const RESULTS = new Set<AdvanceOutcome["result"]>([
  "advanced",
  "already-complete",
  "incorrect",
  "permission-denied",
  "unavailable",
  "failed",
  "future",
  "stale",
  "inaccurate",
  "outside",
  "wrong-phase",
]);

function isAdvanceOutcome(value: unknown): value is AdvanceOutcome {
  return isObject(value) && typeof value.result === "string" && RESULTS.has(value.result as never);
}

function createModel() {
  const binding = resolveCommandBinding({
    registrationId: "field.advance",
    definition: advanceCommand,
    payloadSchema: schema("field.advance-payload", isAdvancePayload),
    outcomeSchema: schema("field.advance-outcome", isAdvanceOutcome),
  });
  const model: ResolvedAggregateModel<"player", FieldState> = {
    modelId: "field.player",
    aggregateKind: "player",
    authority: "local",
    stateSchema: schema("field.player-state", isFieldState),
    initializationSchema: schema("field.initialization", isFieldGameContent),
    initializeState(input) {
      if (!isFieldGameContent(input)) throw new TypeError("field-initialization-invalid");
      return initializeField(input);
    },
    commandsByType: { advance: binding },
    eventSchemas: { "field.advanced": schema("field.advanced-event", isObject) },
    effectSchemas: {},
    progression: fieldProgression,
  };
  return bindExecutableAggregateModel(model);
}

function initialized() {
  const result = createModel().initialize(fieldGame);
  if (result.kind !== "initialized") throw new Error(result.diagnostics[0]?.code);
  return result.aggregate;
}

function command(aggregate: Aggregate<JsonObject, "player">, id: string, payload: AdvancePayload) {
  return {
    id,
    type: "advance",
    target: { kind: "player" as const, id: aggregate.aggregateId },
    expectedStateVersion: aggregate.stateVersion,
    payload,
  };
}

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
  it("initializes canonical progression without duplicating phase in authored state", () => {
    const aggregate = initialized();

    expect(aggregate.state).toMatchObject({
      attempts: 0,
      visitedCheckpoints: [],
      puzzleSolved: false,
    });
    expect(aggregate.state).not.toHaveProperty("phase");
    expect(aggregate.progression).toEqual({
      graphId: "field.route",
      nodes: [
        { nodeId: "complete", status: "locked" },
        { nodeId: "first-checkpoint", status: "active" },
        { nodeId: "puzzle", status: "locked" },
        { nodeId: "second-checkpoint", status: "locked" },
      ],
    });
  });

  it("derives the complete route from durable facts and empty command progression intents", () => {
    const model = createModel();
    const initial = initialized();
    const first = model.execute({
      aggregate: initial,
      command: command(initial, "first", { action: "check-in" }),
      observations: [atCheckpoint(fieldGame.firstCheckpoint)],
    });
    expect(first).toMatchObject({
      kind: "recorded",
      aggregate: {
        stateVersion: 1,
        state: { visitedCheckpoints: ["first-checkpoint"], puzzleSolved: false },
        progression: {
          nodes: [
            { nodeId: "complete", status: "locked" },
            { nodeId: "first-checkpoint", status: "completed" },
            { nodeId: "puzzle", status: "available" },
            { nodeId: "second-checkpoint", status: "locked" },
          ],
        },
      },
      record: { terminal: "accepted", progressionTrace: expect.any(Array) },
    });
    if (first.kind !== "recorded") throw new Error("first-checkpoint-not-recorded");

    const solved = model.execute({
      aggregate: first.aggregate,
      command: command(first.aggregate, "solve", {
        action: "solve",
        answer: fieldGame.puzzle.answer,
      }),
      observations: [],
    });
    expect(solved).toMatchObject({
      kind: "recorded",
      aggregate: {
        stateVersion: 2,
        state: { attempts: 1, puzzleSolved: true },
        progression: {
          nodes: [
            { nodeId: "complete", status: "locked" },
            { nodeId: "first-checkpoint", status: "completed" },
            { nodeId: "puzzle", status: "completed" },
            { nodeId: "second-checkpoint", status: "available" },
          ],
        },
      },
    });
    if (solved.kind !== "recorded") throw new Error("puzzle-not-recorded");

    const complete = model.execute({
      aggregate: solved.aggregate,
      command: command(solved.aggregate, "second", { action: "check-in" }),
      observations: [atCheckpoint(fieldGame.secondCheckpoint)],
    });
    expect(complete).toMatchObject({
      kind: "recorded",
      aggregate: {
        stateVersion: 3,
        state: { visitedCheckpoints: ["first-checkpoint", "second-checkpoint"] },
        progression: {
          nodes: [
            { nodeId: "complete", status: "available" },
            { nodeId: "first-checkpoint", status: "completed" },
            { nodeId: "puzzle", status: "completed" },
            { nodeId: "second-checkpoint", status: "completed" },
          ],
        },
      },
    });
    for (const result of [first, solved, complete]) {
      if (result.kind !== "recorded") throw new Error("field-action-not-recorded");
      expect(result.record.progressionTrace.length).toBeGreaterThan(0);
    }
  });

  it("covers explicit rejection, no-op, preflight-invalid, and recorded invalid terminals", () => {
    const model = createModel();
    const initial = initialized();
    const inaccurate = model.execute({
      aggregate: initial,
      command: command(initial, "inaccurate", { action: "check-in" }),
      observations: [
        {
          ...atCheckpoint(fieldGame.firstCheckpoint),
          value: {
            ...atCheckpoint(fieldGame.firstCheckpoint).value,
            horizontalAccuracy: 100,
          },
        },
      ],
    });
    expect(inaccurate).toMatchObject({
      kind: "recorded",
      record: { terminal: "rejected", outcome: { result: "inaccurate" } },
    });

    const preflight = model.execute({
      aggregate: initial,
      command: {
        ...command(initial, "preflight", { action: "check-in" }),
        expectedStateVersion: -1,
      },
      observations: [],
    });
    expect(preflight).toMatchObject({ kind: "preflight-invalid" });

    const executionInvalid = model.execute({
      aggregate: initial,
      command: command(initial, "execution-invalid", { action: "check-in" }),
      observations: [],
    });
    expect(executionInvalid).toMatchObject({
      kind: "recorded",
      record: { terminal: "invalid", diagnostics: [{ code: "observation-exhausted" }] },
    });

    const first = model.execute({
      aggregate: initial,
      command: command(initial, "first", { action: "check-in" }),
      observations: [atCheckpoint(fieldGame.firstCheckpoint)],
    });
    if (first.kind !== "recorded") throw new Error("first-checkpoint-not-recorded");
    const solved = model.execute({
      aggregate: first.aggregate,
      command: command(first.aggregate, "solve", {
        action: "solve",
        answer: fieldGame.puzzle.answer,
      }),
      observations: [],
    });
    if (solved.kind !== "recorded") throw new Error("puzzle-not-recorded");
    const repeated = model.execute({
      aggregate: solved.aggregate,
      command: command(solved.aggregate, "solve-again", {
        action: "solve",
        answer: fieldGame.puzzle.answer,
      }),
      observations: [],
    });
    expect(repeated).toMatchObject({
      kind: "recorded",
      aggregate: { stateVersion: 2 },
      record: { terminal: "no-op", outcome: { result: "already-complete" } },
    });
  });

  it("preserves safe observation failures without advancing durable facts", () => {
    const model = createModel();
    const initial = initialized();
    const outcomes = [
      { value: { availability: "permission-denied" }, result: "permission-denied" },
      { value: { availability: "unavailable" }, result: "unavailable" },
      { value: { availability: "failed" }, result: "failed" },
      { value: { ...atCheckpoint(fieldGame.firstCheckpoint).value, ageMs: -1 }, result: "future" },
      {
        value: { ...atCheckpoint(fieldGame.firstCheckpoint).value, ageMs: 120_000 },
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
    for (const [index, outcome] of outcomes.entries()) {
      expect(
        model.execute({
          aggregate: initial,
          command: command(initial, `rejected-${index}`, { action: "check-in" }),
          observations: [{ kind: "location.foreground", key: "current", value: outcome.value }],
        }),
      ).toMatchObject({
        kind: "recorded",
        aggregate: { stateVersion: 0, state: { visitedCheckpoints: [] } },
        record: { terminal: "rejected", outcome: { result: outcome.result } },
      });
    }
  });
});
