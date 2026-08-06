import {
  isLocationObservation,
  isSharedCommandIntent,
  isSyncPull,
  type LocationObservation,
  type SharedCommandIntent,
  type SharedCommandStatus,
  type SharedPlayView,
  type SharedProjection,
  type SyncCommandResult,
  type SyncPull,
} from "@plotpoint/protocol";
import { canonicalizeValue } from "@plotpoint/runtime";

import { PLAYER_DATABASE_INCOMPATIBLE } from "../persistence/schema-policy";

export const SHARED_MIGRATION = `
CREATE TABLE IF NOT EXISTS game_play_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(run_id), committed_at TEXT NOT NULL,
  elapsed_ms INTEGER NOT NULL, kind TEXT NOT NULL,
  command_id TEXT, evidence_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS game_play_events_run ON game_play_events(run_id, sequence);
CREATE TRIGGER IF NOT EXISTS game_play_events_no_update
BEFORE UPDATE ON game_play_events BEGIN
  SELECT RAISE(ABORT, 'game-play-evidence-immutable');
END;
CREATE TRIGGER IF NOT EXISTS game_play_events_no_delete
BEFORE DELETE ON game_play_events BEGIN
  SELECT RAISE(ABORT, 'game-play-evidence-immutable');
END;
CREATE TABLE IF NOT EXISTS pending_shared_joins (
  session_id TEXT PRIMARY KEY, run_id TEXT NOT NULL UNIQUE REFERENCES runs(run_id),
  expected_release_id TEXT NOT NULL, service_origin TEXT NOT NULL, join_request_id TEXT NOT NULL,
  invitation_digest TEXT NOT NULL, envelope_key TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('preparing','ready','submitting'))
);
CREATE TABLE IF NOT EXISTS shared_sessions (
  session_id TEXT PRIMARY KEY, run_id TEXT NOT NULL UNIQUE REFERENCES runs(run_id), release_id TEXT NOT NULL,
  participant_id TEXT NOT NULL, team_id TEXT NOT NULL, service_origin TEXT NOT NULL,
  envelope_key TEXT NOT NULL,
  membership_status TEXT NOT NULL CHECK(membership_status IN ('active','revoked')),
  transport_status TEXT NOT NULL CHECK(transport_status IN ('offline','connecting','online','degraded')),
  sync_status TEXT NOT NULL CHECK(sync_status IN ('current','syncing','recovery-required','revoked')),
  cursor TEXT NOT NULL DEFAULT '0', confirmed_at TEXT
);
CREATE TABLE IF NOT EXISTS shared_outbox (
  session_id TEXT NOT NULL REFERENCES shared_sessions(session_id), command_id TEXT NOT NULL,
  intent_json TEXT NOT NULL,
  target_json TEXT NOT NULL, expected_state_version INTEGER NOT NULL, command_type TEXT NOT NULL,
  payload_json TEXT NOT NULL, observation_ids_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','submitting','blocked-revoked')),
  enqueued_at TEXT NOT NULL, PRIMARY KEY(session_id, command_id)
);
CREATE TABLE IF NOT EXISTS shared_projections (
  session_id TEXT NOT NULL REFERENCES shared_sessions(session_id), aggregate_kind TEXT NOT NULL,
  aggregate_id TEXT NOT NULL, schema_id TEXT NOT NULL,
  state_version INTEGER NOT NULL, value_json TEXT NOT NULL,
  PRIMARY KEY(session_id, aggregate_kind, aggregate_id, schema_id)
);
CREATE TABLE IF NOT EXISTS shared_results (
  session_id TEXT NOT NULL REFERENCES shared_sessions(session_id), command_id TEXT NOT NULL,
  intent_json TEXT NOT NULL,
  terminal TEXT NOT NULL CHECK(terminal IN ('accepted','no-op','rejected','invalid')),
  outcome_code TEXT NOT NULL, resulting_state_version INTEGER NOT NULL, expected_state_version INTEGER NOT NULL,
  observation_ids_json TEXT NOT NULL,
  decision_position TEXT NOT NULL, decided_at TEXT NOT NULL, PRIMARY KEY(session_id, command_id)
);
CREATE TABLE IF NOT EXISTS shared_sync_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL REFERENCES shared_sessions(session_id),
  elapsed_ms INTEGER NOT NULL, phase TEXT NOT NULL, disposition TEXT NOT NULL, command_id TEXT
);
CREATE INDEX IF NOT EXISTS shared_outbox_status ON shared_outbox(session_id, status, enqueued_at);
CREATE INDEX IF NOT EXISTS shared_sync_events_session ON shared_sync_events(session_id, sequence);
CREATE TRIGGER IF NOT EXISTS pending_shared_join_no_bound_insert
BEFORE INSERT ON pending_shared_joins
WHEN EXISTS (SELECT 1 FROM shared_sessions WHERE run_id=NEW.run_id OR session_id=NEW.session_id)
BEGIN
  SELECT RAISE(ABORT, 'shared-run-binding-conflict');
END;
CREATE TRIGGER IF NOT EXISTS pending_shared_join_immutable
BEFORE UPDATE OF session_id,run_id,expected_release_id,service_origin,join_request_id,
  invitation_digest,envelope_key,request_digest ON pending_shared_joins
WHEN OLD.session_id IS NOT NEW.session_id
  OR OLD.run_id IS NOT NEW.run_id
  OR OLD.expected_release_id IS NOT NEW.expected_release_id
  OR OLD.service_origin IS NOT NEW.service_origin
  OR OLD.join_request_id IS NOT NEW.join_request_id
  OR OLD.invitation_digest IS NOT NEW.invitation_digest
  OR OLD.envelope_key IS NOT NEW.envelope_key
  OR OLD.request_digest IS NOT NEW.request_digest
BEGIN
  SELECT RAISE(ABORT, 'shared-pending-join-immutable');
END;
CREATE TRIGGER IF NOT EXISTS shared_session_no_pending_insert
BEFORE INSERT ON shared_sessions
WHEN EXISTS (SELECT 1 FROM pending_shared_joins WHERE run_id=NEW.run_id OR session_id=NEW.session_id)
BEGIN
  SELECT RAISE(ABORT, 'shared-run-binding-conflict');
END;
CREATE TRIGGER IF NOT EXISTS shared_session_binding_immutable
BEFORE UPDATE OF session_id,run_id,release_id,participant_id,team_id,service_origin,envelope_key
ON shared_sessions
WHEN OLD.session_id IS NOT NEW.session_id
  OR OLD.run_id IS NOT NEW.run_id
  OR OLD.release_id IS NOT NEW.release_id
  OR OLD.participant_id IS NOT NEW.participant_id
  OR OLD.team_id IS NOT NEW.team_id
  OR OLD.service_origin IS NOT NEW.service_origin
  OR OLD.envelope_key IS NOT NEW.envelope_key
BEGIN
  SELECT RAISE(ABORT, 'shared-session-binding-immutable');
END;
CREATE TRIGGER IF NOT EXISTS shared_session_membership_monotonic
BEFORE UPDATE OF membership_status ON shared_sessions
WHEN OLD.membership_status='revoked' AND NEW.membership_status='active'
BEGIN
  SELECT RAISE(ABORT, 'membership-reactivation-conflict');
END;
`;

