import type { LocationReportProjection } from "../player/report.js";
import { isLocationReportProjection } from "../player/report.js";
import { isReleaseId } from "../release/identity.js";
import type { CanonicalJsonObject } from "../release/types.js";

export type SharedHuntReportEvent =
  | (CanonicalJsonObject & {
      readonly kind: "command";
      readonly elapsedMs: number;
      readonly commandAlias: string;
      readonly terminal:
        | "pending"
        | "accepted"
        | "no-op"
        | "rejected"
        | "invalid"
        | "blocked-revoked";
      readonly expectedVersion: number;
      readonly resultingVersion?: number;
      readonly outcomeCode?: string;
    })
  | (CanonicalJsonObject & {
      readonly kind: "location";
      readonly elapsedMs: number;
      readonly commandAlias: string;
      readonly projection: LocationReportProjection & CanonicalJsonObject;
    })
  | (CanonicalJsonObject & {
      readonly kind: "synchronization";
      readonly elapsedMs: number;
      readonly phase:
        | "offline"
        | "connecting"
        | "pulling"
        | "submitting"
        | "current"
        | "degraded"
        | "revoked";
      readonly disposition: string;
    })
  | (CanonicalJsonObject & {
      readonly kind: "recovery";
      readonly elapsedMs: number;
      readonly disposition: "resumed" | "snapshot-replaced" | "cursor-reset";
      readonly stateVersion?: number;
    })
  | (CanonicalJsonObject & {
      readonly kind: "diagnostic";
      readonly elapsedMs: number;
      readonly code: string;
      readonly commandAlias?: string;
    });

export interface SharedHuntReport {
  readonly releaseId: `sha256:${string}`;
  readonly sessionAlias: string;
  readonly selfAlias: "self";
  readonly platform: "ios" | "android";
  readonly durationMs: number;
  readonly completion: {
    readonly completedTargets: number;
    readonly totalTargets: number;
    readonly complete: boolean;
  };
  readonly events: readonly SharedHuntReportEvent[];
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exact(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function nonnegative(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function event(value: unknown): value is SharedHuntReportEvent {
  if (!object(value) || typeof value.kind !== "string" || !nonnegative(value.elapsedMs))
    return false;
  if (value.kind === "command") {
    return (
      exact(
        value,
        ["kind", "elapsedMs", "commandAlias", "terminal", "expectedVersion"],
        ["resultingVersion", "outcomeCode"],
      ) &&
      typeof value.commandAlias === "string" &&
      ["pending", "accepted", "no-op", "rejected", "invalid", "blocked-revoked"].includes(
        value.terminal as string,
      ) &&
      nonnegative(value.expectedVersion) &&
      (value.resultingVersion === undefined || nonnegative(value.resultingVersion)) &&
      (value.outcomeCode === undefined || typeof value.outcomeCode === "string")
    );
  }
  if (value.kind === "location") {
    return (
      exact(value, ["kind", "elapsedMs", "commandAlias", "projection"]) &&
      typeof value.commandAlias === "string" &&
      isLocationReportProjection(value.projection)
    );
  }
  if (value.kind === "synchronization") {
    return (
      exact(value, ["kind", "elapsedMs", "phase", "disposition"]) &&
      ["offline", "connecting", "pulling", "submitting", "current", "degraded", "revoked"].includes(
        value.phase as string,
      ) &&
      typeof value.disposition === "string"
    );
  }
  if (value.kind === "recovery") {
    return (
      exact(value, ["kind", "elapsedMs", "disposition"], ["stateVersion"]) &&
      ["resumed", "snapshot-replaced", "cursor-reset"].includes(value.disposition as string) &&
      (value.stateVersion === undefined || nonnegative(value.stateVersion))
    );
  }
  return (
    value.kind === "diagnostic" &&
    exact(value, ["kind", "elapsedMs", "code"], ["commandAlias"]) &&
    typeof value.code === "string" &&
    (value.commandAlias === undefined || typeof value.commandAlias === "string")
  );
}

export function isSharedHuntReport(value: unknown): value is SharedHuntReport {
  if (
    !object(value) ||
    !exact(value, [
      "releaseId",
      "sessionAlias",
      "selfAlias",
      "platform",
      "durationMs",
      "completion",
      "events",
    ])
  )
    return false;
  if (
    typeof value.releaseId !== "string" ||
    !isReleaseId(value.releaseId) ||
    typeof value.sessionAlias !== "string" ||
    value.selfAlias !== "self" ||
    !["ios", "android"].includes(value.platform as string) ||
    !nonnegative(value.durationMs) ||
    !object(value.completion) ||
    !exact(value.completion, ["completedTargets", "totalTargets", "complete"]) ||
    !nonnegative(value.completion.completedTargets) ||
    !nonnegative(value.completion.totalTargets) ||
    typeof value.completion.complete !== "boolean" ||
    !Array.isArray(value.events) ||
    !value.events.every(event)
  )
    return false;
  let elapsed = -1;
  for (const item of value.events) {
    if (item.elapsedMs < elapsed) return false;
    elapsed = item.elapsedMs;
  }
  return true;
}
