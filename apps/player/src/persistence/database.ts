import * as SQLite from "expo-sqlite";

import type {
  DurableTransitionResult,
  InstalledReleaseRecord,
  RunRecord,
  SnapshotRecord,
} from "../model";
import type { TransitionStore, TransitionTransaction } from "./commit-transition";

const MIGRATION = `
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
  run_id TEXT PRIMARY KEY REFERENCES runs(run_id), aggregate_id TEXT NOT NULL,
  aggregate_kind TEXT NOT NULL, schema_id TEXT NOT NULL, schema_version INTEGER NOT NULL,
  state_version INTEGER NOT NULL, state_json TEXT NOT NULL, journal_position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS command_receipts (
  run_id TEXT NOT NULL REFERENCES runs(run_id), command_id TEXT NOT NULL,
  expected_version INTEGER NOT NULL, result_json TEXT NOT NULL, resulting_version INTEGER NOT NULL,
  elapsed_ms INTEGER NOT NULL, PRIMARY KEY(run_id, command_id)
);
CREATE TABLE IF NOT EXISTS journal (
  run_id TEXT NOT NULL REFERENCES runs(run_id), sequence INTEGER NOT NULL,
  command_id TEXT NOT NULL, outcome_json TEXT NOT NULL, progression_json TEXT NOT NULL,
  PRIMARY KEY(run_id, sequence)
);
CREATE TABLE IF NOT EXISTS observations (
  run_id TEXT NOT NULL REFERENCES runs(run_id), observation_id TEXT NOT NULL,
  captured_at TEXT NOT NULL, availability TEXT NOT NULL, latitude REAL, longitude REAL,
  horizontal_accuracy REAL, elapsed_ms INTEGER NOT NULL, PRIMARY KEY(run_id, observation_id)
);
CREATE TABLE IF NOT EXISTS command_observations (
  run_id TEXT NOT NULL, command_id TEXT NOT NULL, observation_id TEXT NOT NULL,
  PRIMARY KEY(run_id, command_id, observation_id)
);
CREATE TABLE IF NOT EXISTS recovery_events (
  run_id TEXT NOT NULL REFERENCES runs(run_id), code TEXT NOT NULL, elapsed_ms INTEGER NOT NULL
);
`;

function rowToSnapshot(row: {
  run_id: string;
  aggregate_id: string;
  aggregate_kind: "player";
  schema_id: string;
  schema_version: number;
  state_version: number;
  state_json: string;
  journal_position: number;
}): SnapshotRecord {
  return {
    runId: row.run_id,
    aggregateId: row.aggregate_id,
    aggregateKind: row.aggregate_kind,
    schemaId: row.schema_id,
    schemaVersion: row.schema_version,
    stateVersion: row.state_version,
    state: JSON.parse(row.state_json) as SnapshotRecord["state"],
    journalPosition: row.journal_position,
  };
}

export class PlayerDatabase implements TransitionStore {
  private constructor(private readonly database: SQLite.SQLiteDatabase) {}

  static async open(): Promise<PlayerDatabase> {
    const database = await SQLite.openDatabaseAsync("plotpoint.db");
    await database.execAsync(MIGRATION);
    return new PlayerDatabase(database);
  }

  async publishRelease(record: InstalledReleaseRecord): Promise<void> {
    await this.database.runAsync(
      `INSERT OR IGNORE INTO installed_releases
       (release_id, artifact_uri, manifest_json, installed_at) VALUES (?, ?, ?, ?)`,
      record.releaseId,
      record.artifactUri,
      record.manifestJson,
      record.installedAt,
    );
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
    capturedAt: string;
    availability: string;
    latitude?: number;
    longitude?: number;
    horizontalAccuracy?: number;
    elapsedMs: number;
  }): Promise<void> {
    await this.database.runAsync(
      `INSERT INTO observations
       (run_id, observation_id, captured_at, availability, latitude, longitude,
        horizontal_accuracy, elapsed_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      input.runId,
      input.observationId,
      input.capturedAt,
      input.availability,
      input.latitude ?? null,
      input.longitude ?? null,
      input.horizontalAccuracy ?? null,
      input.elapsedMs,
    );
  }

  async recordRecoveryEvent(runId: string, code: string, elapsedMs: number): Promise<void> {
    await this.database.runAsync(
      "INSERT INTO recovery_events (run_id, code, elapsed_ms) VALUES (?, ?, ?)",
      runId,
      code,
      Math.max(0, elapsedMs),
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
        const row = await database.getFirstAsync<{ result_json: string }>(
          "SELECT result_json FROM command_receipts WHERE run_id = ? AND command_id = ?",
          runId,
          commandId,
        );
        return row === null ? null : (JSON.parse(row.result_json) as DurableTransitionResult);
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
      accept: async (runId, candidate) => {
        const resultingVersion = candidate.expectedVersion + 1;
        const prior = await database.getFirstAsync<{ journal_position: number }>(
          "SELECT journal_position FROM snapshots WHERE run_id = ?",
          runId,
        );
        const sequence = (prior?.journal_position ?? 0) + 1;
        const result: DurableTransitionResult = {
          kind: "accepted",
          commandId: candidate.commandId,
          commandOutcome: candidate.commandOutcome,
          resultingVersion,
        };
        await database.runAsync(
          `INSERT INTO command_receipts
           (run_id, command_id, expected_version, result_json, resulting_version, elapsed_ms)
           VALUES (?, ?, ?, ?, ?, ?)`,
          runId,
          candidate.commandId,
          candidate.expectedVersion,
          JSON.stringify(result),
          resultingVersion,
          Date.now(),
        );
        await database.runAsync(
          `INSERT INTO snapshots
           (run_id, aggregate_id, aggregate_kind, schema_id, schema_version, state_version,
            state_json, journal_position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(run_id) DO UPDATE SET state_version=excluded.state_version,
            state_json=excluded.state_json, journal_position=excluded.journal_position`,
          runId,
          candidate.aggregateId,
          candidate.aggregateKind,
          candidate.schemaId,
          candidate.schemaVersion,
          resultingVersion,
          JSON.stringify(candidate.nextState),
          sequence,
        );
        await database.runAsync(
          "INSERT INTO journal (run_id, sequence, command_id, outcome_json, progression_json) VALUES (?, ?, ?, ?, ?)",
          runId,
          sequence,
          candidate.commandId,
          JSON.stringify(candidate.outcome),
          JSON.stringify(candidate.progressionChanges),
        );
        for (const observationId of candidate.observationIds) {
          await database.runAsync(
            "INSERT INTO command_observations (run_id, command_id, observation_id) VALUES (?, ?, ?)",
            runId,
            candidate.commandId,
            observationId,
          );
        }
        return result;
      },
    };
  }

  raw(): SQLite.SQLiteDatabase {
    return this.database;
  }
}
