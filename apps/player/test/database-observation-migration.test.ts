import { describe, expect, it, vi } from "vitest";

import { migrateObservationColumns } from "../src/persistence/database";

vi.mock("expo-sqlite", () => ({}));

function migrationDatabase(existing: readonly string[]) {
  const execAsync = vi.fn(async (_query: string) => undefined);
  const runAsync = vi.fn(async (_query: string) => undefined);
  return {
    database: {
      getAllAsync: async <T>() => existing.map((name) => ({ name })) as T[],
      execAsync,
      runAsync,
    },
    execAsync,
    runAsync,
  };
}

describe("observation schema migration", () => {
  it("adds Location V1 evidence columns to an existing observations table and backfills recordedAt", async () => {
    const fixture = migrationDatabase([
      "run_id",
      "observation_id",
      "captured_at",
      "availability",
      "latitude",
      "longitude",
      "horizontal_accuracy",
      "elapsed_ms",
    ]);

    await migrateObservationColumns(fixture.database);

    expect(fixture.execAsync).toHaveBeenNthCalledWith(
      1,
      "ALTER TABLE observations ADD COLUMN recorded_at TEXT",
    );
    expect(fixture.execAsync).toHaveBeenNthCalledWith(
      2,
      "ALTER TABLE observations ADD COLUMN sensor_captured_at TEXT",
    );
    expect(fixture.execAsync).toHaveBeenNthCalledWith(
      3,
      "ALTER TABLE observations ADD COLUMN age_ms INTEGER",
    );
    expect(fixture.execAsync).toHaveBeenNthCalledWith(
      4,
      "ALTER TABLE observations ADD COLUMN diagnostic_code TEXT",
    );
    expect(fixture.runAsync).toHaveBeenCalledWith(
      "UPDATE observations SET recorded_at = captured_at WHERE recorded_at IS NULL",
    );
  });

  it("is idempotent once every Location V1 evidence column exists", async () => {
    const fixture = migrationDatabase([
      "recorded_at",
      "sensor_captured_at",
      "age_ms",
      "diagnostic_code",
    ]);

    await migrateObservationColumns(fixture.database);

    expect(fixture.execAsync).not.toHaveBeenCalled();
    expect(fixture.runAsync).toHaveBeenCalledOnce();
  });
});
