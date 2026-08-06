import { describe, expect, it, vi } from "vitest";

import type { SharedPlayView, SyncCommand, SyncCommandResult, SyncPull } from "@plotpoint/protocol";

import type { ParticipantCredentialStore } from "../src/shared/credentials";
import { SharedSyncStore, type SharedSqlDatabase } from "../src/shared/database";
import { SharedHttpClient } from "../src/shared/http-client";
import { SharedSyncCoordinator } from "../src/shared/sync-coordinator";

type SyncTrigger = "enqueue" | "foreground" | "reconnect" | "retry";

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
}

interface ClaimedCommand {
  readonly sessionId: string;
  readonly commandId: string;
  readonly target: {
    readonly aggregateKind: "team";
    readonly aggregateId: string;
    readonly schemaId: string;
    readonly schemaVersion: number;
  };
  readonly expectedStateVersion: number;
  readonly commandType: string;
  readonly payload: { readonly amount: number };
  readonly observationIds: readonly string[];
  readonly status: "submitting";
  readonly enqueuedAt: string;
}

interface SchedulerStore {
  session(sessionId: string): Promise<{
    readonly sessionId: string;
    readonly runId: string;
    readonly releaseId: `sha256:${string}`;
    readonly participantId: string;
    readonly teamId: string;
    readonly serviceUrl: string;
    readonly cursor: string;
    readonly membershipStatus: "active" | "revoked";
  } | null>;
  beginSubmissionBatch(sessionId: string): Promise<{
    readonly sessionId: string;
    readonly commands: readonly ClaimedCommand[];
  }>;
  failSubmissionBatch(sessionId: string): Promise<void>;
  observations(runId: string, ids: readonly string[]): Promise<readonly []>;
  applyPull(sessionId: string, pull: SyncPull): Promise<void>;
  markRevoked(sessionId: string): Promise<void>;
  recordSyncEvent(
    sessionId: string,
    elapsedMs: number,
    phase: string,
    disposition: string,
    commandId?: string,
  ): Promise<void>;
}

interface SchedulerClient {
  submit(sessionId: string, credential: string, command: SyncCommand): Promise<SyncCommandResult>;
  pull(sessionId: string, credential: string, cursor: string): Promise<SyncPull>;
}

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>["resolve"];
  let reject!: Deferred<T>["reject"];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const releaseId = `sha256:${"a".repeat(64)}` as const;

function session(sessionId: string) {
  return {
    sessionId,
    runId: `run-${sessionId}`,
    releaseId,
    participantId: `participant-${sessionId}`,
    teamId: `team-${sessionId}`,
    serviceUrl: `https://${sessionId}.example.test`,
    cursor: "0",
    membershipStatus: "active" as const,
  };
}

function pull(sessionId: string, cursor = "1"): SyncPull {
  return {
    kind: "snapshot",
    reset: false,
    nextCursor: cursor,
    snapshot: {
      sessionId,
      releaseId,
      participantId: `participant-${sessionId}`,
      teamId: `team-${sessionId}`,
      membershipStatus: "active",
      confirmedAt: "2030-01-01T00:00:00.000Z",
      projections: [],
    },
    commandResults: [],
  };
}

function claimedCommand(sessionId: string): ClaimedCommand {
  return {
    sessionId,
    commandId: `command-${sessionId}`,
    target: {
      aggregateKind: "team",
      aggregateId: `team-${sessionId}`,
      schemaId: "example.counter",
      schemaVersion: 1,
    },
    expectedStateVersion: 0,
    commandType: "example.increment",
    payload: { amount: 1 },
    observationIds: [],
    status: "submitting",
    enqueuedAt: "2030-01-01T00:00:00.000Z",
  };
}

