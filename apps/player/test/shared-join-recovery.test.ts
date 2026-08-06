import type { SyncPull } from "@plotpoint/protocol";
import { afterEach, describe, expect, it } from "vitest";

import { migrateSharedDatabase, SharedSyncStore } from "../src/shared/database";
import { TestSharedSqliteDatabase } from "./helpers/shared-sqlite";

const releaseId = `sha256:${"a".repeat(64)}` as const;
const otherReleaseId = `sha256:${"b".repeat(64)}` as const;

interface PendingSharedJoin {
  readonly sessionId: string;
  readonly runId: string;
  readonly expectedReleaseId: `sha256:${string}`;
  readonly serviceOrigin: string;
  readonly joinRequestId: string;
  readonly invitationDigest: string;
  readonly invitationKey: string;
  readonly credentialKey: string;
  readonly requestDigest: string;
  readonly status: "preparing" | "ready" | "submitting";
}

type PendingSharedJoinInput = Omit<PendingSharedJoin, "status">;

interface SharedBindingContext {
  readonly sessionId: string;
  readonly runId: string;
  readonly expectedReleaseId: `sha256:${string}`;
  readonly serviceOrigin: string;
  readonly credentialKey: string;
}

interface JoinResponseIdentity {
  readonly releaseId: `sha256:${string}`;
  readonly participantId: string;
  readonly teamId: string;
}

interface Phase7JoinStore {
  reservePendingJoin(input: PendingSharedJoinInput): Promise<PendingSharedJoin>;
  markPendingJoinReady(runId: string, requestDigest: string): Promise<PendingSharedJoin>;
  markPendingJoinSubmitting(runId: string, requestDigest: string): Promise<PendingSharedJoin>;
  pendingJoinForRun(runId: string): Promise<PendingSharedJoin | null>;
  commitJoinedSession(input: {
    readonly context: SharedBindingContext;
    readonly response: JoinResponseIdentity;
    readonly pull: SyncPull;
  }): Promise<void>;
  applyPull(context: SharedBindingContext, pull: SyncPull): Promise<void>;
  markRevoked(sessionId: string): Promise<void>;
}

const databases: TestSharedSqliteDatabase[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function pending(overrides: Partial<PendingSharedJoinInput> = {}): PendingSharedJoinInput {
  return {
    sessionId: "session-1",
    runId: "run-1",
    expectedReleaseId: releaseId,
    serviceOrigin: "https://example.test",
    joinRequestId: "join-request-1",
    invitationDigest: `sha256:${"c".repeat(64)}`,
    invitationKey: "plotpoint.shared.run-1.invitation",
    credentialKey: "plotpoint.shared.run-1.credential",
    requestDigest: `sha256:${"d".repeat(64)}`,
    ...overrides,
  };
}

function context(overrides: Partial<SharedBindingContext> = {}): SharedBindingContext {
  return {
    sessionId: "session-1",
    runId: "run-1",
    expectedReleaseId: releaseId,
    serviceOrigin: "https://example.test",
    credentialKey: "plotpoint.shared.run-1.credential",
    ...overrides,
  };
}

function response(overrides: Partial<JoinResponseIdentity> = {}): JoinResponseIdentity {
  return {
    releaseId,
    participantId: "participant-1",
    teamId: "team-1",
    ...overrides,
  };
}

function pull(
  overrides: {
    readonly sessionId?: string;
    readonly releaseId?: `sha256:${string}`;
    readonly participantId?: string;
    readonly teamId?: string;
    readonly membershipStatus?: "active" | "revoked";
    readonly cursor?: string;
    readonly confirmedAt?: string;
    readonly count?: number;
  } = {},
): SyncPull {
  return {
    kind: "snapshot",
    reset: false,
    nextCursor: overrides.cursor ?? "cursor-1",
    snapshot: {
      sessionId: overrides.sessionId ?? "session-1",
      releaseId: overrides.releaseId ?? releaseId,
      participantId: overrides.participantId ?? "participant-1",
      teamId: overrides.teamId ?? "team-1",
      membershipStatus: overrides.membershipStatus ?? "active",
      confirmedAt: overrides.confirmedAt ?? "2030-01-01T00:00:01.000Z",
      projections: [
        {
          aggregateKind: "team",
          aggregateId: "team-1",
          schemaId: "example.counter",
          schemaVersion: 1,
          stateVersion: overrides.count ?? 1,
          value: { count: overrides.count ?? 1 },
        },
      ],
    },
    commandResults: [],
  };
}

async function setup(): Promise<{
  readonly database: TestSharedSqliteDatabase;
  readonly store: Phase7JoinStore;
}> {
  const database = new TestSharedSqliteDatabase();
  databases.push(database);
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
    "run-1",
    releaseId,
    "2030-01-01T00:00:00.000Z",
  );
  await database.runAsync(
    "INSERT INTO runs (run_id,release_id,started_at,status) VALUES (?,?,?,'active')",
    "run-2",
    releaseId,
    "2030-01-01T00:00:00.000Z",
  );
  await migrateSharedDatabase(database);
  return {
    database,
    store: new SharedSyncStore(database) as unknown as Phase7JoinStore,
  };
}

