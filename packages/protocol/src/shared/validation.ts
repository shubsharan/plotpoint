import type { CanonicalJsonObject } from "../release/types.js";
import { isLocationObservation } from "../player/report.js";
import type {
  AuthorizedSnapshot,
  SharedAggregateTarget,
  SharedCommandIntent,
  SharedJoinRequest,
  SharedJoinResponse,
  SharedCommandStatus,
  SharedPlayView,
  SharedProjection,
  SharedTerminal,
  SyncCommandResult,
  SyncCommand,
  SyncPull,
} from "./types.js";

const KINDS = new Set(["player", "team", "session"]);
const TERMINALS = new Set<SharedTerminal>(["accepted", "no-op", "rejected", "invalid"]);
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

export function isSharedAggregateTarget(value: unknown): value is SharedAggregateTarget {
  return (
    object(value) &&
    keys(value, ["aggregateKind", "aggregateId", "schemaId"]) &&
    typeof value.aggregateKind === "string" &&
    KINDS.has(value.aggregateKind) &&
    nonempty(value.aggregateId) &&
    nonempty(value.schemaId)
  );
}

export function isSharedCommandIntent(value: unknown): value is SharedCommandIntent {
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
    isSharedAggregateTarget(value.target) &&
    nonnegative(value.expectedStateVersion) &&
    nonempty(value.type) &&
    canonical(value.payload) &&
    Array.isArray(value.observationIds) &&
    value.observationIds.every(nonempty) &&
    new Set(value.observationIds).size === value.observationIds.length
  );
}

export function isSharedProjection(value: unknown): value is SharedProjection {
  return (
    object(value) &&
    keys(value, ["aggregateKind", "aggregateId", "schemaId", "stateVersion", "value"]) &&
    isSharedAggregateTarget({
      aggregateKind: value.aggregateKind,
      aggregateId: value.aggregateId,
      schemaId: value.schemaId,
    }) &&
    nonnegative(value.stateVersion) &&
    canonical(value.value)
  );
}

export function isSharedCommandStatus(value: unknown): value is SharedCommandStatus {
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
    ACTION_TERMINALS.has(value.terminal as SharedTerminal | "pending" | "blocked-revoked") &&
    (value.outcomeCode === undefined || nonempty(value.outcomeCode)) &&
    (value.resultingStateVersion === undefined || nonnegative(value.resultingStateVersion))
  );
}

export function isSharedPlayView(value: unknown): value is SharedPlayView {
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
    value.projections.every(isSharedProjection) &&
    Array.isArray(value.actions) &&
    value.actions.every(isSharedCommandStatus)
  );
}

export function isSyncCommand(value: unknown): value is SyncCommand {
  return (
    object(value) &&
    keys(value, [
      "commandId",
      "target",
      "expectedStateVersion",
      "type",
      "payload",
      "observations",
    ]) &&
    isSharedCommandIntent({
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
    value.observations.every(isLocationObservation)
  );
}

export function isSyncCommandResult(value: unknown): value is SyncCommandResult {
  return (
    object(value) &&
    keys(
      value,
      [
        "commandId",
        "disposition",
        "terminal",
        "outcomeCode",
        "resultingStateVersion",
        "decisionPosition",
      ],
      ["capabilityEvidence"],
    ) &&
    nonempty(value.commandId) &&
    ["decided", "duplicate"].includes(value.disposition as string) &&
    typeof value.terminal === "string" &&
    TERMINALS.has(value.terminal as SharedTerminal) &&
    nonempty(value.outcomeCode) &&
    nonnegative(value.resultingStateVersion) &&
    nonempty(value.decisionPosition) &&
    (value.capabilityEvidence === undefined ||
      (Array.isArray(value.capabilityEvidence) &&
        value.capabilityEvidence.every(
          (item) =>
            object(item) &&
            keys(item, ["observationId", "capabilityId", "disposition"]) &&
            nonempty(item.observationId) &&
            nonempty(item.capabilityId) &&
            ["captured", "consumed", "denied", "expired"].includes(item.disposition as string),
        )))
  );
}

export function isAuthorizedSnapshot(value: unknown): value is AuthorizedSnapshot {
  return (
    object(value) &&
    keys(value, [
      "sessionId",
      "releaseId",
      "participantId",
      "teamId",
      "membershipStatus",
      "confirmedAt",
      "projections",
    ]) &&
    nonempty(value.sessionId) &&
    typeof value.releaseId === "string" &&
    isReleaseId(value.releaseId) &&
    nonempty(value.participantId) &&
    nonempty(value.teamId) &&
    ["active", "revoked"].includes(value.membershipStatus as string) &&
    nonempty(value.confirmedAt) &&
    Array.isArray(value.projections) &&
    value.projections.every(isSharedProjection)
  );
}

export function isSyncPull(value: unknown): value is SyncPull {
  return (
    object(value) &&
    keys(value, ["kind", "reset", "nextCursor", "snapshot", "commandResults"]) &&
    value.kind === "snapshot" &&
    typeof value.reset === "boolean" &&
    nonempty(value.nextCursor) &&
    isAuthorizedSnapshot(value.snapshot) &&
    Array.isArray(value.commandResults) &&
    value.commandResults.every(isSyncCommandResult)
  );
}

export function isSharedJoinRequest(value: unknown): value is SharedJoinRequest {
  return (
    object(value) &&
    keys(value, ["joinRequestId", "expectedReleaseId", "invitation", "participantCredential"]) &&
    nonempty(value.joinRequestId) &&
    isReleaseId(value.expectedReleaseId) &&
    nonempty(value.invitation) &&
    nonempty(value.participantCredential)
  );
}

export function isSharedJoinResponse(value: unknown): value is SharedJoinResponse {
  if (
    !object(value) ||
    !keys(value, ["participantId", "teamId", "releaseId", "disposition", "sync"]) ||
    !nonempty(value.participantId) ||
    !nonempty(value.teamId) ||
    !isReleaseId(value.releaseId) ||
    !["joined", "duplicate"].includes(value.disposition as string) ||
    !isSyncPull(value.sync)
  ) {
    return false;
  }
  return (
    value.releaseId === value.sync.snapshot.releaseId &&
    value.participantId === value.sync.snapshot.participantId &&
    value.teamId === value.sync.snapshot.teamId
  );
}