function createHarness(
  input: {
    beginSubmissionBatch?: SchedulerStore["beginSubmissionBatch"];
    pull?: SchedulerClient["pull"];
    submit?: SchedulerClient["submit"];
  } = {},
) {
  const store = {
    session: vi.fn(async (sessionId: string) => session(sessionId)),
    beginSubmissionBatch: vi.fn(
      input.beginSubmissionBatch ??
        (async (sessionId: string) => ({ sessionId, commands: [] as const })),
    ),
    failSubmissionBatch: vi.fn(async () => undefined),
    observations: vi.fn(async () => [] as const),
    applyPull: vi.fn(async () => undefined),
    markRevoked: vi.fn(async () => undefined),
    recordSyncEvent: vi.fn(async () => undefined),
  } satisfies SchedulerStore;
  const client = {
    submit: vi.fn(
      input.submit ??
        (async (_sessionId: string, _credential: string, command: SyncCommand) => ({
          commandId: command.commandId,
          disposition: "decided" as const,
          terminal: "accepted" as const,
          outcomeCode: "incremented",
          resultingStateVersion: command.expectedStateVersion + 1,
          decisionPosition: "1",
        })),
    ),
    pull: vi.fn(
      input.pull ??
        (async (sessionId: string, _credential: string, cursor: string) =>
          pull(sessionId, String(Number(cursor) + 1))),
    ),
  } satisfies SchedulerClient;
  const credentials = {
    create: vi.fn(async () => "credential"),
    get: vi.fn(async (sessionId: string) => `credential-${sessionId}`),
    remove: vi.fn(async () => undefined),
    getOrCreateJoinRequestId: vi.fn(async () => "join-request"),
  } satisfies ParticipantCredentialStore;
  const clientFactory = vi.fn(() => client as unknown as SharedHttpClient);
  const coordinator = new SharedSyncCoordinator(
    store as unknown as SharedSyncStore,
    credentials,
    clientFactory,
  );
  return { client, clientFactory, coordinator, credentials, store };
}

function request(
  coordinator: SharedSyncCoordinator,
  sessionId: string,
  trigger: SyncTrigger,
): Promise<void> {
  return coordinator.request(sessionId, trigger);
}