async function advanceToSubmitting(
  store: Phase7JoinStore,
  attempt: PendingSharedJoinInput = pending(),
): Promise<PendingSharedJoin> {
  await store.reservePendingJoin(attempt);
  await store.markPendingJoinReady(attempt.runId, attempt.requestDigest);
  return store.markPendingJoinSubmitting(attempt.runId, attempt.requestDigest);
}

async function commit(
  store: Phase7JoinStore,
  input: {
    readonly context?: SharedBindingContext;
    readonly response?: JoinResponseIdentity;
    readonly pull?: SyncPull;
  } = {},
): Promise<void> {
  await store.commitJoinedSession({
    context: input.context ?? context(),
    response: input.response ?? response(),
    pull: input.pull ?? pull(),
  });
}

async function durableState(database: TestSharedSqliteDatabase): Promise<unknown> {
  return {
    pending: await database.getAllAsync<Record<string, unknown>>(
      "SELECT * FROM pending_shared_joins ORDER BY run_id",
    ),
    sessions: await database.getAllAsync<Record<string, unknown>>(
      "SELECT * FROM shared_sessions ORDER BY run_id,session_id",
    ),
    outbox: await database.getAllAsync<Record<string, unknown>>(
      "SELECT * FROM shared_outbox ORDER BY session_id,enqueued_at,command_id",
    ),
    projections: await database.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM shared_projections
       ORDER BY session_id,aggregate_kind,aggregate_id,schema_id,schema_version`,
    ),
    results: await database.getAllAsync<Record<string, unknown>>(
      "SELECT * FROM shared_results ORDER BY session_id,decision_position,command_id",
    ),
  };
}

describe("release-pinned shared join SQLite recovery", () => {
  it("persists preparing, ready, and submitting states and resumes exact pending identity", async () => {
    const { database, store } = await setup();
    const attempt = pending();

    await expect(store.reservePendingJoin(attempt)).resolves.toEqual({
      ...attempt,
      status: "preparing",
    });
    await expect(store.pendingJoinForRun(attempt.runId)).resolves.toEqual({
      ...attempt,
      status: "preparing",
    });
    await expect(store.markPendingJoinReady(attempt.runId, attempt.requestDigest)).resolves.toEqual(
      {
        ...attempt,
        status: "ready",
      },
    );
    await expect(store.reservePendingJoin(attempt)).resolves.toEqual({
      ...attempt,
      status: "ready",
    });
    await expect(
      store.markPendingJoinSubmitting(attempt.runId, attempt.requestDigest),
    ).resolves.toEqual({ ...attempt, status: "submitting" });
    await expect(store.reservePendingJoin(attempt)).resolves.toEqual({
      ...attempt,
      status: "submitting",
    });
    await expect(
      database.getAllAsync<Record<string, unknown>>("SELECT * FROM pending_shared_joins"),
    ).resolves.toHaveLength(1);
  });

  it("rejects every changed pending request field while retaining the exact reservation", async () => {
    const { database, store } = await setup();
    const attempt = pending();
    await store.reservePendingJoin(attempt);
    const before = await durableState(database);
    const conflicts: PendingSharedJoinInput[] = [
      pending({ sessionId: "session-changed" }),
      pending({ expectedReleaseId: otherReleaseId }),
      pending({ serviceOrigin: "https://changed.example.test" }),
      pending({ joinRequestId: "join-request-changed" }),
      pending({ invitationDigest: `sha256:${"e".repeat(64)}` }),
      pending({ invitationKey: "plotpoint.shared.run-1.invitation-changed" }),
      pending({ credentialKey: "plotpoint.shared.run-1.credential-changed" }),
      pending({ requestDigest: `sha256:${"f".repeat(64)}` }),
    ];

    for (const conflict of conflicts) {
      await expect(store.reservePendingJoin(conflict)).rejects.toThrow(
        "shared-pending-join-conflict",
      );
      await expect(durableState(database)).resolves.toEqual(before);
    }
  });

  it("allows exactly one parallel pending reservation for a run before submission", async () => {
    const { database, store } = await setup();
    const contenders = [
      pending({ sessionId: "session-a", joinRequestId: "join-a" }),
      pending({ sessionId: "session-b", joinRequestId: "join-b" }),
    ];

    const outcomes = await Promise.allSettled(
      contenders.map((attempt) => store.reservePendingJoin(attempt)),
    );
    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const rows = await database.getAllAsync<{ session_id: string; status: string }>(
      "SELECT session_id,status FROM pending_shared_joins WHERE run_id=?",
      "run-1",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("preparing");
  });

  it("atomically replaces the pending row with one binding and rejects a second session for the run", async () => {
    const { database, store } = await setup();
    await advanceToSubmitting(store);
    await commit(store);

    await expect(store.pendingJoinForRun("run-1")).resolves.toBeNull();
    await expect(
      database.getAllAsync("SELECT session_id FROM shared_sessions WHERE run_id=?", "run-1"),
    ).resolves.toEqual([{ session_id: "session-1" }]);
    const before = await durableState(database);
    await expect(
      store.reservePendingJoin(
        pending({ sessionId: "session-2", joinRequestId: "join-request-2" }),
      ),
    ).rejects.toThrow("shared-run-binding-conflict");
    await expect(durableState(database)).resolves.toEqual(before);
  });

  it("guards every immutable binding column while allowing exact identity reuse", async () => {
    const { database, store } = await setup();
    await advanceToSubmitting(store);
    await commit(store);
    const before = await durableState(database);

    const mutations = [
      ["session_id", "session-changed"],
      ["run_id", "run-2"],
      ["release_id", otherReleaseId],
      ["participant_id", "participant-changed"],
      ["team_id", "team-changed"],
      ["service_origin", "https://changed.example.test"],
      ["credential_key", "plotpoint.shared.run-1.credential-changed"],
    ] as const;
    for (const [column, value] of mutations) {
      await expect(
        database.runAsync(
          `UPDATE shared_sessions SET ${column}=? WHERE session_id=?`,
          value,
          "session-1",
        ),
      ).rejects.toThrow("shared-session-binding-immutable");
      await expect(durableState(database)).resolves.toEqual(before);
    }

    await expect(
      database.runAsync(
        `UPDATE shared_sessions SET run_id=run_id,release_id=release_id,
         participant_id=participant_id,team_id=team_id,service_origin=service_origin,
         credential_key=credential_key WHERE session_id=?`,
        "session-1",
      ),
    ).resolves.toMatchObject({ changes: 1 });
    await expect(commit(store)).resolves.toBeUndefined();
    await expect(durableState(database)).resolves.toEqual(before);
  });

  it("rolls back every incompatible fresh or repeated join identity without exposing candidate state", async () => {
    const { database, store } = await setup();
    await advanceToSubmitting(store);
    const beforeFreshCommit = await durableState(database);
    await expect(
      commit(store, { response: response({ teamId: "team-changed" }) }),
    ).rejects.toThrow();
    await expect(durableState(database)).resolves.toEqual(beforeFreshCommit);

    await commit(store);
    const bound = await durableState(database);
    const incompatible = [
      { context: context({ runId: "run-2" }) },
      { context: context({ expectedReleaseId: otherReleaseId }) },
      { context: context({ sessionId: "session-changed" }) },
      { context: context({ serviceOrigin: "https://changed.example.test" }) },
      { context: context({ credentialKey: "plotpoint.shared.run-1.credential-changed" }) },
      { response: response({ releaseId: otherReleaseId }) },
      { response: response({ participantId: "participant-changed" }) },
      { response: response({ teamId: "team-changed" }) },
      { pull: pull({ releaseId: otherReleaseId }) },
      { pull: pull({ sessionId: "session-changed" }) },
      { pull: pull({ participantId: "participant-changed" }) },
      { pull: pull({ teamId: "team-changed" }) },
    ];
    for (const candidate of incompatible) {
      await expect(commit(store, candidate)).rejects.toThrow();
      await expect(durableState(database)).resolves.toEqual(bound);
    }
  });

  it("requires complete binding context on every pull and rolls back identity conflicts", async () => {
    const { database, store } = await setup();
    await advanceToSubmitting(store);
    await commit(store);
    const before = await durableState(database);
    const conflicts = [
      context({ runId: "run-2" }),
      context({ expectedReleaseId: otherReleaseId }),
      context({ sessionId: "session-changed" }),
      context({ serviceOrigin: "https://changed.example.test" }),
      context({ credentialKey: "plotpoint.shared.run-1.credential-changed" }),
    ];

    for (const conflict of conflicts) {
      await expect(store.applyPull(conflict, pull({ cursor: "candidate" }))).rejects.toThrow();
      await expect(durableState(database)).resolves.toEqual(before);
    }
  });

  it("makes revocation irreversible across exact, stale join, and stale pull retries", async () => {
    const { database, store } = await setup();
    await advanceToSubmitting(store);
    await commit(store);
    await store.markRevoked("session-1");
    const revoked = await durableState(database);

    await expect(commit(store)).rejects.toThrow("membership-reactivation-conflict");
    await expect(store.applyPull(context(), pull())).rejects.toThrow(
      "membership-reactivation-conflict",
    );
    await expect(durableState(database)).resolves.toEqual(revoked);

    const revokedPull = pull({ membershipStatus: "revoked", cursor: "cursor-revoked" });
    await expect(store.applyPull(context(), revokedPull)).resolves.toBeUndefined();
    const once = await durableState(database);
    await expect(store.applyPull(context(), revokedPull)).resolves.toBeUndefined();
    await expect(durableState(database)).resolves.toEqual(once);
  });
});
