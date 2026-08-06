import { describe, expect, it, vi } from "vitest";

import type { GameComposition, SharedPlayView, SyncPull } from "@plotpoint/protocol";

import {
  createCompositionSharedBridgeHandlers,
  deriveSharedRuntimeSurface,
  routeSharedBridgeMessage,
  type SharedProjectionContract,
} from "../src/shared/host-bridge";
import { SHARED_MIGRATION, SharedSyncStore, type SharedSqlDatabase } from "../src/shared/database";
import { SharedHttpClient } from "../src/shared/http-client";
import { SharedSyncCoordinator } from "../src/shared/sync-coordinator";
import { buildSharedHuntReport } from "../src/reports/create-shared-hunt-report";

const releaseId = `sha256:${"a".repeat(64)}` as const;
const command = {
  commandId: "command-1",
  target: {
    aggregateKind: "team",
    aggregateId: "team-1",
    schemaId: "example.counter",
    schemaVersion: 1,
  },
  expectedStateVersion: 0,
  type: "example.increment",
  payload: { amount: 1 },
  observationIds: ["observation-1"],
} as const;

const sharedComposition = {
  application: { components: ["shared-panel"] },
  aggregateModels: [
    {
      id: "local-model",
      authority: "local",
      kind: "player",
      stateSchema: { id: "local-state" },
      initializationSchema: { id: "local-initialization" },
      events: [],
      effects: [],
    },
    {
      id: "shared-model",
      authority: "server",
      kind: "team",
      stateSchema: { id: "shared-state" },
      initializationSchema: { id: "shared-initialization" },
      events: [],
      effects: [],
    },
  ],
  commands: [
    {
      id: "shared-action",
      type: "shared.action",
      aggregateModel: "shared-model",
      payloadSchema: { id: "shared-action-payload" },
      outcomeSchema: { id: "shared-action-outcome" },
      execution: "trusted-mechanic",
    },
  ],
  progressions: [],
  components: [
    {
      id: "shared-panel",
      commands: ["shared-action"],
      content: ["shared-configuration"],
      assets: [],
      capabilities: [],
      sharedProjection: { id: "shared-projection" },
    },
  ],
  resources: [],
  trustedMechanic: {
    id: "shared-adapter",
    aggregateModel: "shared-model",
    commands: ["shared-action"],
    configuration: "shared-configuration",
    projectionSchema: { id: "shared-projection" },
    capabilities: [],
  },
} satisfies GameComposition;

const localComposition = {
  ...sharedComposition,
  commands: [],
  components: [{ ...sharedComposition.components[0]!, commands: [], sharedProjection: undefined }],
  trustedMechanic: undefined,
} satisfies GameComposition;

const sharedView = {
  sessionId: "session-1",
  releaseId,
  transport: "online",
  synchronization: "current",
  confirmedAt: "2030-01-01T00:00:00.000Z",
  membership: { status: "active", teamId: "team-1" },
  projections: [
    {
      aggregateKind: "team",
      aggregateId: "team-1",
      schemaId: "shared-projection",
      schemaVersion: 1,
      stateVersion: 2,
      value: { count: 2 },
    },
  ],
  actions: [],
} satisfies SharedPlayView;

const projectionContract: SharedProjectionContract = {
  schemaId: "shared-projection",
  schemaVersion: 1,
  validate: (value) =>
    typeof value.count === "number" &&
    Number.isSafeInteger(value.count) &&
    Object.keys(value).length === 1,
};

