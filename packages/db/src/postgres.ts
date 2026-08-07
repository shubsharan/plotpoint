import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";
import { AUTHORITATIVE_HUNT_MIGRATION } from "./schema.js";

const AUTHORITATIVE_HUNT_SCHEMA_VERSION = 3;
const MIGRATION_TABLE = `CREATE TABLE IF NOT EXISTS plotpoint_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp()
)`;

export type PostgresPool = Pool;
export type PostgresClient = PoolClient;

export function createPostgresPool(config: PoolConfig): Pool {
  return new Pool({ ...config, max: config.max ?? 8 });
}

export async function withReadCommittedTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function migrateAuthoritativeHunt(pool: Pool): Promise<void> {
  await withReadCommittedTransaction(pool, async (client) => {
    await client.query(MIGRATION_TABLE);
    const existing = await client.query<{ version: number }>(
      "SELECT version FROM plotpoint_migrations ORDER BY version",
    );
    if (
      existing.rows.length > 0 &&
      (existing.rows.length !== 1 ||
        existing.rows[0]?.version !== AUTHORITATIVE_HUNT_SCHEMA_VERSION)
    ) {
      throw new Error("authoritative-database-incompatible-reset-or-reinstall");
    }
    await client.query(AUTHORITATIVE_HUNT_MIGRATION);
    await client.query(
      "INSERT INTO plotpoint_migrations(version) VALUES ($1) ON CONFLICT DO NOTHING",
      [AUTHORITATIVE_HUNT_SCHEMA_VERSION],
    );
  });
}

export async function queryOne<Row extends QueryResultRow>(
  client: PoolClient,
  text: string,
  values: readonly unknown[] = [],
): Promise<Row | null> {
  const result: QueryResult<Row> = await client.query<Row>(text, [...values]);
  if (result.rowCount === 0) return null;
  if (result.rowCount !== 1) throw new Error("database-row-count-invalid");
  return result.rows[0] ?? null;
}
