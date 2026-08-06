import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { describe, expect, it, vi } from "vitest";

import { migratePlayerDatabase } from "../src/persistence/database";

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

describe("player database clean break", () => {
  it("rejects an incompatible installed schema with reset or reinstall guidance", async () => {
    const database = new RealMigrationDatabase();
    seedLegacyDatabase(database);
    database.database
      .prepare("INSERT INTO runs (run_id, release_id, started_at, status) VALUES (?, ?, ?, ?)")
      .run("run-report", releaseId, "2030-01-01T00:00:00.000Z", "active");
    const tablesBefore = database.database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all();

    await expect(migratePlayerDatabase(database)).rejects.toThrow(
      "player-database-incompatible-reset-or-reinstall",
    );
    expect(
      database.database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all(),
    ).toEqual(tablesBefore);
    expect(
      database.database.prepare("SELECT run_id, status FROM runs ORDER BY run_id").all(),
    ).toEqual([{ run_id: "run-report", status: "active" }]);
    database.close();
  });
});
