import { describe, expect, it } from "vitest";

import type { SharedCommandIntent, SyncPull } from "@plotpoint/protocol";

import { SharedSyncStore } from "../src/shared/database";
import { createSharedTestDatabase, type TestSharedSqliteDatabase } from "./helpers/shared-sqlite";

const releaseId = `sha256:${"a".repeat(64)}` as const;

function projection(stateVersion: number) {
  return {
    aggregateKind: "team" as const,
    aggregateId: "team-1",
    schemaId: "shared-projection",
    schemaVersion: 1,
    stateVersion,
    value: { completed: stateVersion },
  };
}

function pull(input: {
  readonly cursor: string;
  readonly membership?: "active" | "revoked";
  readonly stateVersion: number;
  readonly commandIds?: readonly string[];
}): SyncPull {
  return {
    kind: "snapshot",
    reset: true,
    nextCursor: input.cursor,
    snapshot: {
      sessionId: "session-1",
      releaseId,
      participantId: "participant-1",
      teamId: "team-1",
      membershipStatus: input.membership ?? "active",
      confirmedAt: "2030-01-01T00:00:00.000Z",
      projections: [projection(input.stateVersion)],
    },
    commandResults: (input.commandIds ?? []).map((commandId, index) => ({
      commandId,
      disposition: "decided" as const,
      terminal: "accepted" as const,
      outcomeCode: "accepted",
      resultingStateVersion: 1,
      decisionPosition: String(index + 1).padStart(4, "0"),
    })),
  };
}

function command(commandId: string): SharedCommandIntent {
  return {
    commandId,
    target: {
      aggregateKind: "team",
      aggregateId: "team-1",
      schemaId: "shared-state",
      schemaVersion: 1,
    },
    expectedStateVersion: 0,
    type: "shared.action",
    payload: { commandId },
    observationIds: [],
  };
}

async function durableBytes(database: TestSharedSqliteDatabase): Promise<string> {
  return JSON.stringify(await database.sharedState("session-1"));
}

describe("shared recovery acceptance", () => {
  it("converges 100 response-loss retries and repeated corrective/revoked pulls byte-exactly", async () => {
    const database = await createSharedTestDatabase();
    try {
      const store = new SharedSyncStore(database);
      await database.runAsync(
        `INSERT INTO shared_sessions
         (session_id,run_id,release_id,participant_id,team_id,service_url,membership_status,
          transport_status,sync_status,cursor,confirmed_at)
         VALUES (?,?,?,?,?,?,'active','online','current','0',?)`,
        "session-1",
        "run-1",
        releaseId,
        "participant-1",
        "team-1",
        "https://service.example",
        "2030-01-01T00:00:00.000Z",
      );

      const commandIds = Array.from(
        { length: 100 },
        (_, index) => `command-${String(index).padStart(3, "0")}`,
      );
      for (const commandId of commandIds) {
        await store.enqueue("session-1", command(commandId), "2030-01-01T00:00:00.000Z");
      }

      const lostResponseBatch = await store.beginSubmissionBatch("session-1");
      expect(lostResponseBatch.commands.map(({ commandId }) => commandId)).toEqual(commandIds);
      const recoveredBatch = await store.beginSubmissionBatch("session-1");
      expect(recoveredBatch).toEqual(lostResponseBatch);

      const normal = pull({ cursor: "100", stateVersion: 100, commandIds });
      await store.applyPull("session-1", normal);
      const normalBytes = await durableBytes(database);
      for (let iteration = 0; iteration < 100; iteration += 1) {
        await store.applyPull("session-1", normal);
      }
      expect(await durableBytes(database)).toBe(normalBytes);
      await expect(
        database.getFirstAsync<{ count: number }>(
          "SELECT COUNT(*) AS count FROM shared_results WHERE session_id=?",
          "session-1",
        ),
      ).resolves.toEqual({ count: 100 });

      const corrective = pull({ cursor: "101", stateVersion: 101, commandIds });
      await store.applyPull("session-1", corrective);
      const correctiveBytes = await durableBytes(database);
      await store.applyPull("session-1", corrective);
      expect(await durableBytes(database)).toBe(correctiveBytes);

      await store.enqueue(
        "session-1",
        command("command-blocked-after-revocation"),
        "2030-01-01T00:00:01.000Z",
      );
      const revoked = pull({ cursor: "102", membership: "revoked", stateVersion: 101 });
      await store.applyPull("session-1", revoked);
      const revokedBytes = await durableBytes(database);
      for (let iteration = 0; iteration < 100; iteration += 1) {
        await store.applyPull("session-1", revoked);
      }
      expect(await durableBytes(database)).toBe(revokedBytes);
      await expect(store.applyPull("session-1", corrective)).rejects.toThrow(
        "membership-reactivation-conflict",
      );
      expect(await durableBytes(database)).toBe(revokedBytes);
      const revokedView = await store.view("session-1");
      expect(revokedView.membership).toMatchObject({ status: "revoked" });
      expect(revokedView.actions).toContainEqual(
        expect.objectContaining({
          commandId: "command-blocked-after-revocation",
          terminal: "blocked-revoked",
        }),
      );
    } finally {
      database.close();
    }
  });
});
