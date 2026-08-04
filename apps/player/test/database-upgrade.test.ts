import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";

import { migratePlayerDatabase } from "../src/persistence/database";
import { createPlayReport } from "../src/reports/create-play-report";

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

  async runAsync(query: string, ...parameters: unknown[]): Promise<unknown> {
    return this.database.prepare(query).run(...sqlValues(parameters));
  }

  async getAllAsync<T>(query: string, ...parameters: unknown[]): Promise<T[]> {
    return this.database.prepare(query).all(...sqlValues(parameters)) as T[];
  }

  async getFirstAsync<T>(query: string, ...parameters: unknown[]): Promise<T | null> {
    return (this.database.prepare(query).get(...sqlValues(parameters)) as T | undefined) ?? null;
  }

  raw() {
    return this;
  }

  close(): void {
    this.database.close();
  }
}

const releaseId = `sha256:${"a".repeat(64)}` as const;

function seedLegacyDatabase(database: RealMigrationDatabase): void {
  database.database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE installed_releases (
      release_id TEXT PRIMARY KEY, artifact_uri TEXT NOT NULL, manifest_json TEXT NOT NULL,
      installed_at TEXT NOT NULL
    );
    CREATE TABLE runs (
      run_id TEXT PRIMARY KEY, release_id TEXT NOT NULL REFERENCES installed_releases(release_id),
      started_at TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','completed','invalid'))
    );
    CREATE TABLE observations (
      run_id TEXT NOT NULL REFERENCES runs(run_id), observation_id TEXT NOT NULL,
      captured_at TEXT NOT NULL, availability TEXT NOT NULL, latitude REAL, longitude REAL,
      horizontal_accuracy REAL, elapsed_ms INTEGER NOT NULL, PRIMARY KEY(run_id, observation_id)
    );
    CREATE TABLE recovery_events (
      run_id TEXT NOT NULL REFERENCES runs(run_id), code TEXT NOT NULL, elapsed_ms INTEGER NOT NULL
    );
  `);
  database.database
    .prepare(
      `INSERT INTO installed_releases
       (release_id, artifact_uri, manifest_json, installed_at) VALUES (?, ?, ?, ?)`,
    )
    .run(releaseId, "file:///release.plotpoint", "{}", "2030-01-01T00:00:00.000Z");
}

afterEach(() => vi.restoreAllMocks());

describe("player database upgrades", () => {
  it("reconciles duplicate active legacy runs before enforcing one active run per release", async () => {
    const database = new RealMigrationDatabase();
    seedLegacyDatabase(database);
    database.database
      .prepare("INSERT INTO runs (run_id, release_id, started_at, status) VALUES (?, ?, ?, ?)")
      .run("run-older", releaseId, "2030-01-01T00:00:00.000Z", "active");
    database.database
      .prepare("INSERT INTO runs (run_id, release_id, started_at, status) VALUES (?, ?, ?, ?)")
      .run("run-newer", releaseId, "2030-01-01T01:00:00.000Z", "active");

    await migratePlayerDatabase(database);

    expect(
      await database.getAllAsync<{ run_id: string; status: string }>(
        "SELECT run_id, status FROM runs ORDER BY run_id",
      ),
    ).toEqual([
      { run_id: "run-newer", status: "active" },
      { run_id: "run-older", status: "invalid" },
    ]);
    expect(
      await database.getAllAsync<{ run_id: string; code: string }>(
        "SELECT run_id, code FROM run_events ORDER BY sequence",
      ),
    ).toEqual([{ run_id: "run-older", code: "legacy-duplicate-active-run" }]);
    expect(() =>
      database.database
        .prepare("INSERT INTO runs (run_id, release_id, started_at, status) VALUES (?, ?, ?, ?)")
        .run("run-third", releaseId, "2030-01-01T02:00:00.000Z", "active"),
    ).toThrow();
    database.close();
  });

  it("imports legacy recovery events once in stable order and exposes them in reports", async () => {
    const database = new RealMigrationDatabase();
    seedLegacyDatabase(database);
    database.database
      .prepare("INSERT INTO runs (run_id, release_id, started_at, status) VALUES (?, ?, ?, ?)")
      .run("run-report", releaseId, "2030-01-01T00:00:00.000Z", "active");
    const insertRecovery = database.database.prepare(
      "INSERT INTO recovery_events (run_id, code, elapsed_ms) VALUES (?, ?, ?)",
    );
    insertRecovery.run("run-report", "application-restarted", 5_000);
    insertRecovery.run("run-report", "application-restored", 5_000);

    await migratePlayerDatabase(database);
    await migratePlayerDatabase(database);

    expect(
      await database.getAllAsync<{
        elapsed_ms: number;
        code: string;
        legacy_recovery_rowid: number;
      }>(
        `SELECT elapsed_ms, code, legacy_recovery_rowid FROM run_events
         WHERE legacy_recovery_rowid IS NOT NULL ORDER BY sequence`,
      ),
    ).toEqual([
      {
        elapsed_ms: 5_000,
        code: "application-restarted",
        legacy_recovery_rowid: 1,
      },
      {
        elapsed_ms: 5_000,
        code: "application-restored",
        legacy_recovery_rowid: 2,
      },
    ]);

    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2030-01-01T00:00:10.000Z"));
    await expect(createPlayReport(database, "run-report", "ios")).resolves.toMatchObject({
      events: [
        { kind: "diagnostic", elapsedMs: 5_000, code: "application-restarted" },
        { kind: "diagnostic", elapsedMs: 5_000, code: "application-restored" },
      ],
    });
    database.close();
  });
});
