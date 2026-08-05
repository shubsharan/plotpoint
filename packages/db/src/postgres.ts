import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";
import { AUTHORITATIVE_HUNT_MIGRATION } from "./schema.js";

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
    await client.query(AUTHORITATIVE_HUNT_MIGRATION);
    await client.query(
      "INSERT INTO plotpoint_migrations(version) VALUES (1) ON CONFLICT DO NOTHING",
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
