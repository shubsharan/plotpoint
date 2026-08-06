import * as SQLite from "expo-sqlite";

import type {
  DurableCommandRecord,
  DurableTransitionResult,
  InstalledReleaseRecord,
  RunEventRecord,
  RunRecord,
  SnapshotRecord,
} from "../model";
import type { TransitionStore, TransitionTransaction } from "./commit-transition";
import { PLAYER_DATABASE_INCOMPATIBLE } from "./schema-policy";
import {
  assertSharedDatabaseSchema,
  migrateSharedDatabase,
  SHARED_DATABASE_TABLES,
} from "../shared/database";

const BASE_MIGRATION = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS installed_releases (
  release_id TEXT PRIMARY KEY, artifact_uri TEXT NOT NULL, manifest_json TEXT NOT NULL,
  installed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY, release_id TEXT NOT NULL REFERENCES installed_releases(release_id),
  started_at TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','completed','invalid'))
);
CREATE TABLE IF NOT EXISTS snapshots (
  run_id TEXT PRIMARY KEY REFERENCES runs(run_id), model_id TEXT NOT NULL,
  aggregate_id TEXT NOT NULL, aggregate_kind TEXT NOT NULL, schema_id TEXT NOT NULL,
  state_version INTEGER NOT NULL, state_json TEXT NOT NULL, progression_json TEXT,
  journal_position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS command_receipts (
  run_id TEXT NOT NULL REFERENCES runs(run_id), command_id TEXT NOT NULL,
  expected_state_version INTEGER NOT NULL, candidate_json TEXT NOT NULL, result_json TEXT NOT NULL,
  resulting_state_version INTEGER NOT NULL, elapsed_ms INTEGER NOT NULL,
  PRIMARY KEY(run_id, command_id)
);
CREATE TABLE IF NOT EXISTS journal (
  run_id TEXT NOT NULL REFERENCES runs(run_id), sequence INTEGER NOT NULL,
  command_id TEXT NOT NULL, record_json TEXT NOT NULL,
  PRIMARY KEY(run_id, sequence)
);
CREATE TABLE IF NOT EXISTS observations (
  run_id TEXT NOT NULL REFERENCES runs(run_id), observation_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL, captured_at TEXT NOT NULL, sensor_captured_at TEXT, age_ms INTEGER,
  availability TEXT NOT NULL,
  latitude REAL, longitude REAL, horizontal_accuracy REAL, diagnostic_code TEXT,
  elapsed_ms INTEGER NOT NULL, PRIMARY KEY(run_id, observation_id)
);
CREATE TABLE IF NOT EXISTS command_observations (
  run_id TEXT NOT NULL, command_id TEXT NOT NULL, observation_id TEXT NOT NULL,
  PRIMARY KEY(run_id, command_id, observation_id)
);
CREATE TABLE IF NOT EXISTS run_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(run_id), elapsed_ms INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('lifecycle','diagnostic')),
  phase TEXT, disposition TEXT, code TEXT, command_id TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_run_per_release
  ON runs(release_id) WHERE status = 'active';
`;

const LOCAL_SCHEMA_COLUMNS = Object.freeze({
  installed_releases: ["release_id", "artifact_uri", "manifest_json", "installed_at"],
  runs: ["run_id", "release_id", "started_at", "status"],
  snapshots: [
    "run_id",
    "model_id",
    "aggregate_id",
    "aggregate_kind",
    "schema_id",
    "state_version",
    "state_json",
    "progression_json",
    "journal_position",
  ],
  command_receipts: [
    "run_id",
    "command_id",
    "expected_state_version",
    "candidate_json",
    "result_json",
    "resulting_state_version",
    "elapsed_ms",
  ],
  journal: ["run_id", "sequence", "command_id", "record_json"],
  observations: [
    "run_id",
    "observation_id",
    "recorded_at",
    "captured_at",
    "sensor_captured_at",
    "age_ms",
    "availability",
    "latitude",
    "longitude",
    "horizontal_accuracy",
    "diagnostic_code",
    "elapsed_ms",
  ],
  command_observations: ["run_id", "command_id", "observation_id"],
  run_events: [
    "sequence",
    "run_id",
    "elapsed_ms",
    "kind",
    "phase",
    "disposition",
    "code",
    "command_id",
  ],
} as const);

export interface ObservationMigrationDatabase {
  getAllAsync<T>(query: string, ...parameters: unknown[]): Promise<T[]>;
  execAsync(query: string): Promise<void>;
  runAsync(query: string, ...parameters: unknown[]): Promise<unknown>;
}

function sameColumns(actual: readonly string[], expected: readonly string[]): boolean {
  return (
    actual.length === expected.length && actual.every((name, index) => name === expected[index])
  );
}

async function hasCorrectedLocalSchema(database: ObservationMigrationDatabase): Promise<boolean> {
  for (const [table, expected] of Object.entries(LOCAL_SCHEMA_COLUMNS)) {
    const actual = (
      await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`)
    ).map(({ name }) => name);
    if (!sameColumns(actual, expected)) return false;
  }
  return true;
}

