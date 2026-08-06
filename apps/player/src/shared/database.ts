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

import { PLAYER_DATABASE_INCOMPATIBLE } from "../persistence/schema-policy";

export const SHARED_MIGRATION = `
CREATE TABLE IF NOT EXISTS shared_sessions (
  session_id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(run_id), release_id TEXT NOT NULL,
  participant_id TEXT NOT NULL, team_id TEXT NOT NULL, service_url TEXT NOT NULL,
  membership_status TEXT NOT NULL CHECK(membership_status IN ('active','revoked')),
  transport_status TEXT NOT NULL CHECK(transport_status IN ('offline','connecting','online','degraded')),
  sync_status TEXT NOT NULL CHECK(sync_status IN ('current','syncing','recovery-required','revoked')),
  cursor TEXT NOT NULL DEFAULT '0', confirmed_at TEXT
);
CREATE TABLE IF NOT EXISTS shared_outbox (
  session_id TEXT NOT NULL REFERENCES shared_sessions(session_id), command_id TEXT NOT NULL,
  target_json TEXT NOT NULL, expected_state_version INTEGER NOT NULL, command_type TEXT NOT NULL,
  payload_json TEXT NOT NULL, observation_ids_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','submitting','blocked-revoked')),
  enqueued_at TEXT NOT NULL, PRIMARY KEY(session_id, command_id)
);
CREATE TABLE IF NOT EXISTS shared_projections (
  session_id TEXT NOT NULL REFERENCES shared_sessions(session_id), aggregate_kind TEXT NOT NULL,
  aggregate_id TEXT NOT NULL, schema_id TEXT NOT NULL, schema_version INTEGER NOT NULL,
  state_version INTEGER NOT NULL, value_json TEXT NOT NULL,
  PRIMARY KEY(session_id, aggregate_kind, aggregate_id, schema_id, schema_version)
);
CREATE TABLE IF NOT EXISTS shared_results (
  session_id TEXT NOT NULL REFERENCES shared_sessions(session_id), command_id TEXT NOT NULL,
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
`;