const SHARED_SCHEMA_COLUMNS = Object.freeze({
  pending_shared_joins: [
    "session_id",
    "run_id",
    "expected_release_id",
    "service_origin",
    "join_request_id",
    "invitation_digest",
    "envelope_key",
    "request_digest",
    "status",
  ],
  shared_sessions: [
    "session_id",
    "run_id",
    "release_id",
    "participant_id",
    "team_id",
    "service_origin",
    "envelope_key",
    "membership_status",
    "transport_status",
    "sync_status",
    "cursor",
    "confirmed_at",
  ],
  shared_outbox: [
    "session_id",
    "command_id",
    "intent_json",
    "target_json",
    "expected_state_version",
    "command_type",
    "payload_json",
    "observation_ids_json",
    "status",
    "enqueued_at",
  ],
  shared_projections: [
    "session_id",
    "aggregate_kind",
    "aggregate_id",
    "schema_id",
    "state_version",
    "value_json",
  ],
  shared_results: [
    "session_id",
    "command_id",
    "intent_json",
    "terminal",
    "outcome_code",
    "resulting_state_version",
    "expected_state_version",
    "observation_ids_json",
    "decision_position",
    "decided_at",
  ],
  shared_sync_events: [
    "sequence",
    "session_id",
    "elapsed_ms",
    "phase",
    "disposition",
    "command_id",
  ],
} as const);

const SHARED_SCHEMA_TRIGGERS = Object.freeze([
  "game_play_events_no_delete",
  "game_play_events_no_update",
  "pending_shared_join_no_bound_insert",
  "pending_shared_join_immutable",
  "shared_session_no_pending_insert",
  "shared_session_binding_immutable",
  "shared_session_membership_monotonic",
]);

export const SHARED_DATABASE_TABLES = Object.freeze(Object.keys(SHARED_SCHEMA_COLUMNS));

export interface SharedSqlDatabase {
  execAsync(query: string): Promise<void>;
  runAsync(query: string, ...parameters: unknown[]): Promise<{ readonly changes?: number }>;
  getFirstAsync<T>(query: string, ...parameters: unknown[]): Promise<T | null>;
  getAllAsync<T>(query: string, ...parameters: unknown[]): Promise<T[]>;
  withExclusiveTransactionAsync(
    operation: (database: SharedSqlDatabase) => Promise<void>,
  ): Promise<void>;
}

export interface PendingSharedJoin {
  readonly sessionId: string;
  readonly runId: string;
  readonly expectedReleaseId: `sha256:${string}`;
  readonly serviceOrigin: string;
  readonly joinRequestId: string;
  readonly invitationDigest: string;
  readonly envelopeKey: string;
  readonly requestDigest: string;
  readonly status: "preparing" | "ready" | "submitting";
}

export type PendingSharedJoinInput = Omit<PendingSharedJoin, "status">;

export interface SharedBindingContext {
  readonly sessionId: string;
  readonly runId: string;
  readonly expectedReleaseId: `sha256:${string}`;
  readonly serviceOrigin: string;
  readonly envelopeKey: string;
}

export interface SharedJoinResponseIdentity {
  readonly releaseId: `sha256:${string}`;
  readonly participantId: string;
  readonly teamId: string;
}

export interface SharedSessionRecord {
  readonly sessionId: string;
  readonly runId: string;
  readonly releaseId: `sha256:${string}`;
  readonly participantId: string;
  readonly teamId: string;
  readonly serviceOrigin: string;
  readonly envelopeKey: string;
}

export type SharedOutboxStatus = "queued" | "submitting" | "blocked-revoked";

export interface SharedOutboxRecord {
  readonly sessionId: string;
  readonly commandId: string;
  readonly target: SharedCommandIntent["target"];
  readonly expectedStateVersion: number;
  readonly commandType: string;
  readonly payload: SharedCommandIntent["payload"];
  readonly observationIds: readonly string[];
  readonly status: SharedOutboxStatus;
  readonly enqueuedAt: string;
}

export interface SubmissionBatch {
  readonly sessionId: string;
  readonly commands: readonly SharedOutboxRecord[];
}

interface StoredSessionBinding {
  readonly session_id: string;
  readonly run_id: string;
  readonly release_id: `sha256:${string}`;
  readonly participant_id: string;
  readonly team_id: string;
  readonly service_origin: string;
  readonly envelope_key: string;
  readonly membership_status: "active" | "revoked";
  readonly sync_status: SharedPlayView["synchronization"];
}

interface StoredPendingSharedJoin {
  readonly session_id: string;
  readonly run_id: string;
  readonly expected_release_id: `sha256:${string}`;
  readonly service_origin: string;
  readonly join_request_id: string;
  readonly invitation_digest: string;
  readonly envelope_key: string;
  readonly request_digest: string;
  readonly status: PendingSharedJoin["status"];
}

interface StoredRun {
  readonly release_id: `sha256:${string}`;
  readonly status: "active" | "completed" | "invalid";
}

