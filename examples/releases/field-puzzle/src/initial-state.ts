import type { JsonObject } from "@plotpoint/runtime";

export type FieldPhase = "first-checkpoint" | "puzzle" | "second-checkpoint" | "complete";

export type FieldCheckpoint = JsonObject & {
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusMeters: number;
  readonly maximumAccuracyMeters: number;
};

export type FieldGameContent = JsonObject & {
  readonly title: string;
  readonly firstCheckpoint: FieldCheckpoint;
  readonly puzzle: JsonObject & {
    readonly prompt: string;
    readonly answer: string;
  };
  readonly secondCheckpoint: FieldCheckpoint;
  readonly maximumObservationAgeMs: number;
};

export type FieldState = JsonObject & {
  readonly attempts: number;
  readonly phase: FieldPhase;
  readonly firstCheckpoint: FieldCheckpoint;
  readonly puzzleAnswer: string;
  readonly secondCheckpoint: FieldCheckpoint;
  readonly maximumObservationAgeMs: number;
};

function copyCheckpoint(checkpoint: FieldCheckpoint): FieldCheckpoint {
  return {
    name: checkpoint.name,
    latitude: checkpoint.latitude,
    longitude: checkpoint.longitude,
    radiusMeters: checkpoint.radiusMeters,
    maximumAccuracyMeters: checkpoint.maximumAccuracyMeters,
  };
}

export function initializeField(content: FieldGameContent): FieldState {
  return {
    attempts: 0,
    phase: "first-checkpoint",
    firstCheckpoint: copyCheckpoint(content.firstCheckpoint),
    puzzleAnswer: content.puzzle.answer,
    secondCheckpoint: copyCheckpoint(content.secondCheckpoint),
    maximumObservationAgeMs: content.maximumObservationAgeMs,
  };
}
