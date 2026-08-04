import type { CanonicalJsonObject, ReleaseId } from "../release/types.js";

export const FOREGROUND_LOCATION_CAPABILITY = Object.freeze({
  id: "plotpoint.location.foreground",
  major: 1,
  minor: 0,
});

export type LocationAvailability = "available" | "permission-denied" | "unavailable" | "failed";
export type LocationRequestInputV1 = Readonly<Record<string, never>>;

interface LocationObservationBaseV1 {
  readonly version: 1;
  readonly observationId: string;
  readonly recordedAt: string;
}

export type LocationObservationV1 =
  | (LocationObservationBaseV1 & {
      readonly availability: "available";
      readonly capturedAt: string;
      readonly ageMs: number;
      readonly latitude: number;
      readonly longitude: number;
      readonly horizontalAccuracy: number;
    })
  | (LocationObservationBaseV1 & {
      readonly availability: "permission-denied" | "unavailable";
    })
  | (LocationObservationBaseV1 & {
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
    value.version === 1 &&
    typeof value.observationId === "string" &&
    value.observationId.length > 0 &&
    isRfc3339(value.recordedAt)
  );
}

export function isLocationRequestInputV1(value: unknown): value is LocationRequestInputV1 {
  return isObject(value) && hasExactKeys(value, []);
}

export function isLocationObservationV1(value: unknown): value is LocationObservationV1 {
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
        "version",
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
    return hasExactKeys(value, ["availability", "observationId", "recordedAt", "version"]);
  }
  if (value.availability === "failed") {
    return (
      hasExactKeys(value, [
        "availability",
        "diagnosticCode",
        "observationId",
        "recordedAt",
        "version",
      ]) &&
      typeof value.diagnosticCode === "string" &&
      /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(value.diagnosticCode)
    );
  }
  return false;
}

export type AccuracyBand = "excellent" | "good" | "degraded" | "unknown";
export type RecencyBand = "fresh" | "stale" | "future" | "unknown";

export interface LocationReportProjectionV1 {
  readonly availability: LocationAvailability;
  readonly recencyBand: RecencyBand;
  readonly accuracyBand: AccuracyBand;
}

