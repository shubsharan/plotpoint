import type { CanonicalJsonObject } from "../release/types.js";
import { isLocationObservationV1 } from "../player/report.js";
import type {
  AuthorizedSnapshotV1,
  SharedAggregateTargetV1,
  SharedCommandIntentV1,
  SharedCommandStatusV1,
  SharedPlayViewV1,
  SharedProjectionV1,
  SharedTerminalV1,
  SyncCommandResultV1,
  SyncCommandV1,
  SyncPullV1,
} from "./types.js";

const KINDS = new Set(["player", "team", "session"]);
const TERMINALS = new Set<SharedTerminalV1>(["accepted", "no-op", "rejected", "invalid"]);
const ACTION_TERMINALS = new Set([...TERMINALS, "pending", "blocked-revoked"]);

function isReleaseId(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function object(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function keys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const actual = Object.keys(value).sort();
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) && actual.every((key) => allowed.has(key))
  );
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function nonnegative(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function positive(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function canonical(value: unknown): value is CanonicalJsonObject {
  if (!object(value)) return false;
  return Object.values(value).every((entry) => {
    if (entry === null || typeof entry === "string" || typeof entry === "boolean") return true;
    if (typeof entry === "number") return Number.isFinite(entry) && !Object.is(entry, -0);
    if (Array.isArray(entry))
      return entry.every((item) => {
        if (item === null || typeof item === "string" || typeof item === "boolean") return true;
        if (typeof item === "number") return Number.isFinite(item) && !Object.is(item, -0);
        return canonical(item);
      });
    return canonical(entry);
  });
}

export function isSharedAggregateTargetV1(value: unknown): value is SharedAggregateTargetV1 {
  return (
    object(value) &&
    keys(value, ["aggregateKind", "aggregateId", "schemaId", "schemaVersion"]) &&
    typeof value.aggregateKind === "string" &&
    KINDS.has(value.aggregateKind) &&
    nonempty(value.aggregateId) &&
    nonempty(value.schemaId) &&
    positive(value.schemaVersion)
  );
}

export function isSharedCommandIntentV1(value: unknown): value is SharedCommandIntentV1 {
  return (
    object(value) &&
    keys(value, [
      "commandId",
      "target",
      "expectedStateVersion",
      "type",
      "payload",
      "observationIds",
    ]) &&
    nonempty(value.commandId) &&
    isSharedAggregateTargetV1(value.target) &&
    nonnegative(value.expectedStateVersion) &&
    nonempty(value.type) &&
    canonical(value.payload) &&
    Array.isArray(value.observationIds) &&
    value.observationIds.every(nonempty) &&
    new Set(value.observationIds).size === value.observationIds.length
  );
}

export function isSharedProjectionV1(value: unknown): value is SharedProjectionV1 {
  return (
    object(value) &&
    keys(value, [
      "aggregateKind",
      "aggregateId",
      "schemaId",
      "schemaVersion",
      "stateVersion",
      "value",
    ]) &&
    isSharedAggregateTargetV1({
      aggregateKind: value.aggregateKind,
      aggregateId: value.aggregateId,
      schemaId: value.schemaId,
      schemaVersion: value.schemaVersion,
    }) &&
    nonnegative(value.stateVersion) &&
    canonical(value.value)
  );
}

export function isSharedCommandStatusV1(value: unknown): value is SharedCommandStatusV1 {
  return (
    object(value) &&
    keys(
      value,
      ["commandId", "disposition", "terminal"],
      ["outcomeCode", "resultingStateVersion"],
    ) &&
    nonempty(value.commandId) &&
    ["queued", "duplicate-pending", "already-terminal"].includes(value.disposition as string) &&
    typeof value.terminal === "string" &&
    ACTION_TERMINALS.has(value.terminal as SharedTerminalV1 | "pending" | "blocked-revoked") &&
    (value.outcomeCode === undefined || nonempty(value.outcomeCode)) &&
    (value.resultingStateVersion === undefined || nonnegative(value.resultingStateVersion))
  );
}

export function isSharedPlayViewV1(value: unknown): value is SharedPlayViewV1 {
  if (
    !object(value) ||
    !keys(value, [
      "sessionId",
      "releaseId",
      "transport",
      "synchronization",
      "confirmedAt",
      "membership",
      "projections",
      "actions",
    ])
  )
    return false;
  const membership = value.membership;
  return (
    nonempty(value.sessionId) &&
    typeof value.releaseId === "string" &&
    isReleaseId(value.releaseId) &&
    ["offline", "connecting", "online", "degraded"].includes(value.transport as string) &&
    ["current", "syncing", "recovery-required", "revoked"].includes(
      value.synchronization as string,
    ) &&
    (value.confirmedAt === null || nonempty(value.confirmedAt)) &&
    object(membership) &&
    keys(membership, ["status", "teamId"]) &&
    ["active", "revoked"].includes(membership.status as string) &&
    nonempty(membership.teamId) &&
    Array.isArray(value.projections) &&
    value.projections.every(isSharedProjectionV1) &&
    Array.isArray(value.actions) &&
    value.actions.every(isSharedCommandStatusV1)
  );
}

export function isSyncCommandV1(value: unknown): value is SyncCommandV1 {
  return (
    object(value) &&
    keys(value, [
      "version",
      "commandId",
      "target",
      "expectedStateVersion",
      "type",
      "payload",
      "observations",
    ]) &&
    value.version === 1 &&
    isSharedCommandIntentV1({
      commandId: value.commandId,
      target: value.target,
      expectedStateVersion: value.expectedStateVersion,
      type: value.type,
      payload: value.payload,
      observationIds: Array.isArray(value.observations)
        ? value.observations.map((observation) =>
            object(observation) ? observation.observationId : undefined,
          )
        : [],
    }) &&
    Array.isArray(value.observations) &&
    value.observations.every(isLocationObservationV1)
  );
}

export function isSyncCommandResultV1(value: unknown): value is SyncCommandResultV1 {
  return (
    object(value) &&
    keys(value, [
      "version",
      "commandId",
      "disposition",
      "terminal",
      "outcomeCode",
      "resultingStateVersion",
      "decisionPosition",
    ]) &&
    value.version === 1 &&
    nonempty(value.commandId) &&
    ["decided", "duplicate"].includes(value.disposition as string) &&
    typeof value.terminal === "string" &&
    TERMINALS.has(value.terminal as SharedTerminalV1) &&
    nonempty(value.outcomeCode) &&
    nonnegative(value.resultingStateVersion) &&
    nonempty(value.decisionPosition)
  );
}

export function isAuthorizedSnapshotV1(value: unknown): value is AuthorizedSnapshotV1 {
  return (
    object(value) &&
    keys(value, [
      "version",
      "sessionId",
      "releaseId",
      "participantId",
      "teamId",
      "membershipStatus",
      "confirmedAt",
      "projections",
    ]) &&
    value.version === 1 &&
    nonempty(value.sessionId) &&
    typeof value.releaseId === "string" &&
    isReleaseId(value.releaseId) &&
    nonempty(value.participantId) &&
    nonempty(value.teamId) &&
    ["active", "revoked"].includes(value.membershipStatus as string) &&
    nonempty(value.confirmedAt) &&
    Array.isArray(value.projections) &&
    value.projections.every(isSharedProjectionV1)
  );
}

export function isSyncPullV1(value: unknown): value is SyncPullV1 {
  return (
    object(value) &&
    keys(value, ["version", "kind", "reset", "nextCursor", "snapshot", "commandResults"]) &&
    value.version === 1 &&
    value.kind === "snapshot" &&
    typeof value.reset === "boolean" &&
    nonempty(value.nextCursor) &&
    isAuthorizedSnapshotV1(value.snapshot) &&
    Array.isArray(value.commandResults) &&
    value.commandResults.every(isSyncCommandResultV1)
  );
}
