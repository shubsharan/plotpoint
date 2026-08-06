import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { describe, expect, it, vi } from "vitest";

import { migratePlayerDatabase } from "../src/persistence/database";
import { migrateSharedDatabase } from "../src/shared/database";

vi.mock("expo-sqlite", () => ({}));

function sqlValues(parameters: readonly unknown[]): SQLInputValue[] {
  return parameters.map((value) => {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "bigint"
    ) {
      return value;
    }
    throw new Error("test-sql-parameter-invalid");
  });
}

class RealMigrationDatabase {
  constructor(readonly database = new DatabaseSync(":memory:")) {}

  async execAsync(query: string): Promise<void> {
    this.database.exec(query);
  }

  async runAsync(query: string, ...parameters: unknown[]): Promise<{ readonly changes: number }> {
    const result = this.database.prepare(query).run(...sqlValues(parameters)) as {
      readonly changes: number | bigint;
    };
    return { changes: Number(result.changes) };
  }

  async getAllAsync<T>(query: string, ...parameters: unknown[]): Promise<T[]> {
    return this.database.prepare(query).all(...sqlValues(parameters)) as T[];
  }

  async getFirstAsync<T>(query: string, ...parameters: unknown[]): Promise<T | null> {
    return (this.database.prepare(query).get(...sqlValues(parameters)) as T | undefined) ?? null;
  }

  async withExclusiveTransactionAsync(
    operation: (database: RealMigrationDatabase) => Promise<void>,
  ): Promise<void> {
    await operation(this);
  }

  close(): void {
    this.database.close();
  }
}

describe("corrected player database schema", () => {
  it("creates the corrected snapshot, journal, and observation columns without legacy counters", async () => {
    const database = new RealMigrationDatabase();

    await migratePlayerDatabase(database);
    await migratePlayerDatabase(database);
    await migrateSharedDatabase(database);
    await migrateSharedDatabase(database);

    const columns = async (table: string) =>
      (await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`)).map(
        ({ name }) => name,
      );
    await expect(columns("snapshots")).resolves.toEqual([
      "run_id",
      "model_id",
      "aggregate_id",
      "aggregate_kind",
      "schema_id",
      "state_version",
      "state_json",
      "progression_json",
      "initial_state_json",
      "initial_progression_json",
      "journal_position",
    ]);
    await expect(columns("journal")).resolves.toEqual([
      "run_id",
      "sequence",
      "command_id",
      "record_json",
    ]);
    await expect(columns("command_receipts")).resolves.toEqual([
      "run_id",
      "command_id",
      "expected_state_version",
      "candidate_json",
      "result_json",
      "resulting_state_version",
      "elapsed_ms",
    ]);
    await expect(columns("observations")).resolves.toEqual([
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
    ]);
    await expect(columns("shared_projections")).resolves.toEqual([
      "session_id",
      "aggregate_kind",
      "aggregate_id",
      "schema_id",
      "schema_version",
      "state_version",
      "value_json",
    ]);
    await expect(columns("pending_shared_joins")).resolves.toEqual([
      "session_id",
      "run_id",
      "expected_release_id",
      "service_origin",
      "join_request_id",
      "invitation_digest",
      "invitation_key",
      "credential_key",
      "request_digest",
      "status",
    ]);
    await expect(columns("shared_sessions")).resolves.toEqual([
      "session_id",
      "run_id",
      "release_id",
      "participant_id",
      "team_id",
      "service_origin",
      "credential_key",
      "membership_status",
      "transport_status",
      "sync_status",
      "cursor",
      "confirmed_at",
    ]);
    await expect(
      database.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name",
      ),
    ).resolves.toEqual([
      { name: "pending_shared_join_immutable" },
      { name: "pending_shared_join_no_bound_insert" },
      { name: "shared_session_binding_immutable" },
      { name: "shared_session_membership_monotonic" },
      { name: "shared_session_no_pending_insert" },
    ]);
    database.close();
  });

  it("rejects an incompatible shared schema without adding or backfilling columns", async () => {
    const database = new RealMigrationDatabase();
    database.database.exec(`
      CREATE TABLE shared_results (
        session_id TEXT NOT NULL,
        command_id TEXT NOT NULL,
        terminal TEXT NOT NULL,
        outcome_code TEXT NOT NULL,
        resulting_state_version INTEGER NOT NULL,
        decision_position TEXT NOT NULL,
        decided_at TEXT NOT NULL,
        PRIMARY KEY(session_id, command_id)
      );
    `);
    const tablesBefore = database.database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all();
    const columnsBefore = await database.getAllAsync<{ name: string }>(
      "PRAGMA table_info(shared_results)",
    );

    await expect(migrateSharedDatabase(database)).rejects.toThrow(
      "player-database-incompatible-reset-or-reinstall",
    );
    expect(
      database.database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all(),
    ).toEqual(tablesBefore);
    expect(
      await database.getAllAsync<{ name: string }>("PRAGMA table_info(shared_results)"),
    ).toEqual(columnsBefore);
    database.close();
  });
});
