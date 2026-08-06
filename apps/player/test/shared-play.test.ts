import { describe, expect, it, vi } from "vitest";

import type { GameComposition, SharedPlayView } from "@plotpoint/protocol";

import {
  createCompositionSharedBridgeHandlers,
  deriveSharedRuntimeSurface,
  routeSharedBridgeMessage,
  type SharedProjectionContract,
} from "../src/shared/host-bridge";
import { SHARED_MIGRATION, SharedSyncStore, type SharedSqlDatabase } from "../src/shared/database";
import { SharedHttpClient } from "../src/shared/http-client";
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