const SHARED_SCHEMA_COLUMNS = Object.freeze({
  shared_sessions: [
    "session_id",
    "run_id",
    "release_id",
    "participant_id",
    "team_id",
    "service_url",
    "membership_status",
    "transport_status",
    "sync_status",
    "cursor",
    "confirmed_at",
  ],
  shared_outbox: [
    "session_id",
    "command_id",
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
    "schema_version",
    "state_version",
    "value_json",
  ],
  shared_results: [
    "session_id",
    "command_id",
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

export interface SharedSessionRecord {
  readonly sessionId: string;
  readonly runId: string;
  readonly releaseId: `sha256:${string}`;
  readonly participantId: string;
  readonly teamId: string;
  readonly serviceUrl: string;
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
  readonly run_id: string;
  readonly release_id: `sha256:${string}`;
  readonly participant_id: string;
  readonly team_id: string;
  readonly service_url: string;
  readonly membership_status: "active" | "revoked";
  readonly sync_status: SharedPlayView["synchronization"];
}

interface StoredOutboxRow {
  readonly session_id: string;
  readonly command_id: string;
  readonly target_json: string;
  readonly expected_state_version: number;
  readonly command_type: string;
  readonly payload_json: string;
  readonly observation_ids_json: string;
  readonly status: SharedOutboxStatus;
  readonly enqueued_at: string;
}

interface StoredResultRow {
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
      projection.schemaVersion,
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
  return true;
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
  constructor(private readonly database: SharedSqlDatabase) {}

  async saveJoinedSession(record: SharedSessionRecord, pull: SyncPull): Promise<void> {
    const serviceUrl = record.serviceUrl.replace(/\/$/, "");
    if (
      !isSyncPull(pull) ||
      pull.snapshot.sessionId !== record.sessionId ||
      pull.snapshot.releaseId !== record.releaseId ||
      pull.snapshot.participantId !== record.participantId ||
      pull.snapshot.teamId !== record.teamId
    ) {
      throw new Error("shared-join-snapshot-invalid");
    }
    assertUniquePullCollections(pull);
    await this.database.withExclusiveTransactionAsync(async (tx) => {
      const existing = await tx.getFirstAsync<StoredSessionBinding>(
        "SELECT * FROM shared_sessions WHERE session_id=?",
        record.sessionId,
      );
      if (existing === null) {
        await tx.runAsync(
          `INSERT INTO shared_sessions
           (session_id,run_id,release_id,participant_id,team_id,service_url,membership_status,
            transport_status,sync_status,cursor,confirmed_at)
           VALUES (?,?,?,?,?,?,?,'offline','recovery-required','0',NULL)`,
          record.sessionId,
          record.runId,
          record.releaseId,
          record.participantId,
          record.teamId,
          serviceUrl,
          pull.snapshot.membershipStatus,
        );
      } else {
        if (
          existing.run_id !== record.runId ||
          existing.release_id !== record.releaseId ||
          existing.participant_id !== record.participantId ||
          existing.team_id !== record.teamId ||
          existing.service_url !== serviceUrl
        ) {
          throw new Error("shared-session-binding-conflict");
        }
        if (
          existing.membership_status === "revoked" &&
          pull.snapshot.membershipStatus === "active"
        ) {
          throw new Error("membership-reactivation-conflict");
        }
      }
      await this.replaceSnapshot(tx, record.sessionId, pull);
    });
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
        terminal: SharedCommandStatus["terminal"];
        outcome_code: string;
        resulting_state_version: number;
      }>(
        "SELECT terminal, outcome_code, resulting_state_version FROM shared_results WHERE session_id=? AND command_id=?",
        sessionId,
        command.commandId,
      );
      if (result !== null) {
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
        const exact =
          pending.target_json === JSON.stringify(command.target) &&
          pending.expected_state_version === command.expectedStateVersion &&
          pending.command_type === command.type &&
          pending.payload_json === JSON.stringify(command.payload) &&
          pending.observation_ids_json === JSON.stringify(command.observationIds);
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
        `INSERT INTO shared_outbox (session_id, command_id, target_json, expected_state_version,
         command_type, payload_json, observation_ids_json, status, enqueued_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        sessionId,
        command.commandId,
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

  async applyPull(sessionId: string, pull: SyncPull): Promise<void> {
    if (!isSyncPull(pull) || pull.snapshot.sessionId !== sessionId) {
      throw new Error("shared-pull-invalid");
    }
    assertUniquePullCollections(pull);
    await this.database.withExclusiveTransactionAsync((tx) =>
      this.replaceSnapshot(tx, sessionId, pull),
    );
  }

  private async replaceSnapshot(
    tx: SharedSqlDatabase,
    sessionId: string,
    pull: SyncPull,
  ): Promise<void> {
    const session = await tx.getFirstAsync<StoredSessionBinding>(
      "SELECT * FROM shared_sessions WHERE session_id=?",
      sessionId,
    );
    if (session === null) throw new Error("shared-session-missing");
    if (
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
        expected_state_version: number;
        observation_ids_json: string;
      }>(
        "SELECT expected_state_version,observation_ids_json FROM shared_outbox WHERE session_id=? AND command_id=?",
        sessionId,
        result.commandId,
      );
      const existing = await tx.getFirstAsync<StoredResultRow>(
        "SELECT * FROM shared_results WHERE session_id=? AND command_id=?",
        sessionId,
        result.commandId,
      );
      if (existing !== null) {
        if (!resultMatches(existing, result)) {
          throw new Error("shared-result-identity-conflict");
        }
        if (
          source !== null &&
          (source.expected_state_version !== existing.expected_state_version ||
            source.observation_ids_json !== existing.observation_ids_json)
        ) {
          throw new Error("shared-result-provenance-conflict");
        }
      } else {
        if (source === null) throw new Error("shared-result-source-missing");
        await tx.runAsync(
          `INSERT INTO shared_results
           (session_id,command_id,terminal,outcome_code,resulting_state_version,
            expected_state_version,observation_ids_json,decision_position,decided_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          sessionId,
          result.commandId,
          result.terminal,
          result.outcomeCode,
          result.resultingStateVersion,
          source.expected_state_version,
          source.observation_ids_json,
          result.decisionPosition,
          pull.snapshot.confirmedAt,
        );
      }
      if (source !== null) matchedOutboxIds.push(result.commandId);
    }

    await tx.runAsync("DELETE FROM shared_projections WHERE session_id=?", sessionId);
    for (const item of pull.snapshot.projections) {
      await tx.runAsync(
        `INSERT INTO shared_projections
         (session_id,aggregate_kind,aggregate_id,schema_id,schema_version,state_version,value_json)
         VALUES (?,?,?,?,?,?,?)`,
        sessionId,
        item.aggregateKind,
        item.aggregateId,
        item.schemaId,
        item.schemaVersion,
        item.stateVersion,
        JSON.stringify(item.value),
      );
    }
    for (const commandId of matchedOutboxIds) {
      await tx.runAsync(
        "DELETE FROM shared_outbox WHERE session_id=? AND command_id=?",
        sessionId,
        commandId,
      );
    }

    if (pull.snapshot.membershipStatus === "revoked") {
      await tx.runAsync(
        `UPDATE shared_outbox SET status='blocked-revoked'
         WHERE session_id=? AND status IN ('queued','submitting')`,
        sessionId,
      );
      await tx.runAsync(
        `UPDATE shared_sessions
         SET membership_status='revoked',transport_status='degraded',sync_status='revoked',
          cursor=?,confirmed_at=? WHERE session_id=?`,
        pull.nextCursor,
        pull.snapshot.confirmedAt,
        sessionId,
      );
      return;
    }

    await tx.runAsync(
      "UPDATE shared_outbox SET status='queued' WHERE session_id=? AND status='submitting'",
      sessionId,
    );
    const remaining = await tx.getFirstAsync<{ command_id: string }>(
      "SELECT command_id FROM shared_outbox WHERE session_id=? LIMIT 1",
      sessionId,
    );
    await tx.runAsync(
      `UPDATE shared_sessions
       SET membership_status='active',transport_status='online',sync_status=?,cursor=?,confirmed_at=?
       WHERE session_id=?`,
      remaining === null ? "current" : "recovery-required",
      pull.nextCursor,
      pull.snapshot.confirmedAt,
      sessionId,
    );
  }

  async markRevoked(sessionId: string): Promise<void> {
    await this.database.withExclusiveTransactionAsync(async (tx) => {
      const session = await tx.getFirstAsync<{ membership_status: "active" | "revoked" }>(
        "SELECT membership_status FROM shared_sessions WHERE session_id=?",
        sessionId,
      );
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
      await tx.runAsync(
        "INSERT INTO shared_sync_events(session_id,elapsed_ms,phase,disposition,command_id) VALUES (?,?,?,?,?)",
        sessionId,
        elapsedMs,
        phase,
        disposition,
        commandId ?? null,
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
      service_url: string;
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
          serviceUrl: row.service_url,
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
      schema_version: number;
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
      "SELECT * FROM shared_results WHERE session_id=? ORDER BY decision_position,command_id",
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
        schemaVersion: row.schema_version,
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
