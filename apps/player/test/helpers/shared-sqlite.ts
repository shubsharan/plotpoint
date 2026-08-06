import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { migrateSharedDatabase, type SharedSqlDatabase } from "../../src/shared/database";

export const TEST_SQLITE_INTERRUPTED_AFTER_WRITE = "test-sqlite-interrupted-after-write";
export const TEST_SQLITE_INTERRUPTED_BEFORE_COMMIT = "test-sqlite-interrupted-before-commit";
export const TEST_SHARED_RELEASE_ID = `sha256:${"a".repeat(64)}` as const;

function sqlValues(parameters: readonly unknown[]): SQLInputValue[] {
  return parameters.map((value) => {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "bigint" ||
      value instanceof Uint8Array
    ) {
      return value;
    }
    throw new Error("test-sql-parameter-invalid");
  });
}

interface TransactionInterruption {
  readonly afterWrite?: number;
  readonly beforeCommit?: true;
}

export interface SharedDatabaseState {
  readonly sessions: readonly Readonly<Record<string, unknown>>[];
  readonly outbox: readonly Readonly<Record<string, unknown>>[];
  readonly projections: readonly Readonly<Record<string, unknown>>[];
  readonly results: readonly Readonly<Record<string, unknown>>[];
  readonly syncEvents: readonly Readonly<Record<string, unknown>>[];
}

export class TestSharedSqliteDatabase implements SharedSqlDatabase {
  readonly database = new DatabaseSync(":memory:");
  transactionStarts = 0;

  private activeInterruption: TransactionInterruption | null = null;
  private nextInterruption: TransactionInterruption | null = null;
  private transactionWrites = 0;
  private transactionTail: Promise<void> = Promise.resolve();

  async execAsync(query: string): Promise<void> {
    this.database.exec(query);
    this.interruptAfterWrite();
  }

  async runAsync(query: string, ...parameters: unknown[]): Promise<{ readonly changes: number }> {
    const result = this.database.prepare(query).run(...sqlValues(parameters)) as {
      readonly changes: number | bigint;
    };
    this.interruptAfterWrite();
    return { changes: Number(result.changes) };
  }

  async getAllAsync<T>(query: string, ...parameters: unknown[]): Promise<T[]> {
    return this.database.prepare(query).all(...sqlValues(parameters)) as T[];
  }

  async getFirstAsync<T>(query: string, ...parameters: unknown[]): Promise<T | null> {
    return (this.database.prepare(query).get(...sqlValues(parameters)) as T | undefined) ?? null;
  }

  async withExclusiveTransactionAsync(
    operation: (database: SharedSqlDatabase) => Promise<void>,
  ): Promise<void> {
    const predecessor = this.transactionTail;
    let releaseTransaction!: () => void;
    this.transactionTail = new Promise<void>((resolve) => {
      releaseTransaction = resolve;
    });
    await predecessor;
    this.transactionStarts += 1;
    this.activeInterruption = this.nextInterruption;
    this.nextInterruption = null;
    this.transactionWrites = 0;
    let transactionStarted = false;
    try {
      this.database.exec("BEGIN IMMEDIATE");
      transactionStarted = true;
      await operation(this);
      if (this.activeInterruption?.beforeCommit === true) {
        throw new Error(TEST_SQLITE_INTERRUPTED_BEFORE_COMMIT);
      }
      this.database.exec("COMMIT");
      transactionStarted = false;
    } catch (error) {
      if (transactionStarted) this.database.exec("ROLLBACK");
      throw error;
    } finally {
      this.activeInterruption = null;
      this.transactionWrites = 0;
      releaseTransaction();
    }
  }

  interruptNextTransactionAfterWrite(writeNumber: number): void {
    if (!Number.isSafeInteger(writeNumber) || writeNumber <= 0) {
      throw new Error("test-sql-interruption-position-invalid");
    }
    this.configureInterruption({ afterWrite: writeNumber });
  }

  interruptNextTransactionBeforeCommit(): void {
    this.configureInterruption({ beforeCommit: true });
  }

  async sharedState(sessionId: string): Promise<SharedDatabaseState> {
    return {
      sessions: await this.getAllAsync<Readonly<Record<string, unknown>>>(
        "SELECT * FROM shared_sessions WHERE session_id=? ORDER BY session_id",
        sessionId,
      ),
      outbox: await this.getAllAsync<Readonly<Record<string, unknown>>>(
        "SELECT * FROM shared_outbox WHERE session_id=? ORDER BY enqueued_at,command_id",
        sessionId,
      ),
      projections: await this.getAllAsync<Readonly<Record<string, unknown>>>(
        `SELECT * FROM shared_projections WHERE session_id=?
         ORDER BY aggregate_kind,aggregate_id,schema_id,schema_version`,
        sessionId,
      ),
      results: await this.getAllAsync<Readonly<Record<string, unknown>>>(
        "SELECT * FROM shared_results WHERE session_id=? ORDER BY decision_position,command_id",
        sessionId,
      ),
      syncEvents: await this.getAllAsync<Readonly<Record<string, unknown>>>(
        "SELECT * FROM shared_sync_events WHERE session_id=? ORDER BY sequence",
        sessionId,
      ),
    };
  }

  close(): void {
    this.database.close();
  }

  private configureInterruption(interruption: TransactionInterruption): void {
    if (this.nextInterruption !== null || this.activeInterruption !== null) {
      throw new Error("test-sql-interruption-already-configured");
    }
    this.nextInterruption = interruption;
  }

  private interruptAfterWrite(): void {
    if (this.activeInterruption?.afterWrite === undefined) return;
    this.transactionWrites += 1;
    if (this.transactionWrites === this.activeInterruption.afterWrite) {
      throw new Error(TEST_SQLITE_INTERRUPTED_AFTER_WRITE);
    }
  }
}

export async function createSharedTestDatabase(
  runId = "run-1",
  releaseId: `sha256:${string}` = TEST_SHARED_RELEASE_ID,
): Promise<TestSharedSqliteDatabase> {
  const database = new TestSharedSqliteDatabase();
  await database.execAsync(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE runs (
      run_id TEXT PRIMARY KEY,
      release_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active','completed','invalid'))
    );
  `);
  await database.runAsync(
    "INSERT INTO runs (run_id,release_id,started_at,status) VALUES (?,?,?,'active')",
    runId,
    releaseId,
    "2030-01-01T00:00:00.000Z",
  );
  await migrateSharedDatabase(database);
  return database;
}
