import { describe, expect, it, vi } from "vitest";

import { routeSharedBridgeMessage } from "../src/shared/host-bridge";
import { SHARED_MIGRATION, SharedSyncStore, type SharedSqlDatabase } from "../src/shared/database";
import { SharedHttpClient } from "../src/shared/http-client";
import { buildSharedHuntReport } from "../src/reports/create-shared-hunt-report";

const releaseId = `sha256:${"a".repeat(64)}` as const;
const command = {
  commandId: "command-1",
  target: {
    aggregateKind: "team",
    aggregateId: "team-1",
    schemaId: "example.counter.v1",
    schemaVersion: 1,
  },
  expectedStateVersion: 0,
  type: "example.increment.v1",
  payload: { amount: 1 },
  observationIds: ["observation-1"],
} as const;

describe("shared player architecture", () => {
  it("uses only the minimal additive durable tables", () => {
    expect(SHARED_MIGRATION).toContain("shared_outbox");
    expect(SHARED_MIGRATION).toContain("shared_projections");
    expect(SHARED_MIGRATION).not.toMatch(/delivery|inbox|membership_epoch|effect_outbox/);
  });

  it("routes generic bridge commands and rejects hunt-shaped host fields", async () => {
    const enqueue = vi.fn(async () => ({
      commandId: command.commandId,
      disposition: "queued" as const,
      terminal: "pending" as const,
    }));
    const response = await routeSharedBridgeMessage(
      JSON.stringify({
        version: 1,
        requestId: "request-1",
        type: "shared.command.enqueue",
        payload: { command },
      }),
      {
        getView: async () => {
          throw new Error("unexpected");
        },
        enqueue,
      },
    );
    expect(response).toMatchObject({
      type: "shared.command.result",
      payload: { terminal: "pending" },
    });
    expect(enqueue).toHaveBeenCalledWith(command);
    const invalid = await routeSharedBridgeMessage(
      JSON.stringify({
        version: 1,
        requestId: "request-2",
        type: "shared.command.enqueue",
        payload: { hunt: "hunt-1", targetId: "target-1" },
      }),
      {
        getView: async () => {
          throw new Error("unexpected");
        },
        enqueue,
      },
    );
    expect(invalid).toMatchObject({ type: "host.error" });
  });

  it("keeps credentials in the Authorization header and preserves exact terminals", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ authorization: "Bearer secret" });
      expect(init?.body).not.toContain("secret");
      return new Response(
        JSON.stringify({
          version: 1,
          commandId: "command-1",
          disposition: "decided",
          terminal: "no-op",
          outcomeCode: "already",
          resultingStateVersion: 2,
          decisionPosition: "7",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    await expect(
      new SharedHttpClient("https://example.test", fetcher as typeof fetch).submit(
        "session-1",
        "secret",
        { version: 1, ...command, observations: [] },
      ),
    ).resolves.toMatchObject({ terminal: "no-op", outcomeCode: "already" });
  });

  it("resolves only exact persisted observations", async () => {
    const row = {
      observation_id: "observation-1",
      recorded_at: "2030-01-01T00:00:01.000Z",
      captured_at: "2030-01-01T00:00:00.000Z",
      age_ms: 1000,
      availability: "available",
      latitude: 37,
      longitude: -122,
      horizontal_accuracy: 8,
      diagnostic_code: null,
    };
    const database = { getFirstAsync: vi.fn(async () => row) } as unknown as SharedSqlDatabase;
    const observations = await new SharedSyncStore(database).observations("run-1", [
      "observation-1",
    ]);
    expect(observations).toEqual([
      {
        version: 1,
        observationId: "observation-1",
        recordedAt: row.recorded_at,
        capturedAt: row.captured_at,
        ageMs: 1000,
        availability: "available",
        latitude: 37,
        longitude: -122,
        horizontalAccuracy: 8,
      },
    ]);
  });

  it("applies projection, result, outbox removal, and cursor as one interruption-safe transaction", async () => {
    const committed: string[][] = [];
    let failAt = 3;
    const database = {
      withExclusiveTransactionAsync: async (
        operation: (tx: SharedSqlDatabase) => Promise<void>,
      ) => {
        const pending: string[] = [];
        let call = 0;
        const tx = {
          runAsync: async (sql: string) => {
            call += 1;
            if (call === failAt) throw new Error("interrupted");
            pending.push(sql);
            return {};
          },
          getFirstAsync: async () => ({ expected_state_version: 0, observation_ids_json: "[]" }),
        } as unknown as SharedSqlDatabase;
        await operation(tx);
        committed.push(pending);
      },
    } as unknown as SharedSqlDatabase;
    const store = new SharedSyncStore(database);
    const pull = {
      version: 1 as const,
      kind: "snapshot" as const,
      reset: false,
      nextCursor: "1",
      snapshot: {
        version: 1 as const,
        sessionId: "session-1",
        releaseId,
        participantId: "participant-1",
        teamId: "team-1",
        membershipStatus: "active" as const,
        confirmedAt: "2030-01-01T00:00:00.000Z",
        projections: [
          {
            aggregateKind: "team" as const,
            aggregateId: "team-1",
            schemaId: "example.counter.v1",
            schemaVersion: 1,
            stateVersion: 1,
            value: { count: 1 },
          },
        ],
      },
      commandResults: [
        {
          version: 1 as const,
          commandId: "command-1",
          disposition: "decided" as const,
          terminal: "accepted" as const,
          outcomeCode: "incremented",
          resultingStateVersion: 1,
          decisionPosition: "1",
        },
      ],
    };
    await expect(store.applyPull("session-1", pull)).rejects.toThrow("interrupted");
    expect(committed).toEqual([]);
    failAt = Number.POSITIVE_INFINITY;
    await expect(store.applyPull("session-1", pull)).resolves.toBeUndefined();
    expect(committed[0]!.at(-1)).toContain("UPDATE shared_sessions");
  });
});

describe("shared hunt report", () => {
  it("keeps exact terminals and only location quality bands", () => {
    const report = buildSharedHuntReport({
      releaseId,
      platform: "ios",
      startedAtMs: 1000,
      endedAtMs: 2000,
      completion: { completedTargets: 1, totalTargets: 3, complete: false },
      commands: [
        {
          commandId: "sensitive-command",
          elapsedMs: 20,
          expectedVersion: 0,
          terminal: "accepted",
          resultingVersion: 1,
          outcomeCode: "target-discovered",
          observations: [
            {
              version: 1,
              observationId: "sensitive-observation",
              recordedAt: "2030-01-01T00:00:01.000Z",
              capturedAt: "2030-01-01T00:00:00.000Z",
              ageMs: 1000,
              availability: "available",
              latitude: 37,
              longitude: -122,
              horizontalAccuracy: 8,
            },
          ],
        },
      ],
      synchronization: [{ elapsedMs: 30, phase: "current", disposition: "snapshot-replaced" }],
    });
    expect(report.events).toContainEqual(
      expect.objectContaining({
        kind: "command",
        terminal: "accepted",
        commandAlias: "command-001",
      }),
    );
    expect(JSON.stringify(report)).not.toMatch(/sensitive|latitude|longitude|observationId/);
  });
});
