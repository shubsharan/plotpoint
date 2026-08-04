import { defineCommand, type JsonObject } from "@plotpoint/runtime";

import { fieldGame } from "../config.js";

export type FieldPhase = "first-checkpoint" | "puzzle" | "second-checkpoint" | "complete";
export type FieldState = JsonObject & { readonly attempts: number; readonly phase: FieldPhase };
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

export const advanceCommand = defineCommand<"player", FieldState, AdvancePayload, AdvanceOutcome>({
  definitionId: "field.advance.v1",
  commandType: "advance",
  aggregateKind: "player",
  handle(target, command, context) {
    if (command.payload.action === "solve") {
      if (target.state.phase !== "puzzle")
        return { kind: "rejected", outcome: { result: "wrong-phase" } };
      const correct = command.payload.answer?.trim().toLowerCase() === fieldGame.puzzle.answer;
      return {
        kind: "accepted",
        nextState: {
          attempts: target.state.attempts + 1,
          phase: correct ? "second-checkpoint" : "puzzle",
        },
        outcome: { result: correct ? "advanced" : "incorrect" },
        domainEvents: [{ type: correct ? "puzzle-solved" : "answer-rejected" }],
        effectIntents: [],
        progressionIntents: [],
      };
    }
    if (target.state.phase !== "first-checkpoint" && target.state.phase !== "second-checkpoint") {
      return { kind: "rejected", outcome: { result: "wrong-phase" } };
    }
    const location = context.take<LocationValue>("location.foreground", "current");
    if (location.availability === "permission-denied")
      return { kind: "rejected", outcome: { result: "permission-denied" } };
    if (
      location.availability !== "available" ||
      location.latitude === undefined ||
      location.longitude === undefined
    ) {
      return { kind: "rejected", outcome: { result: "unavailable" } };
    }
    if (
      location.ageMs === undefined ||
      location.ageMs < 0 ||
      location.ageMs > fieldGame.maximumObservationAgeMs
    ) {
      return { kind: "rejected", outcome: { result: "stale" } };
    }
    const checkpoint =
      target.state.phase === "first-checkpoint"
        ? fieldGame.firstCheckpoint
        : fieldGame.secondCheckpoint;
    if (
      location.horizontalAccuracy === undefined ||
      location.horizontalAccuracy > checkpoint.maximumAccuracyMeters
    ) {
      return { kind: "rejected", outcome: { result: "inaccurate" } };
    }
    if (
      distanceMeters(
        location.latitude,
        location.longitude,
        checkpoint.latitude,
        checkpoint.longitude,
      ) > checkpoint.radiusMeters
    ) {
      return { kind: "rejected", outcome: { result: "outside" } };
    }
    const phase = target.state.phase === "first-checkpoint" ? "puzzle" : "complete";
    return {
      kind: "accepted",
      nextState: { attempts: target.state.attempts, phase },
      outcome: { result: "advanced" },
      domainEvents: [{ type: "checkpoint-reached", checkpoint: checkpoint.name }],
      effectIntents: [],
      progressionIntents: [],
    };
  },
});
