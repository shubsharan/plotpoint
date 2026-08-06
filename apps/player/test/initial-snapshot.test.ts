import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import type { LocalAggregateView, ReleaseId } from "@plotpoint/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CandidateTransition } from "../src/model";
import { commitCandidateTransition } from "../src/persistence/commit-transition";
import { PlayerDatabase } from "../src/persistence/database";
import { playerRunLifecycleStore, selectReleaseRun } from "../src/runtime/run-lifecycle";

const sqliteMock = vi.hoisted(() => ({ database: null as TestSqliteDatabase | null }));

vi.mock("expo-sqlite", () => ({
  openDatabaseAsync: vi.fn(async () => {
    if (sqliteMock.database === null) throw new Error("test-sqlite-database-missing");
    return sqliteMock.database;
  }),
}));

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

class TestSqliteDatabase {
  readonly database = new DatabaseSync(":memory:");
  inTransaction = false;
  requireTransactionalRecoveryReads = false;

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
    this.assertRecoveryReadTransaction(query);
    return this.database.prepare(query).all(...sqlValues(parameters)) as T[];
  }

  async getFirstAsync<T>(query: string, ...parameters: unknown[]): Promise<T | null> {
    this.assertRecoveryReadTransaction(query);
    return (this.database.prepare(query).get(...sqlValues(parameters)) as T | undefined) ?? null;
  }

  async withExclusiveTransactionAsync(
    operation: (database: TestSqliteDatabase) => Promise<void>,
  ): Promise<void> {
    this.database.exec("BEGIN IMMEDIATE");
    this.inTransaction = true;
    try {
      await operation(this);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }

  private assertRecoveryReadTransaction(query: string): void {
    if (
      this.requireTransactionalRecoveryReads &&
      !this.inTransaction &&
      ["FROM snapshots", "FROM journal", "FROM command_receipts", "FROM command_observations"].some(
        (fragment) => query.includes(fragment),
      )
    ) {
      throw new Error("recovery-read-outside-transaction");
    }
  }

  close(): void {
    this.database.close();
  }
}

const releaseId = `sha256:${"a".repeat(64)}` as ReleaseId;
const initialAggregate = {
  modelId: "field.player",
  aggregateId: "field-player",
  aggregateKind: "player",
  schemaId: "field.player-state",
  stateVersion: 0,
  state: { phase: "puzzle", attempts: 0 },
  progression: {
    graphId: "field.progression",
    nodes: [{ nodeId: "finish", status: "active" }],
  },
} satisfies LocalAggregateView;

afterEach(() => {
  sqliteMock.database?.close();
  sqliteMock.database = null;
});

describe("initial run snapshot", () => {
  it("atomically persists bootstrap state so a first event-only acceptance can commit", async () => {
    sqliteMock.database = new TestSqliteDatabase();
    const database = await PlayerDatabase.open();
    await database.publishRelease({
      releaseId,
      artifactUri: "memory://field.pprelease",
      manifestJson: "{}",
      installedAt: "2026-08-05T00:00:00.000Z",
    });

    const selection = await selectReleaseRun(
      playerRunLifecycleStore(database),
      releaseId,
      initialAggregate,
      {
        createRunId: () => "run-initial",
        now: () => "2026-08-05T00:00:01.000Z",
      },
    );
    expect(selection.kind).toBe("created");
    await expect(
      database.transaction((transaction) => transaction.getSnapshot("run-initial")),
    ).resolves.toMatchObject({
      runId: "run-initial",
      stateVersion: 0,
      state: initialAggregate.state,
      progression: initialAggregate.progression,
      journalPosition: 0,
    });

    const eventOnly = {
      commandId: "event-only-first",
      modelId: initialAggregate.modelId,
      commandType: "field.advance",
      payload: { action: "note" },
      target: {
        aggregateId: initialAggregate.aggregateId,
        aggregateKind: initialAggregate.aggregateKind,
        schemaId: initialAggregate.schemaId,
      },
      expectedStateVersion: 0,
      observationIds: [],
      terminal: "accepted",
      outcome: { result: "noted" },
      domainEvents: [{ type: "field.noted", payload: { phase: "puzzle" } }],
      effectIntents: [],
      progressionTrace: [],
    } satisfies CandidateTransition;
    await expect(
      commitCandidateTransition({ store: database, runId: "run-initial", candidate: eventOnly }),
    ).resolves.toMatchObject({
      disposition: "committed",
      terminal: "accepted",
      resultingStateVersion: 1,
    });
    await expect(
      database.transaction((transaction) => transaction.getSnapshot("run-initial")),
    ).resolves.toMatchObject({
      stateVersion: 1,
      state: initialAggregate.state,
      progression: initialAggregate.progression,
      journalPosition: 1,
    });
    sqliteMock.database.requireTransactionalRecoveryReads = true;
    await expect(database.readRecoveryRecords("run-initial")).resolves.toMatchObject({
      snapshot: {
        state_version: 1,
        journal_position: 1,
        initial_state_json: JSON.stringify(initialAggregate.state),
        initial_progression_json: JSON.stringify(initialAggregate.progression),
      },
      journals: [{ sequence: 1, command_id: "event-only-first" }],
      receipts: [{ command_id: "event-only-first", resulting_state_version: 1 }],
      observationLinks: [],
    });
    await expect(
      selectReleaseRun(playerRunLifecycleStore(database), releaseId, initialAggregate),
    ).resolves.toMatchObject({ kind: "resumed", run: { runId: "run-initial" } });

    await database
      .raw()
      .runAsync(
        "UPDATE snapshots SET initial_state_json = ? WHERE run_id = ?",
        JSON.stringify({ attempts: 99, phase: "tampered" }),
        "run-initial",
      );
    await expect(
      selectReleaseRun(playerRunLifecycleStore(database), releaseId, initialAggregate),
    ).rejects.toThrow("release-run-snapshot-mismatch");
  });
});