interface StoredOutboxRow {
  readonly session_id: string;
  readonly command_id: string;
  readonly intent_json: string;
  readonly target_json: string;
  readonly expected_state_version: number;
  readonly command_type: string;
  readonly payload_json: string;
  readonly observation_ids_json: string;
  readonly status: SharedOutboxStatus;
  readonly enqueued_at: string;
}

interface StoredResultRow {
  readonly intent_json: string;
  readonly terminal: SyncCommandResult["terminal"];
  readonly outcome_code: string;
  readonly resulting_state_version: number;
  readonly expected_state_version: number;
  readonly observation_ids_json: string;
  readonly decision_position: string;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Readonly<Record<string, unknown>>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

function canonicalIntent(command: SharedCommandIntent): string {
  const canonical = canonicalizeValue(command);
  if (canonical.kind !== "valid") throw new Error("shared-command-invalid");
  return canonical.canonical.text;
}

function canonicalServiceOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username !== "" ||
      url.password !== ""
    ) {
      throw new Error("shared-service-origin-invalid");
    }
    return url.origin;
  } catch (error) {
    if (error instanceof Error && error.message === "shared-service-origin-invalid") throw error;
    throw new Error("shared-service-origin-invalid");
  }
}

function parsePendingSharedJoin(row: StoredPendingSharedJoin): PendingSharedJoin {
  return deepFreeze({
    sessionId: row.session_id,
    runId: row.run_id,
    expectedReleaseId: row.expected_release_id,
    serviceOrigin: row.service_origin,
    joinRequestId: row.join_request_id,
    invitationDigest: row.invitation_digest,
    envelopeKey: row.envelope_key,
    requestDigest: row.request_digest,
    status: row.status,
  });
}

function pendingJoinMatches(row: StoredPendingSharedJoin, input: PendingSharedJoinInput): boolean {
  return (
    row.session_id === input.sessionId &&
    row.run_id === input.runId &&
    row.expected_release_id === input.expectedReleaseId &&
    row.service_origin === input.serviceOrigin &&
    row.join_request_id === input.joinRequestId &&
    row.invitation_digest === input.invitationDigest &&
    row.envelope_key === input.envelopeKey &&
    row.request_digest === input.requestDigest
  );
}

function bindingMatches(
  row: StoredSessionBinding,
  context: SharedBindingContext,
  response?: SharedJoinResponseIdentity,
): boolean {
  return (
    row.session_id === context.sessionId &&
    row.run_id === context.runId &&
    row.release_id === context.expectedReleaseId &&
    row.service_origin === context.serviceOrigin &&
    row.envelope_key === context.envelopeKey &&
    (response === undefined ||
      (row.release_id === response.releaseId &&
        row.participant_id === response.participantId &&
        row.team_id === response.teamId))
  );
}

function parseOutboxRow(row: StoredOutboxRow, status = row.status): SharedOutboxRecord {
  const command: unknown = {
    commandId: row.command_id,
    target: JSON.parse(row.target_json),
    expectedStateVersion: row.expected_state_version,
    type: row.command_type,
    payload: JSON.parse(row.payload_json),
    observationIds: JSON.parse(row.observation_ids_json),
  };
  if (!isSharedCommandIntent(command)) throw new Error("shared-outbox-corrupt");
  return deepFreeze({
    sessionId: row.session_id,
    commandId: command.commandId,
    target: command.target,
    expectedStateVersion: command.expectedStateVersion,
    commandType: command.type,
    payload: command.payload,
    observationIds: command.observationIds,
    status,
    enqueuedAt: row.enqueued_at,
  });
}

function assertUniquePullCollections(pull: SyncPull): void {
  const projectionKeys = new Set<string>();
  for (const projection of pull.snapshot.projections) {
    const key = JSON.stringify([
      projection.aggregateKind,
      projection.aggregateId,
      projection.schemaId,
    ]);
    if (projectionKeys.has(key)) throw new Error("shared-projection-duplicate");
    projectionKeys.add(key);
  }

  const commandIds = new Set<string>();
  for (const result of pull.commandResults) {
    if (commandIds.has(result.commandId)) throw new Error("shared-result-duplicate");
    commandIds.add(result.commandId);
  }
}

function resultMatches(row: StoredResultRow, result: SyncCommandResult): boolean {
  return (
    row.terminal === result.terminal &&
    row.outcome_code === result.outcomeCode &&
    row.resulting_state_version === result.resultingStateVersion &&
    row.decision_position === result.decisionPosition
  );
}

function sameColumns(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length && actual.every((name, index) => name === expected[index])
  );
}

async function hasCorrectedSharedSchema(database: SharedSqlDatabase): Promise<boolean> {
  for (const [table, expected] of Object.entries(SHARED_SCHEMA_COLUMNS)) {
    const actual = (
      await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`)
    ).map(({ name }) => name);
    if (!sameColumns(actual, expected)) return false;
  }
  const triggers = (
    await database.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master
       WHERE type='trigger' AND name IN (${SHARED_SCHEMA_TRIGGERS.map(() => "?").join(",")})
       ORDER BY name`,
      ...SHARED_SCHEMA_TRIGGERS,
    )
  ).map(({ name }) => name);
  return sameColumns(triggers, [...SHARED_SCHEMA_TRIGGERS].sort());
}

