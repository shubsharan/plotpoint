import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { AUTHORITATIVE_HUNT_MIGRATION, withReadCommittedTransaction } from "../src/index.js";

describe("authoritative PostgreSQL boundary", () => {
  it("contains only the simplified durable records", () => {
    for (const table of [
      "release_registrations",
      "hunt_sessions",
      "hunt_invitations",
      "hunt_participants",
      "team_aggregates",
      "authoritative_command_receipts",
      "authoritative_command_journal",
      "authoritative_domain_events",
      "authoritative_operational_events",
    ]) {
      expect(AUTHORITATIVE_HUNT_MIGRATION).toContain(table);
    }
    for (const deferred of [
      "participant_projections",
      "participant_deliveries",
      "membership_epochs",
      "effect_outbox",
    ]) {
      expect(AUTHORITATIVE_HUNT_MIGRATION).not.toContain(deferred);
    }
  });

  it("commits READ COMMITTED work on one checked-out client", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const release = vi.fn();
    const client = { query, release } as unknown as PoolClient;
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    await expect(
      withReadCommittedTransaction(pool, async (transaction) => {
        expect(transaction).toBe(client);
        await transaction.query("SELECT 1");
        return "ok";
      }),
    ).resolves.toBe("ok");
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN ISOLATION LEVEL READ COMMITTED",
      "SELECT 1",
      "COMMIT",
    ]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back and releases on failure", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const release = vi.fn();
    const client = { query, release } as unknown as PoolClient;
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    await expect(
      withReadCommittedTransaction(pool, async () => {
        throw new Error("fault");
      }),
    ).rejects.toThrow("fault");
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN ISOLATION LEVEL READ COMMITTED",
      "ROLLBACK",
    ]);
    expect(release).toHaveBeenCalledOnce();
  });
});
