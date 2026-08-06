import { defineCommand, type JsonObject } from "@plotpoint/runtime";

import type { FieldCheckpoint, FieldState } from "../initial-state.js";

export type AdvancePayload = JsonObject & {
  readonly action: "check-in" | "solve";
  readonly answer?: string;
};

export type AdvanceOutcome = JsonObject & {
  readonly result:
    | "advanced"
    | "incorrect"
    | "permission-denied"
    | "unavailable"
    | "failed"
    | "future"
    | "stale"
    | "inaccurate"
    | "outside"
    | "wrong-phase";
};

type LocationValue = JsonObject & {
  readonly availability: string;
  readonly ageMs?: number;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly horizontalAccuracy?: number;
};

function distanceMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(bLat - aLat);
  const dLon = radians(bLon - aLon);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function outsideCheckpoint(
  latitude: number,
  longitude: number,
  checkpoint: FieldCheckpoint,
): boolean {
  return (
    distanceMeters(latitude, longitude, checkpoint.latitude, checkpoint.longitude) >
    checkpoint.radiusMeters
  );
}

export const advanceCommand = defineCommand<"player", FieldState, AdvancePayload, AdvanceOutcome>({
  definitionId: "field.advance",
  commandType: "advance",
  aggregateKind: "player",
  handle(aggregate, command, context) {
    if (command.payload.action === "solve") {
      if (aggregate.state.phase !== "puzzle") {
        return { kind: "rejected", outcome: { result: "wrong-phase" } };
      }
      const correct =
        command.payload.answer?.trim().toLowerCase() ===
        aggregate.state.puzzleAnswer.trim().toLowerCase();
      if (!correct) {
        return { kind: "rejected", outcome: { result: "incorrect" } };
      }
      return {
        kind: "accepted",
        nextState: {
          ...aggregate.state,
          attempts: aggregate.state.attempts + 1,
          phase: "second-checkpoint",
        },
        outcome: { result: "advanced" },
        domainEvents: [{ type: "field.advanced", payload: {} }],
        effectIntents: [],
        progressionIntents: [],
      };
    }

    if (
      aggregate.state.phase !== "first-checkpoint" &&
      aggregate.state.phase !== "second-checkpoint"
    ) {
      return { kind: "rejected", outcome: { result: "wrong-phase" } };
    }
    const location = context.take<LocationValue>("location.foreground", "current");
    if (location.availability === "permission-denied") {
      return { kind: "rejected", outcome: { result: "permission-denied" } };
    }
    if (location.availability === "failed") {
      return { kind: "rejected", outcome: { result: "failed" } };
    }
    if (
      location.availability !== "available" ||
      location.latitude === undefined ||
      location.longitude === undefined
    ) {
      return { kind: "rejected", outcome: { result: "unavailable" } };
    }
    if (location.ageMs === undefined || location.ageMs > aggregate.state.maximumObservationAgeMs) {
      return { kind: "rejected", outcome: { result: "stale" } };
    }
    if (location.ageMs < 0) {
      return { kind: "rejected", outcome: { result: "future" } };
    }
    const checkpoint =
      aggregate.state.phase === "first-checkpoint"
        ? aggregate.state.firstCheckpoint
        : aggregate.state.secondCheckpoint;
    if (
      location.horizontalAccuracy === undefined ||
      location.horizontalAccuracy > checkpoint.maximumAccuracyMeters
    ) {
      return { kind: "rejected", outcome: { result: "inaccurate" } };
    }
    if (outsideCheckpoint(location.latitude, location.longitude, checkpoint)) {
      return { kind: "rejected", outcome: { result: "outside" } };
    }
    return {
      kind: "accepted",
      nextState: {
        ...aggregate.state,
        phase: aggregate.state.phase === "first-checkpoint" ? "puzzle" : "complete",
      },
      outcome: { result: "advanced" },
      domainEvents: [{ type: "field.advanced", payload: {} }],
      effectIntents: [],
      progressionIntents: [],
    };
  },
});
