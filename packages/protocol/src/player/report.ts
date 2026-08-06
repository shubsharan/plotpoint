import type { CanonicalJsonObject, ReleaseId } from "../release/types.js";

export const FOREGROUND_LOCATION_CAPABILITY = Object.freeze({
  id: "plotpoint.location.foreground",
  major: 1,
  minor: 0,
});

export type LocationAvailability = "available" | "permission-denied" | "unavailable" | "failed";
export type LocationRequestInput = Readonly<Record<string, never>>;

interface LocationObservationBase extends CanonicalJsonObject {
  readonly observationId: string;
  readonly recordedAt: string;
}

export type LocationObservation =
  | (LocationObservationBase & {
      readonly availability: "available";
      readonly capturedAt: string;
      readonly ageMs: number;
      readonly latitude: number;
      readonly longitude: number;
      readonly horizontalAccuracy: number;
    })
  | (LocationObservationBase & {
      readonly availability: "permission-denied" | "unavailable";
    })
  | (LocationObservationBase & {
      readonly availability: "failed";
      readonly diagnosticCode: string;
    });

function isObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function isRfc3339(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function hasValidBase(value: Record<string, unknown>): boolean {
  return (
    typeof value.observationId === "string" &&
    value.observationId.length > 0 &&
    isRfc3339(value.recordedAt)
  );
}

export function isLocationRequestInput(value: unknown): value is LocationRequestInput {
  return isObject(value) && hasExactKeys(value, []);
}

export function isLocationObservation(value: unknown): value is LocationObservation {
  if (!isObject(value) || !hasValidBase(value)) return false;
  if (value.availability === "available") {
    return (
      hasExactKeys(value, [
        "ageMs",
        "availability",
        "capturedAt",
        "horizontalAccuracy",
        "latitude",
        "longitude",
        "observationId",
        "recordedAt",
      ]) &&
      isRfc3339(value.capturedAt) &&
      Number.isSafeInteger(value.ageMs) &&
      !Object.is(value.ageMs, -0) &&
      typeof value.latitude === "number" &&
      Number.isFinite(value.latitude) &&
      value.latitude >= -90 &&
      value.latitude <= 90 &&
      typeof value.longitude === "number" &&
      Number.isFinite(value.longitude) &&
      value.longitude >= -180 &&
      value.longitude <= 180 &&
      typeof value.horizontalAccuracy === "number" &&
      Number.isFinite(value.horizontalAccuracy) &&
      value.horizontalAccuracy >= 0
    );
  }
  if (value.availability === "permission-denied" || value.availability === "unavailable") {
    return hasExactKeys(value, ["availability", "observationId", "recordedAt"]);
  }
  if (value.availability === "failed") {
    return (
      hasExactKeys(value, ["availability", "diagnosticCode", "observationId", "recordedAt"]) &&
      typeof value.diagnosticCode === "string" &&
      /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(value.diagnosticCode)
    );
  }
  return false;
}

export type AccuracyBand = "excellent" | "good" | "degraded" | "unknown";
export type RecencyBand = "fresh" | "stale" | "future" | "unknown";

export interface LocationReportProjection {
  readonly availability: LocationAvailability;
  readonly recencyBand: RecencyBand;
  readonly accuracyBand: AccuracyBand;
}

export function isLocationReportProjection(value: unknown): value is LocationReportProjection {
  return (
    isObject(value) &&
    hasExactKeys(value, ["accuracyBand", "availability", "recencyBand"]) &&
    ["available", "permission-denied", "unavailable", "failed"].includes(
      value.availability as string,
    ) &&
    ["fresh", "stale", "future", "unknown"].includes(value.recencyBand as string) &&
    ["excellent", "good", "degraded", "unknown"].includes(value.accuracyBand as string)
  );
}

export function accuracyBand(accuracy: number | undefined): AccuracyBand {
  if (accuracy === undefined || !Number.isFinite(accuracy) || accuracy < 0) return "unknown";
  if (accuracy <= 10) return "excellent";
  if (accuracy <= 30) return "good";
  return "degraded";
}

export function recencyBand(ageMs: number | undefined, maximumFreshAgeMs: number): RecencyBand {
  if (
    ageMs === undefined ||
    !Number.isSafeInteger(ageMs) ||
    Object.is(ageMs, -0) ||
    !Number.isSafeInteger(maximumFreshAgeMs) ||
    maximumFreshAgeMs < 0
  ) {
    return "unknown";
  }
  if (ageMs < 0) return "future";
  return ageMs <= maximumFreshAgeMs ? "fresh" : "stale";
}

export function projectLocationObservation(
  observation: LocationObservation,
  maximumFreshAgeMs: number,
): LocationReportProjection {
  return Object.freeze({
    availability: observation.availability,
    recencyBand:
      observation.availability === "available"
        ? recencyBand(observation.ageMs, maximumFreshAgeMs)
        : "unknown",
    accuracyBand:
      observation.availability === "available"
        ? accuracyBand(observation.horizontalAccuracy)
        : "unknown",
  });
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && !Object.is(value, -0);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function hasOnlyOptionalKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

declare const reportSafeDiagnosticCode: unique symbol;
export type ReportSafeDiagnosticCode = string & {
  readonly [reportSafeDiagnosticCode]: true;
};

export type GamePlayReportEvent =
  | {
      readonly kind: "lifecycle";
      readonly elapsedMs: number;
      readonly disposition: "mounted" | "recovered" | "unmounted" | "mount-failed";
    }
  | {
      readonly kind: "command";
      readonly elapsedMs: number;
      readonly scope: "local" | "shared";
      readonly commandAlias: string;
      readonly terminal:
        | "pending"
        | "accepted"
        | "no-op"
        | "rejected"
        | "invalid"
        | "blocked-revoked";
      readonly expectedStateVersion: number;
      readonly resultingStateVersion?: number;
    }
  | {
      readonly kind: "capability";
      readonly elapsedMs: number;
      readonly capabilityId: string;
      readonly disposition: "captured" | "consumed" | "denied" | "expired";
    }
  | {
      readonly kind: "synchronization";
      readonly elapsedMs: number;
      readonly phase:
        | "offline"
        | "connecting"
        | "submitting"
        | "pulling"
        | "current"
        | "degraded"
        | "revoked";
      readonly disposition:
        | "scheduled"
        | "coalesced"
        | "batch-claimed"
        | "submit-succeeded"
        | "submit-failed"
        | "pull-applied"
        | "pull-failed"
        | "membership-revoked";
    }
  | {
      readonly kind: "recovery";
      readonly elapsedMs: number;
      readonly disposition: "run-restored" | "join-resumed" | "snapshot-replaced" | "cursor-reset";
    }
  | {
      readonly kind: "diagnostic";
      readonly elapsedMs: number;
      readonly code: ReportSafeDiagnosticCode;
      readonly commandAlias?: string;
    };

export interface GamePlayReport {
  readonly releaseId: ReleaseId;
  readonly platform: "ios" | "android";
  readonly durationMs: number;
  readonly shared?: {
    readonly membership: "active" | "revoked";
  };
  readonly events: readonly GamePlayReportEvent[];
}

const REPORT_SAFE_DIAGNOSTIC_CODES: ReadonlySet<string> = new Set([
  "capability-expired",
  "delivery-interrupted",
  "runtime-mount-failed",
  "runtime-recovery-failed",
  "shared-membership-revoked",
  "shared-sync-failed",
]);

export function parseReportSafeDiagnosticCode(value: unknown): ReportSafeDiagnosticCode | null {
  return typeof value === "string" && REPORT_SAFE_DIAGNOSTIC_CODES.has(value)
    ? (value as ReportSafeDiagnosticCode)
    : null;
}

function isGamePlayReportEvent(value: unknown): value is GamePlayReportEvent {
  if (!isObject(value) || !isNonNegativeSafeInteger(value.elapsedMs)) return false;
  if (value.kind === "lifecycle") {
    return (
      hasExactKeys(value, ["disposition", "elapsedMs", "kind"]) &&
      ["mounted", "recovered", "unmounted", "mount-failed"].includes(value.disposition as string)
    );
  }
  if (value.kind === "command") {
    return (
      hasOnlyOptionalKeys(
        value,
        ["commandAlias", "elapsedMs", "expectedStateVersion", "kind", "scope", "terminal"],
        ["resultingStateVersion"],
      ) &&
      (value.scope === "local" || value.scope === "shared") &&
      isNonEmptyString(value.commandAlias) &&
      ["pending", "accepted", "no-op", "rejected", "invalid", "blocked-revoked"].includes(
        value.terminal as string,
      ) &&
      isNonNegativeSafeInteger(value.expectedStateVersion) &&
      (!Object.hasOwn(value, "resultingStateVersion") ||
        isNonNegativeSafeInteger(value.resultingStateVersion))
    );
  }
  if (value.kind === "capability") {
    return (
      hasExactKeys(value, ["capabilityId", "disposition", "elapsedMs", "kind"]) &&
      isNonEmptyString(value.capabilityId) &&
      ["captured", "consumed", "denied", "expired"].includes(value.disposition as string)
    );
  }
  if (value.kind === "synchronization") {
    return (
      hasExactKeys(value, ["disposition", "elapsedMs", "kind", "phase"]) &&
      ["offline", "connecting", "submitting", "pulling", "current", "degraded", "revoked"].includes(
        value.phase as string,
      ) &&
      [
        "scheduled",
        "coalesced",
        "batch-claimed",
        "submit-succeeded",
        "submit-failed",
        "pull-applied",
        "pull-failed",
        "membership-revoked",
      ].includes(value.disposition as string)
    );
  }
  if (value.kind === "recovery") {
    return (
      hasExactKeys(value, ["disposition", "elapsedMs", "kind"]) &&
      ["run-restored", "join-resumed", "snapshot-replaced", "cursor-reset"].includes(
        value.disposition as string,
      )
    );
  }
  return (
    value.kind === "diagnostic" &&
    hasOnlyOptionalKeys(value, ["code", "elapsedMs", "kind"], ["commandAlias"]) &&
    parseReportSafeDiagnosticCode(value.code) !== null &&
    (!Object.hasOwn(value, "commandAlias") || isNonEmptyString(value.commandAlias))
  );
}

export function isGamePlayReport(value: unknown): value is GamePlayReport {
  if (
    !isObject(value) ||
    !hasOnlyOptionalKeys(value, ["durationMs", "events", "platform", "releaseId"], ["shared"]) ||
    typeof value.releaseId !== "string" ||
    !/^sha256:[0-9a-f]{64}$/.test(value.releaseId) ||
    (value.platform !== "ios" && value.platform !== "android") ||
    !isNonNegativeSafeInteger(value.durationMs) ||
    !Array.isArray(value.events) ||
    (Object.hasOwn(value, "shared") &&
      (!isObject(value.shared) ||
        !hasExactKeys(value.shared, ["membership"]) ||
        (value.shared.membership !== "active" && value.shared.membership !== "revoked")))
  ) {
    return false;
  }
  let priorElapsedMs = -1;
  let priorKind = "";
  for (const event of value.events) {
    if (!isGamePlayReportEvent(event)) return false;
    if (event.elapsedMs < priorElapsedMs || event.elapsedMs > value.durationMs) return false;
    if (event.elapsedMs === priorElapsedMs && event.kind < priorKind) return false;
    priorElapsedMs = event.elapsedMs;
    priorKind = event.kind;
  }
  return true;
}