export async function assertPlayerDatabaseSchema(
  database: ObservationMigrationDatabase,
): Promise<void> {
  const userTables = await database.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  );
  const knownTables = new Set([...Object.keys(LOCAL_SCHEMA_COLUMNS), ...SHARED_DATABASE_TABLES]);
  if (userTables.some(({ name }) => !knownTables.has(name))) {
    throw new Error(PLAYER_DATABASE_INCOMPATIBLE);
  }
  const existingLocalTables = await database.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name IN (${Object.keys(LOCAL_SCHEMA_COLUMNS)
       .map(() => "?")
       .join(",")})`,
    ...Object.keys(LOCAL_SCHEMA_COLUMNS),
  );
  if (existingLocalTables.length > 0 && !(await hasCorrectedLocalSchema(database))) {
    throw new Error(PLAYER_DATABASE_INCOMPATIBLE);
  }
}

export async function migratePlayerDatabase(database: ObservationMigrationDatabase): Promise<void> {
  await assertPlayerDatabaseSchema(database);
  await database.execAsync(BASE_MIGRATION);
  if (!(await hasCorrectedLocalSchema(database))) {
    throw new Error(PLAYER_DATABASE_INCOMPATIBLE);
  }
}

function rowToSnapshot(row: {
  run_id: string;
  model_id: string;
  aggregate_id: string;
  aggregate_kind: "player";
  schema_id: string;
  state_version: number;
  state_json: string;
  progression_json: string | null;
  journal_position: number;
}): SnapshotRecord {
  return {
    runId: row.run_id,
    modelId: row.model_id,
    aggregateId: row.aggregate_id,
    aggregateKind: row.aggregate_kind,
    schemaId: row.schema_id,
    stateVersion: row.state_version,
    state: JSON.parse(row.state_json) as SnapshotRecord["state"],
    ...(row.progression_json === null
      ? {}
      : {
          progression: JSON.parse(row.progression_json) as NonNullable<
            SnapshotRecord["progression"]
          >,
        }),
    journalPosition: row.journal_position,
  };
}

export class PlayerDatabase implements TransitionStore {
  private constructor(private readonly database: SQLite.SQLiteDatabase) {}

  static async open(): Promise<PlayerDatabase> {
    const database = await SQLite.openDatabaseAsync("plotpoint.db");
    await assertPlayerDatabaseSchema(database);
    await assertSharedDatabaseSchema(database);
    await migratePlayerDatabase(database);
    await migrateSharedDatabase(database);
    return new PlayerDatabase(database);
  }

  async publishRelease(record: InstalledReleaseRecord): Promise<void> {
    const result = await this.database.runAsync(
      `INSERT OR IGNORE INTO installed_releases
       (release_id, artifact_uri, manifest_json, installed_at) VALUES (?, ?, ?, ?)`,
      record.releaseId,
      record.artifactUri,
      record.manifestJson,
      record.installedAt,
    );
    if (result.changes !== 0) return;

    const existing = await this.installedRelease(record.releaseId);
    if (
      existing === null ||
      existing.artifactUri !== record.artifactUri ||
      existing.manifestJson !== record.manifestJson
    ) {
      throw new Error("install-release-publication-conflict");
    }
  }

  async createRun(record: RunRecord): Promise<void> {
    await this.database.runAsync(
      "INSERT INTO runs (run_id, release_id, started_at, status) VALUES (?, ?, ?, ?)",
      record.runId,
      record.releaseId,
      record.startedAt,
      record.status,
    );
  }

  async selectOrCreateActiveRun(candidate: RunRecord): Promise<{
    readonly created: boolean;
    readonly run: RunRecord;
  }> {
    let selection: { readonly created: boolean; readonly run: RunRecord } | undefined;
    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      const active = await transaction.getFirstAsync<{
        run_id: string;
        release_id: RunRecord["releaseId"];
        started_at: string;
        status: RunRecord["status"];
      }>(
        `SELECT run_id, release_id, started_at, status FROM runs
         WHERE release_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1`,
        candidate.releaseId,
      );
      if (active !== null) {
        selection = {
          created: false,
          run: {
            runId: active.run_id,
            releaseId: active.release_id,
            startedAt: active.started_at,
            status: active.status,
          },
        };
        return;
      }
      try {
        await transaction.runAsync(
          "INSERT INTO runs (run_id, release_id, started_at, status) VALUES (?, ?, ?, ?)",
          candidate.runId,
          candidate.releaseId,
          candidate.startedAt,
          candidate.status,
        );
        selection = { created: true, run: candidate };
      } catch (error) {
        const winner = await transaction.getFirstAsync<{
          run_id: string;
          release_id: RunRecord["releaseId"];
          started_at: string;
          status: RunRecord["status"];
        }>(
          `SELECT run_id, release_id, started_at, status FROM runs
           WHERE release_id = ? AND status = 'active' LIMIT 1`,
          candidate.releaseId,
        );
        if (winner === null) throw error;
        selection = {
          created: false,
          run: {
            runId: winner.run_id,
            releaseId: winner.release_id,
            startedAt: winner.started_at,
            status: winner.status,
          },
        };
      }
    });
    if (selection === undefined) throw new Error("release-run-selection-missing");
    return selection;
  }

  async latestRun(): Promise<RunRecord | null> {
    const row = await this.database.getFirstAsync<{
      run_id: string;
      release_id: RunRecord["releaseId"];
      started_at: string;
      status: RunRecord["status"];
    }>("SELECT run_id, release_id, started_at, status FROM runs ORDER BY started_at DESC LIMIT 1");
    return row === null
      ? null
      : {
          runId: row.run_id,
          releaseId: row.release_id,
          startedAt: row.started_at,
          status: row.status,
        };
  }

  async installedRelease(releaseId: string): Promise<InstalledReleaseRecord | null> {
    const row = await this.database.getFirstAsync<{
      release_id: InstalledReleaseRecord["releaseId"];
      artifact_uri: string;
      manifest_json: string;
      installed_at: string;
    }>("SELECT * FROM installed_releases WHERE release_id = ?", releaseId);
    return row === null
      ? null
      : {
          releaseId: row.release_id,
          artifactUri: row.artifact_uri,
          manifestJson: row.manifest_json,
          installedAt: row.installed_at,
        };
  }

  async recordObservation(input: {
    runId: string;
    observationId: string;
    recordedAt: string;
    capturedAt?: string;
    ageMs?: number;
    availability: string;
    latitude?: number;
    longitude?: number;
    horizontalAccuracy?: number;
    diagnosticCode?: string;
    elapsedMs: number;
  }): Promise<void> {
    await this.database.runAsync(
      `INSERT INTO observations
       (run_id, observation_id, recorded_at, captured_at, age_ms, availability, latitude, longitude,
        sensor_captured_at, horizontal_accuracy, diagnostic_code, elapsed_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.runId,
      input.observationId,
      input.recordedAt,
      input.capturedAt ?? input.recordedAt,
      input.ageMs ?? null,
      input.availability,
      input.latitude ?? null,
      input.longitude ?? null,
      input.capturedAt ?? null,
      input.horizontalAccuracy ?? null,
      input.diagnosticCode ?? null,
      input.elapsedMs,
    );
  }

  async recordRecoveryEvent(runId: string, code: string, elapsedMs: number): Promise<void> {
    await this.recordRunEvent(runId, {
      kind: "lifecycle",
      elapsedMs,
      phase: "recovery",
      disposition: code,
    });
  }

  async recordRunEvent(runId: string, event: RunEventRecord): Promise<void> {
    if (!Number.isSafeInteger(event.elapsedMs) || event.elapsedMs < 0) {
      throw new Error("run-event-elapsed-invalid");
    }
    const stable = (value: string) => /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(value);
    if (
      (event.commandId !== undefined && event.commandId.length === 0) ||
      (event.kind === "lifecycle" &&
        (!stable(event.phase) ||
          !stable(event.disposition) ||
          (event.diagnosticCode !== undefined && !stable(event.diagnosticCode)))) ||
      (event.kind === "diagnostic" && !stable(event.code))
    ) {
      throw new Error("run-event-value-invalid");
    }
    const phase = event.kind === "lifecycle" ? event.phase : null;
    const disposition = event.kind === "lifecycle" ? event.disposition : null;
    const code = event.kind === "diagnostic" ? event.code : (event.diagnosticCode ?? null);
    await this.database.runAsync(
      `INSERT INTO run_events
       (run_id, elapsed_ms, kind, phase, disposition, code, command_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      runId,
      event.elapsedMs,
      event.kind,
      phase,
      disposition,
      code,
      event.commandId ?? null,
    );
  }

  async transaction<T>(operation: (transaction: TransitionTransaction) => Promise<T>): Promise<T> {
    let output: T | undefined;
    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      output = await operation(this.transactionAdapter(transaction));
    });
    if (output === undefined) throw new Error("Player transaction completed without a result");
    return output;
  }

  private transactionAdapter(database: SQLite.SQLiteDatabase): TransitionTransaction {
    return {
      getReceipt: async (runId, commandId) => {
        const row = await database.getFirstAsync<{
          candidate_json: string;
          result_json: string;
        }>(
          `SELECT candidate_json, result_json FROM command_receipts
           WHERE run_id = ? AND command_id = ?`,
          runId,
          commandId,
        );
        return row === null
          ? null
          : ({
              candidate: JSON.parse(row.candidate_json),
              result: JSON.parse(row.result_json),
            } as DurableCommandRecord);
      },
      getSnapshot: async (runId) => {
        const row = await database.getFirstAsync<Parameters<typeof rowToSnapshot>[0]>(
          "SELECT * FROM snapshots WHERE run_id = ?",
          runId,
        );
        return row === null ? null : rowToSnapshot(row);
      },
      observationsExist: async (runId, observationIds) => {
        if (observationIds.length === 0) return true;
        const placeholders = observationIds.map(() => "?").join(",");
        const row = await database.getFirstAsync<{ count: number }>(
          `SELECT COUNT(*) AS count FROM observations WHERE run_id = ? AND observation_id IN (${placeholders})`,
          runId,
          ...observationIds,
        );
        return row?.count === observationIds.length;
      },
      record: async (runId, candidate) => {
        const resultingStateVersion =
          candidate.terminal === "accepted"
            ? candidate.expectedStateVersion + 1
            : candidate.expectedStateVersion;
        const result: DurableTransitionResult =
          candidate.terminal === "invalid"
            ? {
                commandId: candidate.commandId,
                disposition: "committed",
                terminal: "invalid",
                phase: candidate.phase,
                resultingStateVersion,
                diagnosticCodes: candidate.diagnosticCodes,
              }
            : {
                commandId: candidate.commandId,
                disposition: "committed",
                terminal: candidate.terminal,
                resultingStateVersion,
                outcome: candidate.outcome,
              };
        await database.runAsync(
          `INSERT INTO command_receipts
           (run_id, command_id, expected_state_version, candidate_json, result_json,
            resulting_state_version, elapsed_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          runId,
          candidate.commandId,
          candidate.expectedStateVersion,
          JSON.stringify(candidate),
          JSON.stringify(result),
          resultingStateVersion,
          Date.now(),
        );
        for (const observationId of candidate.observationIds) {
          await database.runAsync(
            "INSERT INTO command_observations (run_id, command_id, observation_id) VALUES (?, ?, ?)",
            runId,
            candidate.commandId,
            observationId,
          );
        }
        if (candidate.terminal !== "accepted") return result;

        const prior = await database.getFirstAsync<{
          journal_position: number;
          state_json: string;
          progression_json: string | null;
        }>(
          `SELECT journal_position, state_json, progression_json FROM snapshots
           WHERE run_id = ?`,
          runId,
        );
        const sequence = (prior?.journal_position ?? 0) + 1;
        const stateJson =
          candidate.nextState === undefined
            ? prior?.state_json
            : JSON.stringify(candidate.nextState);
        if (stateJson === undefined) throw new Error("transition-snapshot-state-missing");
        const progressionJson =
          candidate.nextProgression === undefined
            ? (prior?.progression_json ?? null)
            : JSON.stringify(candidate.nextProgression);
        await database.runAsync(
          `INSERT INTO snapshots
           (run_id, model_id, aggregate_id, aggregate_kind, schema_id, state_version,
            state_json, progression_json, journal_position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(run_id) DO UPDATE SET model_id=excluded.model_id,
            aggregate_id=excluded.aggregate_id, aggregate_kind=excluded.aggregate_kind,
            schema_id=excluded.schema_id, state_version=excluded.state_version,
            state_json=excluded.state_json, progression_json=excluded.progression_json,
            journal_position=excluded.journal_position`,
          runId,
          candidate.modelId,
          candidate.target.aggregateId,
          candidate.target.aggregateKind,
          candidate.target.schemaId,
          resultingStateVersion,
          stateJson,
          progressionJson,
          sequence,
        );
        await database.runAsync(
          `INSERT INTO journal (run_id, sequence, command_id, record_json)
           VALUES (?, ?, ?, ?)`,
          runId,
          sequence,
          candidate.commandId,
          JSON.stringify({ candidate, result } satisfies DurableCommandRecord),
        );
        return result;
      },
    };
  }

  raw(): SQLite.SQLiteDatabase {
    return this.database;
  }
}
