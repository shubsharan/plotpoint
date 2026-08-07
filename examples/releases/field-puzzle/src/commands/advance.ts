import { defineCommand, type JsonObject } from "@plotpoint/runtime";

import type { FieldCheckpoint, FieldCheckpointId, FieldState } from "../initial-state.js";

export type AdvancePayload = JsonObject & {
  readonly action: "check-in" | "solve";
  readonly answer?: string;
};

export type AdvanceOutcome = JsonObject & {
  readonly result:
    | "advanced"
    | "already-complete"
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
  const bounded = Math.min(1, Math.max(0, value));
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(bounded), Math.sqrt(1 - bounded));
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
      if (aggregate.state.puzzleSolved) {
        return { kind: "no-op", outcome: { result: "already-complete" } };
      }
      const puzzleStatus = aggregate.progression?.nodes.find(
        (node) => node.nodeId === "puzzle",
      )?.status;
      if (puzzleStatus !== "available" && puzzleStatus !== "active") {
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
          puzzleSolved: true,
        },
        outcome: { result: "advanced" },
        domainEvents: [{ type: "field.advanced", payload: {} }],
        effectIntents: [],
        progressionIntents: [],
      };
    }

    const playable = (nodeId: FieldCheckpointId): boolean => {
      const status = aggregate.progression?.nodes.find((node) => node.nodeId === nodeId)?.status;
      return status === "active" || status === "available";
    };
    const checkpointId: FieldCheckpointId | undefined = playable("first-checkpoint")
      ? "first-checkpoint"
      : playable("second-checkpoint")
        ? "second-checkpoint"
        : undefined;
    if (checkpointId === undefined || aggregate.state.visitedCheckpoints.includes(checkpointId)) {
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
      checkpointId === "first-checkpoint"
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
        visitedCheckpoints: [...aggregate.state.visitedCheckpoints, checkpointId],
      },
      outcome: { result: "advanced" },
      domainEvents: [{ type: "field.advanced", payload: {} }],
      effectIntents: [],
      progressionIntents: [],
    };
  },
});