function pullWithMembership(membershipStatus: "active" | "revoked"): SyncPull {
  return {
    kind: "snapshot",
    reset: false,
    nextCursor: membershipStatus === "revoked" ? "revoked-cursor" : "active-cursor",
    snapshot: {
      sessionId: "session-1",
      releaseId,
      participantId: "participant-1",
      teamId: "team-1",
      membershipStatus,
      confirmedAt: "2030-01-01T00:00:00.000Z",
      projections: [],
    },
    commandResults: [],
  };
}

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

  it.each([
    {
      name: "invalid JSON",
      raw: "{",
      expectedRequestId: "unknown",
    },
    {
      name: "invalid request ID",
      raw: JSON.stringify({
        version: 1,
        requestId: "",
        type: "shared.view.get",
        payload: {},
      }),
      expectedRequestId: "unknown",
    },
    {
      name: "non-canonical request ID",
      raw: JSON.stringify({
        version: 1,
        requestId: "\ud800",
        type: "shared.view.get",
        payload: {},
      }),
      expectedRequestId: "unknown",
    },
    {
      name: "unsupported version",
      raw: JSON.stringify({
        version: 2,
        requestId: "semantic-version",
        type: "shared.view.get",
        payload: {},
      }),
      expectedRequestId: "semantic-version",
    },
    {
      name: "unknown operation",
      raw: JSON.stringify({
        version: 1,
        requestId: "semantic-type",
        type: "shared.unknown",
        payload: {},
      }),
      expectedRequestId: "semantic-type",
    },
    {
      name: "malformed operation payload",
      raw: JSON.stringify({
        version: 1,
        requestId: "semantic-payload",
        type: "shared.command.enqueue",
        payload: { command: { malformed: true } },
      }),
      expectedRequestId: "semantic-payload",
    },
    {
      name: "malformed envelope fields",
      raw: JSON.stringify({
        version: 1,
        requestId: "semantic-envelope",
        type: "shared.view.get",
        payload: {},
        unexpected: true,
      }),
      expectedRequestId: "semantic-envelope",
    },
  ])("echoes the safely decoded request ID for $name", async ({ raw, expectedRequestId }) => {
    const result = await routeSharedBridgeMessage(raw, {
      getView: async () => sharedView,
      enqueue: async () => {
        throw new Error("unexpected-enqueue");
      },
    });
    expect(result).toMatchObject({
      requestId: expectedRequestId,
      type: "host.error",
      payload: { code: "shared-message-invalid" },
    });
  });

  it("preserves request correlation for semantic handler failures", async () => {
    const result = await routeSharedBridgeMessage(
      JSON.stringify({
        version: 1,
        requestId: "missing-session-request",
        type: "shared.view.get",
        payload: {},
      }),
      {
        getView: async () => {
          throw new Error("shared-session-missing");
        },
        enqueue: async () => {
          throw new Error("unexpected-enqueue");
        },
      },
    );
    expect(result).toMatchObject({
      requestId: "missing-session-request",
      type: "host.error",
      payload: { code: "shared-session-missing" },
    });
  });

  it("derives local-only, join, bound, and recovery surfaces only from composition", () => {
    expect(deriveSharedRuntimeSurface(localComposition, null, releaseId, null)).toEqual({
      kind: "local-only",
      sharedBindingAvailable: false,
    });
    expect(
      deriveSharedRuntimeSurface(sharedComposition, null, releaseId, projectionContract),
    ).toEqual({
      kind: "join",
      sharedBindingAvailable: false,
    });
    expect(
      deriveSharedRuntimeSurface(sharedComposition, sharedView, releaseId, projectionContract),
    ).toMatchObject({
      kind: "bound",
      sharedBindingAvailable: true,
      view: { projections: [{ schemaId: "shared-projection" }] },
    });
    expect(
      deriveSharedRuntimeSurface(
        sharedComposition,
        { ...sharedView, synchronization: "recovery-required" },
        releaseId,
        projectionContract,
      ),
    ).toEqual({
      kind: "recovery",
      sharedBindingAvailable: false,
      code: "shared-recovery-required",
    });
    expect(
      deriveSharedRuntimeSurface(
        sharedComposition,
        { ...sharedView, releaseId: `sha256:${"b".repeat(64)}` },
        releaseId,
        projectionContract,
      ),
    ).toEqual({
      kind: "recovery",
      sharedBindingAvailable: false,
      code: "shared-release-mismatch",
    });
    for (const [projection, code] of [
      [{ ...sharedView.projections[0]!, schemaVersion: 2 }, "shared-projection-binding-invalid"],
      [
        { ...sharedView.projections[0]!, value: { count: "invalid" } },
        "shared-projection-payload-invalid",
      ],
    ] as const) {
      expect(
        deriveSharedRuntimeSurface(
          sharedComposition,
          { ...sharedView, projections: [projection] },
          releaseId,
          projectionContract,
        ),
      ).toEqual({ kind: "recovery", sharedBindingAvailable: false, code });
    }
  });

  it("scopes projections and dispatches only composition-bound shared commands", async () => {
    const enqueue = vi.fn(async () => ({
      commandId: "action-1",
      disposition: "queued" as const,
      terminal: "pending" as const,
    }));
    const handlers = createCompositionSharedBridgeHandlers({
      composition: sharedComposition,
      expectedReleaseId: releaseId,
      aggregateSchemaVersions: { "shared-state": 1 },
      projectionContract,
      getView: async () => ({
        ...sharedView,
        projections: [
          ...sharedView.projections,
          {
            aggregateKind: "player",
            aggregateId: "participant-1",
            schemaId: "private-projection",
            schemaVersion: 1,
            stateVersion: 1,
            value: { private: true },
          },
        ],
      }),
      enqueue,
    });
    const viewResponse = await routeSharedBridgeMessage(
      JSON.stringify({
        version: 1,
        requestId: "view-request",
        type: "shared.view.get",
        payload: {},
      }),
      handlers,
    );
    expect(viewResponse).toMatchObject({
      type: "shared.view.result",
      payload: { projections: [{ schemaId: "shared-projection" }] },
    });
    expect((viewResponse.payload as unknown as SharedPlayView).projections).toHaveLength(1);

    const validCommand = {
      commandId: "action-1",
      target: {
        aggregateKind: "team" as const,
        aggregateId: "team-1",
        schemaId: "shared-state",
        schemaVersion: 1,
      },
      expectedStateVersion: 2,
      type: "shared.action",
      payload: { choice: "alpha" },
      observationIds: [],
    };
    await expect(
      routeSharedBridgeMessage(
        JSON.stringify({
          version: 1,
          requestId: "command-request",
          type: "shared.command.enqueue",
          payload: { command: validCommand },
        }),
        handlers,
      ),
    ).resolves.toMatchObject({ type: "shared.command.result" });
    expect(enqueue).toHaveBeenCalledWith(validCommand);

    const mismatch = await routeSharedBridgeMessage(
      JSON.stringify({
        version: 1,
        requestId: "mismatch-request",
        type: "shared.command.enqueue",
        payload: { command: { ...validCommand, expectedStateVersion: 99 } },
      }),
      handlers,
    );
    expect(mismatch).toMatchObject({
      requestId: "mismatch-request",
      type: "host.error",
      payload: { code: "shared-command-version-mismatch" },
    });
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("keeps credentials in the Authorization header and preserves exact terminals", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://example.test/v1/shared-sessions/session-1/commands");
      expect(init?.headers).toMatchObject({ authorization: "Bearer secret" });
      expect(init?.body).not.toContain("secret");
      return new Response(
        JSON.stringify({
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
        { ...command, observations: [] },
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

  it("blocks every pending action in the same transaction as a revoked snapshot", async () => {
    const statements: Array<{ readonly sql: string; readonly parameters: readonly unknown[] }> = [];
    const transaction = {
      runAsync: vi.fn(async (sql: string, ...parameters: unknown[]) => {
        statements.push({ sql: sql.replace(/\s+/g, " ").trim(), parameters });
        return { changes: 1 };
      }),
      getFirstAsync: vi.fn(async () => ({
        release_id: releaseId,
        participant_id: "participant-1",
        team_id: "team-1",
        membership_status: "active",
      })),
      getAllAsync: vi.fn(async () => []),
    } as unknown as SharedSqlDatabase;
    const database = {
      withExclusiveTransactionAsync: async (operation: (tx: SharedSqlDatabase) => Promise<void>) =>
        operation(transaction),
    } as unknown as SharedSqlDatabase;

    await new SharedSyncStore(database).applyPull("session-1", pullWithMembership("revoked"));

    const blockedOutbox = statements.find(
      ({ sql }) => sql.includes("UPDATE shared_outbox") && sql.includes("blocked-revoked"),
    );
    expect(blockedOutbox).toBeDefined();
    expect(blockedOutbox?.parameters).toContain("session-1");
    expect(
      statements.some(
        ({ sql }) =>
          sql.includes("UPDATE shared_sessions") &&
          sql.includes("membership_status") &&
          sql.includes("sync_status"),
      ),
    ).toBe(true);
  });

  it("rejects a stale active snapshot before it can reactivate revoked durable state", async () => {
    const runAsync = vi.fn(async () => ({ changes: 1 }));
    const transaction = {
      runAsync,
      getFirstAsync: vi.fn(async () => ({
        release_id: releaseId,
        participant_id: "participant-1",
        team_id: "team-1",
        membership_status: "revoked",
      })),
      getAllAsync: vi.fn(async () => []),
    } as unknown as SharedSqlDatabase;
    const database = {
      withExclusiveTransactionAsync: async (operation: (tx: SharedSqlDatabase) => Promise<void>) =>
        operation(transaction),
    } as unknown as SharedSqlDatabase;

    await expect(
      new SharedSyncStore(database).applyPull("session-1", pullWithMembership("active")),
    ).rejects.toThrow("membership-reactivation-conflict");
    expect(runAsync).not.toHaveBeenCalled();
  });

  it("commits authenticated revocation before deleting the participant credential", async () => {
    const order: string[] = [];
    const store = {
      session: vi.fn(async () => ({
        sessionId: "session-1",
        runId: "run-1",
        releaseId,
        participantId: "participant-1",
        teamId: "team-1",
        serviceUrl: "https://example.test",
        cursor: "0",
        membershipStatus: "active" as const,
      })),
      beginSubmissionBatch: vi.fn(async () => ({ sessionId: "session-1", commands: [] })),
      failSubmissionBatch: vi.fn(async () => undefined),
      recordSyncEvent: vi.fn(async () => undefined),
      markRevoked: vi.fn(async () => {
        order.push("revocation-commit");
      }),
    } as unknown as SharedSyncStore;
    const credentials = {
      create: vi.fn(async () => "unused"),
      get: vi.fn(async () => "participant-secret"),
      remove: vi.fn(async () => {
        order.push("credential-delete");
      }),
      getOrCreateJoinRequestId: vi.fn(async () => "unused"),
    };
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ code: "participant-revoked" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
    );
    const coordinator = new SharedSyncCoordinator(
      store,
      credentials,
      () => new SharedHttpClient("https://example.test", fetcher as typeof fetch),
    );

    await coordinator.request("session-1", "retry");

    expect(order).toEqual(["revocation-commit", "credential-delete"]);
  });

  it("preserves the credential when authenticated revocation does not commit", async () => {
    const store = {
      session: vi.fn(async () => ({
        sessionId: "session-1",
        runId: "run-1",
        releaseId,
        participantId: "participant-1",
        teamId: "team-1",
        serviceUrl: "https://example.test",
        cursor: "0",
        membershipStatus: "active" as const,
      })),
      beginSubmissionBatch: vi.fn(async () => ({ sessionId: "session-1", commands: [] })),
      failSubmissionBatch: vi.fn(async () => undefined),
      recordSyncEvent: vi.fn(async () => undefined),
      markRevoked: vi.fn(async () => {
        throw new Error("revocation-commit-interrupted");
      }),
    } as unknown as SharedSyncStore;
    const remove = vi.fn(async () => undefined);
    const credentials = {
      create: vi.fn(async () => "unused"),
      get: vi.fn(async () => "participant-secret"),
      remove,
      getOrCreateJoinRequestId: vi.fn(async () => "unused"),
    };
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ code: "participant-revoked" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
    );
    const coordinator = new SharedSyncCoordinator(
      store,
      credentials,
      () => new SharedHttpClient("https://example.test", fetcher as typeof fetch),
    );

    await expect(coordinator.request("session-1", "retry")).rejects.toThrow(
      "revocation-commit-interrupted",
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it("deletes the credential only after a revoked snapshot commits", async () => {
    const order: string[] = [];
    const store = {
      session: vi.fn(async () => ({
        sessionId: "session-1",
        runId: "run-1",
        releaseId,
        participantId: "participant-1",
        teamId: "team-1",
        serviceUrl: "https://example.test",
        cursor: "0",
        membershipStatus: "active" as const,
      })),
      beginSubmissionBatch: vi.fn(async () => ({ sessionId: "session-1", commands: [] })),
      failSubmissionBatch: vi.fn(async () => undefined),
      recordSyncEvent: vi.fn(async () => undefined),
      applyPull: vi.fn(async () => {
        order.push("snapshot-commit");
      }),
      markRevoked: vi.fn(async () => {
        throw new Error("unexpected-terminal-error");
      }),
    } as unknown as SharedSyncStore;
    const credentials = {
      create: vi.fn(async () => "unused"),
      get: vi.fn(async () => "participant-secret"),
      remove: vi.fn(async () => {
        order.push("credential-delete");
      }),
      getOrCreateJoinRequestId: vi.fn(async () => "unused"),
    };
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify(pullWithMembership("revoked")), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const coordinator = new SharedSyncCoordinator(
      store,
      credentials,
      () => new SharedHttpClient("https://example.test", fetcher as typeof fetch),
    );

    await coordinator.request("session-1", "retry");

    expect(order).toEqual(["snapshot-commit", "credential-delete"]);
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
          getFirstAsync: async (sql: string) => {
            if (sql.includes("FROM shared_sessions")) {
              return {
                run_id: "run-1",
                release_id: releaseId,
                participant_id: "participant-1",
                team_id: "team-1",
                service_url: "https://example.test",
                membership_status: "active",
                sync_status: "syncing",
              };
            }
            if (sql.includes("expected_state_version") && sql.includes("FROM shared_outbox")) {
              return { expected_state_version: 0, observation_ids_json: "[]" };
            }
            return null;
          },
        } as unknown as SharedSqlDatabase;
        await operation(tx);
        committed.push(pending);
      },
    } as unknown as SharedSqlDatabase;
    const store = new SharedSyncStore(database);
    const pull = {
      kind: "snapshot" as const,
      reset: false,
      nextCursor: "1",
      snapshot: {
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
            schemaId: "example.counter",
            schemaVersion: 1,
            stateVersion: 1,
            value: { count: 1 },
          },
        ],
      },
      commandResults: [
        {
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
