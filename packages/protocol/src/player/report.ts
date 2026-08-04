import type { ReleaseId } from "../release/types.js";

export const FOREGROUND_LOCATION_CAPABILITY = Object.freeze({
  id: "plotpoint.location.foreground",
  major: 1,
  minor: 0,
});

export type LocationAvailability = "available" | "permission-denied" | "unavailable" | "failed";

export interface LocationObservationV1 {
  readonly version: 1;
  readonly observationId: string;
  readonly capturedAt: string;
  readonly availability: LocationAvailability;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly horizontalAccuracy?: number;
}

export type AccuracyBand = "excellent" | "good" | "degraded" | "unknown";

export function accuracyBand(accuracy: number | undefined): AccuracyBand {
  if (accuracy === undefined || !Number.isFinite(accuracy) || accuracy < 0) return "unknown";
  if (accuracy <= 10) return "excellent";
  if (accuracy <= 30) return "good";
  return "degraded";
}

export interface PlayReportCommandV1 {
  readonly commandId: string;
  readonly outcome: "accepted" | "rejected" | "invalid";
  readonly resultingVersion?: number;
  readonly elapsedMs: number;
}

export interface PlayReportObservationV1 {
  readonly observationId: string;
  readonly availability: LocationAvailability;
  readonly accuracyBand: AccuracyBand;
  readonly elapsedMs: number;
}

export interface PlayReportV1 {
  readonly version: 1;
  readonly releaseId: ReleaseId;
  readonly runId: string;
  readonly platform: "ios" | "android";
  readonly durationMs: number;
  readonly commands: readonly PlayReportCommandV1[];
  readonly observations: readonly PlayReportObservationV1[];
  readonly progressionChanges: readonly string[];
  readonly recoveryEvents: readonly { readonly code: string; readonly elapsedMs: number }[];
  readonly diagnosticCodes: readonly string[];
}