export async function assertSharedDatabaseSchema(database: SharedSqlDatabase): Promise<void> {
  const tables = SHARED_DATABASE_TABLES;
  const existingSharedTables = await database.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name IN (${tables.map(() => "?").join(",")})`,
    ...tables,
  );
  if (existingSharedTables.length > 0 && !(await hasCorrectedSharedSchema(database))) {
    throw new Error(PLAYER_DATABASE_INCOMPATIBLE);
  }
}

export async function migrateSharedDatabase(database: SharedSqlDatabase): Promise<void> {
  await assertSharedDatabaseSchema(database);
  await database.execAsync(SHARED_MIGRATION);
  if (!(await hasCorrectedSharedSchema(database))) {
    throw new Error(PLAYER_DATABASE_INCOMPATIBLE);
  }
}

export class SharedSyncStore {
  constructor(
    private readonly database: SharedSqlDatabase,
    private readonly validateReleasePull: (pull: SyncPull) => boolean = () => true,
  ) {}

  async reservePendingJoin(input: PendingSharedJoinInput): Promise<PendingSharedJoin> {
    const candidate = {
      ...input,
      serviceOrigin: canonicalServiceOrigin(input.serviceOrigin),
    };
    if (
      Object.entries(candidate).some(
        ([key, value]) =>
          key !== "expectedReleaseId" && (typeof value !== "string" || value === ""),
      ) ||
      !/^sha256:[0-9a-f]{64}$/.test(candidate.expectedReleaseId)
    ) {
      throw new Error("shared-pending-join-invalid");
    }
    let output: PendingSharedJoin | undefined;
    await this.database.withExclusiveTransactionAsync(async (tx) => {
      const existing = await tx.getFirstAsync<StoredPendingSharedJoin>(
        "SELECT * FROM pending_shared_joins WHERE run_id=? OR session_id=? LIMIT 1",
        candidate.runId,
        candidate.sessionId,
      );
      if (existing !== null) {
        if (!pendingJoinMatches(existing, candidate)) {
          throw new Error("shared-pending-join-conflict");
        }
        output = parsePendingSharedJoin(existing);
        return;
      }
      const run = await tx.getFirstAsync<StoredRun>(
        "SELECT release_id,status FROM runs WHERE run_id=?",
        candidate.runId,
      );
      if (run === null || run.status !== "active") throw new Error("shared-run-not-active");
      if (run.release_id !== candidate.expectedReleaseId) {
        throw new Error("shared-run-release-mismatch");
      }
      const bound = await tx.getFirstAsync<{ session_id: string }>(
        "SELECT session_id FROM shared_sessions WHERE run_id=? OR session_id=? LIMIT 1",
        candidate.runId,
        candidate.sessionId,
      );
      if (bound !== null) throw new Error("shared-run-binding-conflict");
      await tx.runAsync(
        `INSERT INTO pending_shared_joins
         (session_id,run_id,expected_release_id,service_origin,join_request_id,
          invitation_digest,envelope_key,request_digest,status)
         VALUES (?,?,?,?,?,?,?,?,'preparing')`,
        candidate.sessionId,
        candidate.runId,
        candidate.expectedReleaseId,
        candidate.serviceOrigin,
        candidate.joinRequestId,
        candidate.invitationDigest,
        candidate.envelopeKey,
        candidate.requestDigest,
      );
      output = deepFreeze({ ...candidate, status: "preparing" });
    });
    if (output === undefined) throw new Error("shared-pending-join-reservation-incomplete");
    return output;
  }

  async markPendingJoinReady(runId: string, requestDigest: string): Promise<PendingSharedJoin> {
    return this.advancePendingJoin(runId, requestDigest, "ready");
  }

  async markPendingJoinSubmitting(
    runId: string,
    requestDigest: string,
  ): Promise<PendingSharedJoin> {
    return this.advancePendingJoin(runId, requestDigest, "submitting");
  }

  async pendingJoinForRun(runId: string): Promise<PendingSharedJoin | null> {
    const row = await this.database.getFirstAsync<StoredPendingSharedJoin>(
      "SELECT * FROM pending_shared_joins WHERE run_id=?",
      runId,
    );
    return row === null ? null : parsePendingSharedJoin(row);
  }

  async commitJoinedSession(input: {
    readonly context: SharedBindingContext;
    readonly response: SharedJoinResponseIdentity;
    readonly pull: SyncPull;
  }): Promise<void> {
    const joinContext = {
      ...input.context,
      serviceOrigin: canonicalServiceOrigin(input.context.serviceOrigin),
    };
    if (
      !isSyncPull(input.pull) ||
      !this.validateReleasePull(input.pull) ||
      input.pull.snapshot.sessionId !== joinContext.sessionId ||
      input.response.releaseId !== joinContext.expectedReleaseId ||
      input.pull.snapshot.releaseId !== joinContext.expectedReleaseId ||
      input.pull.snapshot.participantId !== input.response.participantId ||
      input.pull.snapshot.teamId !== input.response.teamId
    ) {
      throw new Error("shared-join-snapshot-invalid");
    }
    assertUniquePullCollections(input.pull);
    await this.database.withExclusiveTransactionAsync(async (tx) => {
      const run = await tx.getFirstAsync<StoredRun>(
        "SELECT release_id,status FROM runs WHERE run_id=?",
        joinContext.runId,
      );
      if (run === null || run.status !== "active") throw new Error("shared-run-not-active");
      if (run.release_id !== joinContext.expectedReleaseId) {
        throw new Error("shared-run-release-mismatch");
      }
      const existingForSession = await tx.getFirstAsync<StoredSessionBinding>(
        "SELECT * FROM shared_sessions WHERE session_id=?",
        joinContext.sessionId,
      );
      if (existingForSession !== null) {
        if (!bindingMatches(existingForSession, joinContext, input.response)) {
          throw new Error("shared-session-binding-conflict");
        }
        if (
          existingForSession.membership_status === "revoked" &&
          input.pull.snapshot.membershipStatus === "active"
        ) {
          throw new Error("membership-reactivation-conflict");
        }
        await this.replaceSnapshot(tx, joinContext, input.pull);
        return;
      }

      const existingForRun = await tx.getFirstAsync<{ session_id: string }>(
        "SELECT session_id FROM shared_sessions WHERE run_id=?",
        joinContext.runId,
      );
      if (existingForRun !== null) throw new Error("shared-run-binding-conflict");
      const pending = await tx.getFirstAsync<StoredPendingSharedJoin>(
        "SELECT * FROM pending_shared_joins WHERE run_id=?",
        joinContext.runId,
      );
      if (pending === null) throw new Error("shared-pending-join-missing");
      if (
        pending.status !== "submitting" ||
        !pendingJoinMatches(pending, {
          sessionId: joinContext.sessionId,
          runId: joinContext.runId,
          expectedReleaseId: joinContext.expectedReleaseId,
          serviceOrigin: joinContext.serviceOrigin,
          joinRequestId: pending.join_request_id,
          invitationDigest: pending.invitation_digest,
          envelopeKey: joinContext.envelopeKey,
          requestDigest: pending.request_digest,
        })
      ) {
        throw new Error("shared-pending-join-conflict");
      }
      const deleted = await tx.runAsync(
        `DELETE FROM pending_shared_joins
         WHERE run_id=? AND request_digest=? AND status='submitting'`,
        pending.run_id,
        pending.request_digest,
      );
      if (deleted.changes !== undefined && deleted.changes !== 1) {
        throw new Error("shared-pending-join-conflict");
      }
      await tx.runAsync(
        `INSERT INTO shared_sessions
         (session_id,run_id,release_id,participant_id,team_id,service_origin,envelope_key,
          membership_status,transport_status,sync_status,cursor,confirmed_at)
         VALUES (?,?,?,?,?,?,?,?,'offline','recovery-required','0',NULL)`,
        joinContext.sessionId,
        joinContext.runId,
        input.response.releaseId,
        input.response.participantId,
        input.response.teamId,
        joinContext.serviceOrigin,
        joinContext.envelopeKey,
        input.pull.snapshot.membershipStatus,
      );
      await this.replaceSnapshot(tx, joinContext, input.pull);
    });
  }

  private async advancePendingJoin(
    runId: string,
    requestDigest: string,
    target: "ready" | "submitting",
  ): Promise<PendingSharedJoin> {
    let output: PendingSharedJoin | undefined;
    await this.database.withExclusiveTransactionAsync(async (tx) => {
      const row = await tx.getFirstAsync<StoredPendingSharedJoin>(
        "SELECT * FROM pending_shared_joins WHERE run_id=?",
        runId,
      );
      if (row === null) throw new Error("shared-pending-join-missing");
      if (row.request_digest !== requestDigest) throw new Error("shared-pending-join-conflict");
      if (target === "ready" && row.status === "preparing") {
        await tx.runAsync(
          "UPDATE pending_shared_joins SET status='ready' WHERE run_id=? AND status='preparing'",
          runId,
        );
        output = parsePendingSharedJoin({ ...row, status: "ready" });
        return;
      }
      if (target === "submitting" && row.status === "ready") {
        await tx.runAsync(
          "UPDATE pending_shared_joins SET status='submitting' WHERE run_id=? AND status='ready'",
          runId,
        );
        output = parsePendingSharedJoin({ ...row, status: "submitting" });
        return;
      }
      if (row.status === target || (target === "ready" && row.status === "submitting")) {
        output = parsePendingSharedJoin(row);
        return;
      }
      throw new Error("shared-pending-join-status-conflict");
    });
    if (output === undefined) throw new Error("shared-pending-join-update-incomplete");
    return output;
  }

  async enqueue(
    sessionId: string,
    command: SharedCommandIntent,
    enqueuedAt: string,
  ): Promise<SharedCommandStatus> {
    if (!isSharedCommandIntent(command)) throw new Error("shared-command-invalid");
    let output: SharedCommandStatus | undefined;
    await this.database.withExclusiveTransactionAsync(async (tx) => {
      const result = await tx.getFirstAsync<{
        intent_json: string;
        terminal: SharedCommandStatus["terminal"];
        outcome_code: string;
        resulting_state_version: number;
      }>(
        "SELECT intent_json, terminal, outcome_code, resulting_state_version FROM shared_results WHERE session_id=? AND command_id=?",
        sessionId,
        command.commandId,
      );
      if (result !== null) {
        if (result.intent_json !== canonicalIntent(command)) {
          throw new Error("shared-command-identity-conflict");
        }
        output = {
          commandId: command.commandId,
          disposition: "already-terminal",
          terminal: result.terminal,
          outcomeCode: result.outcome_code,
          resultingStateVersion: result.resulting_state_version,
        };
        return;
      }
      const pending = await tx.getFirstAsync<{
        intent_json: string;
        target_json: string;
        expected_state_version: number;
        command_type: string;
        payload_json: string;
        observation_ids_json: string;
        status: "queued" | "submitting" | "blocked-revoked";
      }>(
        "SELECT * FROM shared_outbox WHERE session_id=? AND command_id=?",
        sessionId,
        command.commandId,
      );
      if (pending !== null) {
        const exact = pending.intent_json === canonicalIntent(command);
        if (!exact) throw new Error("shared-command-identity-conflict");
        output = {
          commandId: command.commandId,
          disposition: "duplicate-pending",
          terminal: pending.status === "blocked-revoked" ? "blocked-revoked" : "pending",
        };
        return;
      }
      const session = await tx.getFirstAsync<{ membership_status: "active" | "revoked" }>(
        "SELECT membership_status FROM shared_sessions WHERE session_id=?",
        sessionId,
      );
      if (session === null) throw new Error("shared-session-missing");
      const status = session.membership_status === "revoked" ? "blocked-revoked" : "queued";
      await tx.runAsync(
        `INSERT INTO shared_outbox (session_id, command_id, intent_json, target_json, expected_state_version,
         command_type, payload_json, observation_ids_json, status, enqueued_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        sessionId,
        command.commandId,
        canonicalIntent(command),
        JSON.stringify(command.target),
        command.expectedStateVersion,
        command.type,
        JSON.stringify(command.payload),
        JSON.stringify(command.observationIds),
        status,
        enqueuedAt,
      );
      output = {
        commandId: command.commandId,
        disposition: "queued",
        terminal: status === "blocked-revoked" ? "blocked-revoked" : "pending",
      };
    });
    if (output === undefined) throw new Error("shared-enqueue-incomplete");
    return output;
  }

  async beginSubmissionBatch(sessionId: string): Promise<SubmissionBatch> {
    let output: SubmissionBatch | undefined;
    await this.database.withExclusiveTransactionAsync(async (tx) => {
      const session = await tx.getFirstAsync<StoredSessionBinding>(
        "SELECT * FROM shared_sessions WHERE session_id=?",
        sessionId,
      );
      if (session === null) throw new Error("shared-session-missing");
      if (session.membership_status !== "active" || session.sync_status === "revoked") {
        throw new Error("shared-session-not-active");
      }

      await tx.runAsync(
        "UPDATE shared_outbox SET status='queued' WHERE session_id=? AND status='submitting'",
        sessionId,
      );
      const rows = await tx.getAllAsync<StoredOutboxRow>(
        `SELECT * FROM shared_outbox WHERE session_id=? AND status='queued'
         ORDER BY enqueued_at,command_id`,
        sessionId,
      );
      const claimed = await tx.runAsync(
        "UPDATE shared_outbox SET status='submitting' WHERE session_id=? AND status='queued'",
        sessionId,
      );
      if (claimed.changes !== undefined && claimed.changes !== rows.length) {
        throw new Error("shared-batch-claim-conflict");
      }
      const updated = await tx.runAsync(
        `UPDATE shared_sessions SET transport_status='connecting',sync_status='syncing'
         WHERE session_id=? AND membership_status='active'`,
        sessionId,
      );
      if (updated.changes !== undefined && updated.changes !== 1) {
        throw new Error("shared-session-not-active");
      }
      output = deepFreeze({
        sessionId,
        commands: rows.map((row) => parseOutboxRow(row, "submitting")),
      });
    });
    if (output === undefined) throw new Error("shared-batch-claim-incomplete");
    return output;
  }

  async failSubmissionBatch(sessionId: string): Promise<void> {
    await this.database.withExclusiveTransactionAsync(async (tx) => {
      const session = await tx.getFirstAsync<StoredSessionBinding>(
        "SELECT * FROM shared_sessions WHERE session_id=?",
        sessionId,
      );
      if (session === null) throw new Error("shared-session-missing");
      if (session.membership_status === "revoked") {
        await tx.runAsync(
          `UPDATE shared_outbox SET status='blocked-revoked'
           WHERE session_id=? AND status IN ('queued','submitting')`,
          sessionId,
        );
        await tx.runAsync(
          `UPDATE shared_sessions SET transport_status='degraded',sync_status='revoked'
           WHERE session_id=?`,
          sessionId,
        );
        return;
      }
      await tx.runAsync(
        "UPDATE shared_outbox SET status='queued' WHERE session_id=? AND status='submitting'",
        sessionId,
      );
      await tx.runAsync(
        `UPDATE shared_sessions SET transport_status='degraded',sync_status='recovery-required'
         WHERE session_id=?`,
        sessionId,
      );
    });
  }

  async observations(
    runId: string,
    ids: readonly string[],
  ): Promise<readonly LocationObservation[]> {
    const output: LocationObservation[] = [];
    for (const id of ids) {
      const row = await this.database.getFirstAsync<{
        observation_id: string;
        recorded_at: string;
        captured_at: string | null;
        age_ms: number | null;
        availability: string;
        latitude: number | null;
        longitude: number | null;
        horizontal_accuracy: number | null;
        diagnostic_code: string | null;
      }>(
        `SELECT observation_id,recorded_at,captured_at,age_ms,availability,latitude,longitude,horizontal_accuracy,diagnostic_code FROM observations WHERE run_id=? AND observation_id=?`,
        runId,
        id,
      );
      if (row === null) throw new Error("shared-observation-missing");
      const base = {
        observationId: row.observation_id,
        recordedAt: row.recorded_at,
      };
      const observation: unknown =
        row.availability === "available"
          ? {
              ...base,
              availability: "available",
              capturedAt: row.captured_at,
              ageMs: row.age_ms,
              latitude: row.latitude,
              longitude: row.longitude,
              horizontalAccuracy: row.horizontal_accuracy,
            }
          : row.availability === "failed"
            ? { ...base, availability: "failed", diagnosticCode: row.diagnostic_code }
            : { ...base, availability: row.availability };
      if (!isLocationObservation(observation)) throw new Error("shared-observation-corrupt");
      output.push(observation);
    }
    return output;
  }

  async applyPull(context: SharedBindingContext, pull: SyncPull): Promise<void> {
    const bindingContext = {
      ...context,
      serviceOrigin: canonicalServiceOrigin(context.serviceOrigin),
    };
    if (
      !isSyncPull(pull) ||
      !this.validateReleasePull(pull) ||
      pull.snapshot.sessionId !== bindingContext.sessionId
    ) {
      throw new Error("shared-pull-invalid");
    }
    assertUniquePullCollections(pull);
    await this.database.withExclusiveTransactionAsync((tx) =>
      this.replaceSnapshot(tx, bindingContext, pull),
    );
  }

  private async replaceSnapshot(
    tx: SharedSqlDatabase,
    context: SharedBindingContext,
    pull: SyncPull,
  ): Promise<void> {
    const run = await tx.getFirstAsync<StoredRun>(
      "SELECT release_id,status FROM runs WHERE run_id=?",
      context.runId,
    );
    if (run === null || run.status !== "active") throw new Error("shared-run-not-active");
    if (run.release_id !== context.expectedReleaseId) {
      throw new Error("shared-run-release-mismatch");
    }
    const session = await tx.getFirstAsync<StoredSessionBinding>(
      "SELECT * FROM shared_sessions WHERE session_id=?",
      context.sessionId,
    );
    if (session === null) throw new Error("shared-session-missing");
    if (
      !bindingMatches(session, context) ||
      session.release_id !== pull.snapshot.releaseId ||
      session.participant_id !== pull.snapshot.participantId ||
      session.team_id !== pull.snapshot.teamId
    ) {
      throw new Error("shared-snapshot-binding-conflict");
    }
    if (session.membership_status === "revoked" && pull.snapshot.membershipStatus === "active") {
      throw new Error("membership-reactivation-conflict");
    }

    const matchedOutboxIds: string[] = [];
    for (const result of pull.commandResults) {
      const source = await tx.getFirstAsync<{
        intent_json: string;
        expected_state_version: number;
        observation_ids_json: string;
      }>(
        "SELECT intent_json,expected_state_version,observation_ids_json FROM shared_outbox WHERE session_id=? AND command_id=?",
        context.sessionId,
        result.commandId,
      );
      const existing = await tx.getFirstAsync<StoredResultRow>(
        "SELECT * FROM shared_results WHERE session_id=? AND command_id=?",
        context.sessionId,
        result.commandId,
      );
      if (existing !== null) {
        if (!resultMatches(existing, result)) {
          throw new Error("shared-result-identity-conflict");
        }
        if (
          source !== null &&
          (source.intent_json !== existing.intent_json ||
            source.expected_state_version !== existing.expected_state_version ||
            source.observation_ids_json !== existing.observation_ids_json)
        ) {
          throw new Error("shared-result-provenance-conflict");
        }
      } else {
        if (source === null) throw new Error("shared-result-source-missing");
        await tx.runAsync(
          `INSERT INTO shared_results
           (session_id,command_id,intent_json,terminal,outcome_code,resulting_state_version,
            expected_state_version,observation_ids_json,decision_position,decided_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          context.sessionId,
          result.commandId,
          source.intent_json,
          result.terminal,
          result.outcomeCode,
          result.resultingStateVersion,
          source.expected_state_version,
          source.observation_ids_json,
          result.decisionPosition,
          pull.snapshot.confirmedAt,
        );
        const committedAt = pull.snapshot.confirmedAt;
        const committedMs = Date.parse(committedAt);
        if (!Number.isFinite(committedMs)) throw new Error("shared-result-time-invalid");
        await tx.runAsync(
          `INSERT INTO game_play_events
           (run_id,committed_at,elapsed_ms,kind,command_id,evidence_json)
           VALUES (?,?,?,'command',?,?)`,
          context.runId,
          committedAt,
          committedMs,
          result.commandId,
          JSON.stringify({
            scope: "shared",
            terminal: result.terminal,
            expectedStateVersion: source.expected_state_version,
            resultingStateVersion: result.resultingStateVersion,
          }),
        );
        for (const evidence of result.capabilityEvidence ?? []) {
          await tx.runAsync(
            `INSERT INTO game_play_events
             (run_id,committed_at,elapsed_ms,kind,command_id,evidence_json)
             VALUES (?,?,?,'capability',?,?)`,
            context.runId,
            committedAt,
            committedMs,
            result.commandId,
            JSON.stringify(evidence),
          );
        }
      }
      if (source !== null) matchedOutboxIds.push(result.commandId);
    }

    await tx.runAsync("DELETE FROM shared_projections WHERE session_id=?", context.sessionId);
    for (const item of pull.snapshot.projections) {
      await tx.runAsync(
        `INSERT INTO shared_projections
         (session_id,aggregate_kind,aggregate_id,schema_id,state_version,value_json)
         VALUES (?,?,?,?,?,?)`,
        context.sessionId,
        item.aggregateKind,
        item.aggregateId,
        item.schemaId,
        item.stateVersion,
        JSON.stringify(item.value),
      );
    }
    for (const commandId of matchedOutboxIds) {
      await tx.runAsync(
        "DELETE FROM shared_outbox WHERE session_id=? AND command_id=?",
        context.sessionId,
        commandId,
      );
    }

    if (pull.snapshot.membershipStatus === "revoked") {
      await tx.runAsync(
        `UPDATE shared_outbox SET status='blocked-revoked'
         WHERE session_id=? AND status IN ('queued','submitting')`,
        context.sessionId,
      );
      await tx.runAsync(
        `UPDATE shared_sessions
         SET membership_status='revoked',transport_status='degraded',sync_status='revoked',
          cursor=?,confirmed_at=? WHERE session_id=?`,
        pull.nextCursor,
        pull.snapshot.confirmedAt,
        context.sessionId,
      );
      await tx.runAsync(
        `INSERT INTO game_play_events
         (run_id,committed_at,elapsed_ms,kind,command_id,evidence_json)
         VALUES (?,?,?,'diagnostic',NULL,?)`,
        context.runId,
        pull.snapshot.confirmedAt,
        Date.parse(pull.snapshot.confirmedAt),
        JSON.stringify({ code: "shared-membership-revoked", scope: "shared" }),
      );
      await tx.runAsync(
        `INSERT INTO game_play_events
         (run_id,committed_at,elapsed_ms,kind,command_id,evidence_json)
         VALUES (?,?,?,'synchronization',NULL,?)`,
        context.runId,
        pull.snapshot.confirmedAt,
        Date.parse(pull.snapshot.confirmedAt),
        JSON.stringify({ phase: "revoked", disposition: "snapshot-replaced" }),
      );
      return;
    }

    await tx.runAsync(
      "UPDATE shared_outbox SET status='queued' WHERE session_id=? AND status='submitting'",
      context.sessionId,
    );
    await tx.runAsync(
      `INSERT INTO game_play_events
       (run_id,committed_at,elapsed_ms,kind,command_id,evidence_json)
       VALUES (?,?,?,'recovery',NULL,?)`,
      context.runId,
      pull.snapshot.confirmedAt,
      Date.parse(pull.snapshot.confirmedAt),
      JSON.stringify({ disposition: "snapshot-replaced" }),
    );
    const remaining = await tx.getFirstAsync<{ command_id: string }>(
      "SELECT command_id FROM shared_outbox WHERE session_id=? LIMIT 1",
      context.sessionId,
    );
    await tx.runAsync(
      `UPDATE shared_sessions
       SET membership_status='active',transport_status='online',sync_status=?,cursor=?,confirmed_at=?
       WHERE session_id=?`,
      remaining === null ? "current" : "recovery-required",
      pull.nextCursor,
      pull.snapshot.confirmedAt,
      context.sessionId,
    );
  }

  async markRevoked(sessionId: string): Promise<void> {
    await this.database.withExclusiveTransactionAsync(async (tx) => {
      const session = await tx.getFirstAsync<{
        membership_status: "active" | "revoked";
        run_id: string;
      }>("SELECT membership_status,run_id FROM shared_sessions WHERE session_id=?", sessionId);
      if (session === null) throw new Error("shared-session-missing");
      await tx.runAsync(
        "UPDATE shared_sessions SET membership_status='revoked',sync_status='revoked',transport_status='degraded' WHERE session_id=?",
        sessionId,
      );
      await tx.runAsync(
        `UPDATE shared_outbox SET status='blocked-revoked'
         WHERE session_id=? AND status IN ('queued','submitting')`,
        sessionId,
      );
      const committedAt = new Date().toISOString();
      await tx.runAsync(
        `INSERT INTO game_play_events
         (run_id,committed_at,elapsed_ms,kind,command_id,evidence_json)
         VALUES (?,?,?,'synchronization',NULL,?)`,
        session.run_id,
        committedAt,
        Date.now(),
        JSON.stringify({ phase: "revoked", disposition: "participant-revoked" }),
      );
      await tx.runAsync(
        `INSERT INTO game_play_events
         (run_id,committed_at,elapsed_ms,kind,command_id,evidence_json)
         VALUES (?,?,?,'diagnostic',NULL,?)`,
        session.run_id,
        committedAt,
        Date.now(),
        JSON.stringify({ code: "shared-membership-revoked", scope: "shared" }),
      );
    });
  }

  async recordSyncEvent(
    sessionId: string,
    elapsedMs: number,
    phase: string,
    disposition: string,
    commandId?: string,
  ): Promise<void> {
    if (
      !Number.isSafeInteger(elapsedMs) ||
      elapsedMs < 0 ||
      !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(phase) ||
      !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(disposition)
    )
      throw new Error("shared-sync-event-invalid");
    await this.database.withExclusiveTransactionAsync(async (tx) => {
      const committedAt = new Date().toISOString();
      const run = await tx.getFirstAsync<{ run_id: string; started_at: string }>(
        `SELECT sessions.run_id,runs.started_at FROM shared_sessions AS sessions
         JOIN runs ON runs.run_id=sessions.run_id WHERE sessions.session_id=?`,
        sessionId,
      );
      if (run === null) throw new Error("shared-session-missing");
      const calculatedElapsed = Date.now() - Date.parse(run.started_at);
      const truthfulElapsed = elapsedMs === 0 ? Math.max(0, calculatedElapsed) : elapsedMs;
      await tx.runAsync(
        "INSERT INTO shared_sync_events(session_id,elapsed_ms,phase,disposition,command_id) VALUES (?,?,?,?,?)",
        sessionId,
        truthfulElapsed,
        phase,
        disposition,
        commandId ?? null,
      );
      await tx.runAsync(
        `INSERT INTO game_play_events
         (run_id,committed_at,elapsed_ms,kind,command_id,evidence_json)
         VALUES (?,?,?,'synchronization',?,?)`,
        run.run_id,
        committedAt,
        truthfulElapsed,
        commandId ?? null,
        JSON.stringify({ phase, disposition }),
      );
      await tx.runAsync(
        `DELETE FROM shared_sync_events WHERE session_id=? AND sequence NOT IN (SELECT sequence FROM shared_sync_events WHERE session_id=? ORDER BY sequence DESC LIMIT 500)`,
        sessionId,
        sessionId,
      );
    });
  }

  async session(sessionId: string): Promise<
    | (SharedSessionRecord & {
        readonly cursor: string;
        readonly membershipStatus: "active" | "revoked";
      })
    | null
  > {
    const row = await this.database.getFirstAsync<{
      session_id: string;
      run_id: string;
      release_id: `sha256:${string}`;
      participant_id: string;
      team_id: string;
      service_origin: string;
      envelope_key: string;
      cursor: string;
      membership_status: "active" | "revoked";
    }>("SELECT * FROM shared_sessions WHERE session_id=?", sessionId);
    return row === null
      ? null
      : {
          sessionId: row.session_id,
          runId: row.run_id,
          releaseId: row.release_id,
          participantId: row.participant_id,
          teamId: row.team_id,
          serviceOrigin: row.service_origin,
          envelopeKey: row.envelope_key,
          cursor: row.cursor,
          membershipStatus: row.membership_status,
        };
  }

  async sessionForRun(runId: string): Promise<string | null> {
    const row = await this.database.getFirstAsync<{ session_id: string }>(
      "SELECT session_id FROM shared_sessions WHERE run_id=? ORDER BY rowid DESC LIMIT 1",
      runId,
    );
    return row?.session_id ?? null;
  }

  async view(sessionId: string): Promise<SharedPlayView> {
    const session = await this.database.getFirstAsync<{
      release_id: `sha256:${string}`;
      team_id: string;
      membership_status: "active" | "revoked";
      transport_status: SharedPlayView["transport"];
      sync_status: SharedPlayView["synchronization"];
      confirmed_at: string | null;
    }>("SELECT * FROM shared_sessions WHERE session_id=?", sessionId);
    if (session === null) throw new Error("shared-session-missing");
    const projections = await this.database.getAllAsync<{
      aggregate_kind: SharedProjection["aggregateKind"];
      aggregate_id: string;
      schema_id: string;
      state_version: number;
      value_json: string;
    }>(
      "SELECT * FROM shared_projections WHERE session_id=? ORDER BY aggregate_kind,aggregate_id,schema_id",
      sessionId,
    );
    const results = await this.database.getAllAsync<{
      command_id: string;
      terminal: SharedCommandStatus["terminal"];
      outcome_code: string;
      resulting_state_version: number;
    }>(
      "SELECT * FROM shared_results WHERE session_id=? ORDER BY CAST(decision_position AS INTEGER),command_id",
      sessionId,
    );
    const pending = await this.database.getAllAsync<{ command_id: string; status: string }>(
      "SELECT command_id,status FROM shared_outbox WHERE session_id=? ORDER BY enqueued_at,command_id",
      sessionId,
    );
    return {
      sessionId,
      releaseId: session.release_id,
      transport: session.transport_status,
      synchronization: session.sync_status,
      confirmedAt: session.confirmed_at,
      membership: { status: session.membership_status, teamId: session.team_id },
      projections: projections.map((row) => ({
        aggregateKind: row.aggregate_kind,
        aggregateId: row.aggregate_id,
        schemaId: row.schema_id,
        stateVersion: row.state_version,
        value: JSON.parse(row.value_json),
      })),
      actions: [
        ...pending.map((row) => ({
          commandId: row.command_id,
          disposition: "duplicate-pending" as const,
          terminal:
            row.status === "blocked-revoked" ? ("blocked-revoked" as const) : ("pending" as const),
        })),
        ...results.map((row) => ({
          commandId: row.command_id,
          disposition: "already-terminal" as const,
          terminal: row.terminal,
          outcomeCode: row.outcome_code,
          resultingStateVersion: row.resulting_state_version,
        })),
      ],
    };
  }
}