export function isLocationReportProjectionV1(value: unknown): value is LocationReportProjectionV1 {
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

export function projectLocationObservationV1(
  observation: LocationObservationV1,
  maximumFreshAgeMs: number,
): LocationReportProjectionV1 {
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

export interface PlayReportCommandEventV1 {
  readonly kind: "command";
  readonly elapsedMs: number;
  readonly commandId: string;
  readonly terminal: "accepted" | "no-op" | "rejected" | "invalid";
  readonly expectedVersion: number;
  readonly resultingVersion: number;
  readonly outcomeCode?: string;
  readonly progressionChanges: readonly string[];
}

export interface PlayReportCapabilityEventV1 {
  readonly kind: "capability";
  readonly elapsedMs: number;
  readonly capability: {
    readonly id: string;
    readonly major: number;
  };
  readonly recordId: string;
  readonly outcomeCode: string;
  readonly projection: CanonicalJsonObject;
}

export interface PlayReportLifecycleEventV1 {
  readonly kind: "lifecycle";
  readonly elapsedMs: number;
  readonly phase: string;
  readonly disposition: string;
  readonly commandId?: string;
  readonly diagnosticCode?: string;
}

export interface PlayReportDiagnosticEventV1 {
  readonly kind: "diagnostic";
  readonly elapsedMs: number;
  readonly code: string;
  readonly commandId?: string;
}

export type PlayReportEventV1 =
  | PlayReportCommandEventV1
  | PlayReportCapabilityEventV1
  | PlayReportLifecycleEventV1
  | PlayReportDiagnosticEventV1;

export interface PlayReportV1 {
  readonly version: 1;
  readonly releaseId: ReleaseId;
  readonly runId: string;
  readonly platform: "ios" | "android";
  readonly durationMs: number;
  readonly events: readonly PlayReportEventV1[];
}

export interface CapabilityReportProjectionValidator {
  readonly capability: { readonly id: string; readonly major: number };
  validate(projection: unknown): boolean;
}

export const LOCATION_REPORT_PROJECTION_VALIDATOR_V1: CapabilityReportProjectionValidator =
  Object.freeze({
    capability: Object.freeze({
      id: FOREGROUND_LOCATION_CAPABILITY.id,
      major: FOREGROUND_LOCATION_CAPABILITY.major,
    }),
    validate: isLocationReportProjectionV1,
  });

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && !Object.is(value, -0);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isStableCode(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isCanonicalJsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value) && !Object.is(value, -0);
  if (Array.isArray(value)) return value.every(isCanonicalJsonValue);
  return isObject(value) && Object.values(value).every(isCanonicalJsonValue);
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

function isCommandEvent(value: Record<string, unknown>): boolean {
  return (
    hasOnlyOptionalKeys(
      value,
      [
        "commandId",
        "elapsedMs",
        "expectedVersion",
        "kind",
        "progressionChanges",
        "resultingVersion",
        "terminal",
      ],
      ["outcomeCode"],
    ) &&
    isNonNegativeSafeInteger(value.elapsedMs) &&
    isNonEmptyString(value.commandId) &&
    ["accepted", "no-op", "rejected", "invalid"].includes(value.terminal as string) &&
    isNonNegativeSafeInteger(value.expectedVersion) &&
    isNonNegativeSafeInteger(value.resultingVersion) &&
    (!Object.hasOwn(value, "outcomeCode") || isStableCode(value.outcomeCode)) &&
    isStringArray(value.progressionChanges)
  );
}

function isCapabilityEvent(
  value: Record<string, unknown>,
  validators: readonly CapabilityReportProjectionValidator[],
): boolean {
  const requestedCapability = value.capability;
  if (
    !hasExactKeys(value, [
      "capability",
      "elapsedMs",
      "kind",
      "outcomeCode",
      "projection",
      "recordId",
    ]) ||
    !isNonNegativeSafeInteger(value.elapsedMs) ||
    !isObject(requestedCapability) ||
    !hasExactKeys(requestedCapability, ["id", "major"]) ||
    !isNonEmptyString(requestedCapability.id) ||
    !Number.isSafeInteger(requestedCapability.major) ||
    (requestedCapability.major as number) <= 0 ||
    !isNonEmptyString(value.recordId) ||
    !isStableCode(value.outcomeCode) ||
    !isObject(value.projection) ||
    !isCanonicalJsonValue(value.projection)
  ) {
    return false;
  }
  const validator = validators.find(
    ({ capability }) =>
      capability.id === requestedCapability.id && capability.major === requestedCapability.major,
  );
  return validator !== undefined && validator.validate(value.projection);
}

function isLifecycleEvent(value: Record<string, unknown>): boolean {
  return (
    hasOnlyOptionalKeys(
      value,
      ["disposition", "elapsedMs", "kind", "phase"],
      ["commandId", "diagnosticCode"],
    ) &&
    isNonNegativeSafeInteger(value.elapsedMs) &&
    isStableCode(value.phase) &&
    isStableCode(value.disposition) &&
    (!Object.hasOwn(value, "commandId") || isNonEmptyString(value.commandId)) &&
    (!Object.hasOwn(value, "diagnosticCode") || isStableCode(value.diagnosticCode))
  );
}

function isDiagnosticEvent(value: Record<string, unknown>): boolean {
  return (
    hasOnlyOptionalKeys(value, ["code", "elapsedMs", "kind"], ["commandId"]) &&
    isNonNegativeSafeInteger(value.elapsedMs) &&
    isStableCode(value.code) &&
    (!Object.hasOwn(value, "commandId") || isNonEmptyString(value.commandId))
  );
}

function isPlayReportEvent(
  value: unknown,
  validators: readonly CapabilityReportProjectionValidator[],
): value is PlayReportEventV1 {
  if (!isObject(value)) return false;
  if (value.kind === "command") return isCommandEvent(value);
  if (value.kind === "capability") return isCapabilityEvent(value, validators);
  if (value.kind === "lifecycle") return isLifecycleEvent(value);
  if (value.kind === "diagnostic") return isDiagnosticEvent(value);
  return false;
}

export function isPlayReportV1(
  value: unknown,
  projectionValidators: readonly CapabilityReportProjectionValidator[] = [],
): value is PlayReportV1 {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ["durationMs", "events", "platform", "releaseId", "runId", "version"]) ||
    value.version !== 1 ||
    typeof value.releaseId !== "string" ||
    !/^sha256:[0-9a-f]{64}$/.test(value.releaseId) ||
    !isNonEmptyString(value.runId) ||
    (value.platform !== "ios" && value.platform !== "android") ||
    !isNonNegativeSafeInteger(value.durationMs) ||
    !Array.isArray(value.events)
  ) {
    return false;
  }
  let priorElapsedMs = -1;
  for (const event of value.events) {
    if (!isPlayReportEvent(event, projectionValidators)) return false;
    if (event.elapsedMs < priorElapsedMs || event.elapsedMs > value.durationMs) return false;
    priorElapsedMs = event.elapsedMs;
  }
  return true;
}