describe("shared sync coordinator", () => {
  it("shares one stable drain promise and one active pass for triggers before batch claim", async () => {
    const claim = deferred<{ readonly sessionId: string; readonly commands: readonly [] }>();
    const harness = createHarness({
      beginSubmissionBatch: () => claim.promise,
    });

    const enqueueDrain = request(harness.coordinator, "session-1", "enqueue");
    const foregroundDrain = request(harness.coordinator, "session-1", "foreground");
    const retryDrain = request(harness.coordinator, "session-1", "retry");

    expect(foregroundDrain).toBe(enqueueDrain);
    expect(retryDrain).toBe(enqueueDrain);
    await vi.waitFor(() => expect(harness.store.beginSubmissionBatch).toHaveBeenCalledTimes(1));

    claim.resolve({ sessionId: "session-1", commands: [] });
    await enqueueDrain;

    expect(harness.store.beginSubmissionBatch).toHaveBeenCalledTimes(1);
    expect(harness.client.pull).toHaveBeenCalledTimes(1);
    expect(harness.store.applyPull).toHaveBeenCalledTimes(1);
  });

  it("keeps the same drain through one serialized trailing pass for every trigger after claim", async () => {
    const firstPull = deferred<SyncPull>();
    const trailingPull = deferred<SyncPull>();
    let activePasses = 0;
    let maximumActivePasses = 0;
    const harness = createHarness({
      beginSubmissionBatch: async (sessionId) => {
        activePasses += 1;
        maximumActivePasses = Math.max(maximumActivePasses, activePasses);
        return { sessionId, commands: [] };
      },
      pull: async (sessionId, _credential, cursor) => {
        if (harness.client.pull.mock.calls.length === 1) return firstPull.promise;
        if (harness.client.pull.mock.calls.length === 2) return trailingPull.promise;
        return pull(sessionId, String(Number(cursor) + 1));
      },
    });
    harness.store.applyPull.mockImplementation(async () => {
      activePasses -= 1;
    });

    const initialDrain = request(harness.coordinator, "session-1", "enqueue");
    await vi.waitFor(() => expect(harness.client.pull).toHaveBeenCalledTimes(1));

    let trailingTriggerResolved = false;
    const trailingDrain = request(harness.coordinator, "session-1", "foreground");
    void trailingDrain.then(() => {
      trailingTriggerResolved = true;
    });
    const reconnectDrain = request(harness.coordinator, "session-1", "reconnect");
    const retryDrain = request(harness.coordinator, "session-1", "retry");

    expect(trailingDrain).toBe(initialDrain);
    expect(reconnectDrain).toBe(initialDrain);
    expect(retryDrain).toBe(initialDrain);

    firstPull.resolve(pull("session-1"));
    await vi.waitFor(() => expect(harness.store.beginSubmissionBatch).toHaveBeenCalledTimes(2));
    expect(trailingTriggerResolved).toBe(false);
    trailingPull.resolve(pull("session-1", "2"));
    await trailingDrain;

    expect(harness.store.beginSubmissionBatch).toHaveBeenCalledTimes(2);
    expect(harness.client.pull).toHaveBeenCalledTimes(2);
    expect(maximumActivePasses).toBe(1);
  });

  it("allows different sessions to drain independently", async () => {
    const firstSessionPull = deferred<SyncPull>();
    const harness = createHarness({
      pull: (sessionId, _credential, cursor) =>
        sessionId === "session-a"
          ? firstSessionPull.promise
          : Promise.resolve(pull(sessionId, String(Number(cursor) + 1))),
    });

    let firstSessionResolved = false;
    const firstSessionDrain = request(harness.coordinator, "session-a", "enqueue");
    void firstSessionDrain.then(() => {
      firstSessionResolved = true;
    });
    const secondSessionDrain = request(harness.coordinator, "session-b", "enqueue");

    await secondSessionDrain;
    expect(firstSessionResolved).toBe(false);
    expect(harness.store.beginSubmissionBatch).toHaveBeenCalledWith("session-a");
    expect(harness.store.beginSubmissionBatch).toHaveBeenCalledWith("session-b");

    firstSessionPull.resolve(pull("session-a"));
    await firstSessionDrain;
  });

  it("keeps durable shared view reads pure", async () => {
    const sharedView = {
      sessionId: "session-1",
      releaseId,
      transport: "offline",
      synchronization: "recovery-required",
      confirmedAt: null,
      membership: { status: "active", teamId: "team-session-1" },
      projections: [],
      actions: [],
    } satisfies SharedPlayView;
    const database = {
      getFirstAsync: vi.fn(async () => ({
        release_id: sharedView.releaseId,
        team_id: sharedView.membership.teamId,
        membership_status: sharedView.membership.status,
        transport_status: sharedView.transport,
        sync_status: sharedView.synchronization,
        confirmed_at: sharedView.confirmedAt,
      })),
      getAllAsync: vi.fn(async () => []),
    } as unknown as SharedSqlDatabase;
    const store = new SharedSyncStore(database);
    const clientFactory = vi.fn(() => {
      throw new Error("view-read-started-network");
    });
    const coordinator = new SharedSyncCoordinator(
      store,
      {
        create: vi.fn(async () => "credential"),
        get: vi.fn(async () => "credential"),
        remove: vi.fn(async () => undefined),
        getOrCreateJoinRequestId: vi.fn(async () => "join-request"),
      },
      clientFactory,
    );
    const schedulerRequest = vi.spyOn(coordinator, "request");

    await expect(store.view("session-1")).resolves.toEqual(sharedView);
    expect(schedulerRequest).not.toHaveBeenCalled();
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("recovers a durable submitting command after coordinator restart", async () => {
    const recovered = claimedCommand("session-1");
    let durableStatus: "submitting" | "terminal" = "submitting";
    const harness = createHarness({
      beginSubmissionBatch: async (sessionId) => {
        expect(durableStatus).toBe("submitting");
        return { sessionId, commands: [recovered] };
      },
    });
    harness.store.applyPull.mockImplementation(async () => {
      durableStatus = "terminal";
    });

    const restartedCoordinator = new SharedSyncCoordinator(
      harness.store as unknown as SharedSyncStore,
      harness.credentials,
      harness.clientFactory,
    );
    await request(restartedCoordinator, "session-1", "retry");

    expect(harness.store.beginSubmissionBatch).toHaveBeenCalledOnce();
    expect(harness.client.submit).toHaveBeenCalledWith("session-1", "credential-session-1", {
      commandId: recovered.commandId,
      target: recovered.target,
      expectedStateVersion: recovered.expectedStateVersion,
      type: recovered.commandType,
      payload: recovered.payload,
      observations: [],
    });
    expect(harness.client.submit).toHaveBeenCalledTimes(1);
    expect(harness.client.pull).toHaveBeenCalledTimes(1);
    expect(durableStatus).toBe("terminal");
  });
});
