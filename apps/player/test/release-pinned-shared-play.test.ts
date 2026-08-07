import type { SyncPull } from "@plotpoint/protocol";
import { afterEach, describe, expect, it } from "vitest";

import {
  migrateSharedDatabase,
  SharedSyncStore,
  type SharedSessionRecord,
} from "../src/shared/database";
import { TestSharedSqliteDatabase, type SharedDatabaseState } from "./helpers/shared-sqlite";

const releaseA = `sha256:${"a".repeat(64)}` as const;
const releaseB = `sha256:${"b".repeat(64)}` as const;
const serviceOrigin = "https://service.example";

interface PendingJoinRecord {
  readonly runId: string;
  readonly expectedReleaseId: `sha256:${string}`;
  readonly sessionId: string;
  readonly serviceOrigin: string;
  readonly joinRequestId: string;
  readonly requestDigest: string;
  readonly invitationDigest: string;
  readonly envelopeKey: string;
  readonly status: "preparing" | "ready" | "submitting";
}

interface ReleasePinnedBindingContext {
  readonly sessionId: string;
  readonly runId: string;
  readonly expectedReleaseId: `sha256:${string}`;
  readonly serviceOrigin: string;
  readonly envelopeKey: string;
}

interface SharedJoinResponse {
  readonly participantId: string;
  readonly teamId: string;
  readonly releaseId: `sha256:${string}`;
  readonly disposition: "joined" | "duplicate";
  readonly sync: SyncPull;
}

interface ReleasePinnedSharedStore {
  reservePendingJoin(input: Omit<PendingJoinRecord, "status">): Promise<PendingJoinRecord>;
  markPendingJoinReady(runId: string, requestDigest: string): Promise<PendingJoinRecord>;
  markPendingJoinSubmitting(runId: string, requestDigest: string): Promise<PendingJoinRecord>;
  pendingJoinForRun(runId: string): Promise<PendingJoinRecord | null>;
  commitJoinedSession(input: {
    readonly context: ReleasePinnedBindingContext;
    readonly response: Omit<SharedJoinResponse, "disposition" | "sync">;
    readonly pull: SyncPull;
  }): Promise<void>;
  applyPull(context: ReleasePinnedBindingContext, pull: SyncPull): Promise<void>;
  session(sessionId: string): Promise<SharedSessionRecord | null>;
  view(sessionId: string): Promise<unknown>;
}

interface JoinFixture {
  readonly database: TestSharedSqliteDatabase;
  readonly store: ReleasePinnedSharedStore;
  readonly context: ReleasePinnedBindingContext;
  readonly response: SharedJoinResponse;
}

const databases: TestSharedSqliteDatabase[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function pull(
  overrides: {
    readonly sessionId?: string;
    readonly releaseId?: `sha256:${string}`;
    readonly participantId?: string;
    readonly teamId?: string;
    readonly membershipStatus?: "active" | "revoked";
    readonly cursor?: string;
    readonly stateVersion?: number;
  } = {},
): SyncPull {
  return {
    kind: "snapshot",
    reset: true,
    nextCursor: overrides.cursor ?? "cursor-1",
    snapshot: {
      sessionId: overrides.sessionId ?? "session-a",
      releaseId: overrides.releaseId ?? releaseA,
      participantId: overrides.participantId ?? "participant-a",
      teamId: overrides.teamId ?? "team-a",
      membershipStatus: overrides.membershipStatus ?? "active",
      confirmedAt: "2030-01-01T00:00:00.000Z",
      projections: [
        {
          aggregateKind: "team",
          aggregateId: overrides.teamId ?? "team-a",
          schemaId: "example.shared-state",
          stateVersion: overrides.stateVersion ?? 1,
          value: { completed: overrides.stateVersion ?? 1 },
        },
      ],
    },
    commandResults: [],
  };
}

function response(overrides: Partial<SharedJoinResponse> = {}): SharedJoinResponse {
  return {
    participantId: "participant-a",
    teamId: "team-a",
    releaseId: releaseA,
    disposition: "joined",
    sync: pull(),
    ...overrides,
  };
}

async function createDatabase(): Promise<TestSharedSqliteDatabase> {
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
    "INSERT INTO runs(run_id,release_id,started_at,status) VALUES (?,?,?,'active')",
    "run-a",
    releaseA,
    "2030-01-01T00:00:00.000Z",
  );
  await migrateSharedDatabase(database);
  return database;
}

function pending(
  overrides: Partial<Omit<PendingJoinRecord, "status">> = {},
): Omit<PendingJoinRecord, "status"> {
  return {
    runId: "run-a",
    expectedReleaseId: releaseA,
    sessionId: "session-a",
    serviceOrigin,
    joinRequestId: "join-request-a",
    requestDigest: `sha256:${"c".repeat(64)}`,
    invitationDigest: `sha256:${"d".repeat(64)}`,
    envelopeKey: "plotpoint.shared.session-a.envelope",
    ...overrides,
  };
}

function bindingContext(
  overrides: Partial<ReleasePinnedBindingContext> = {},
): ReleasePinnedBindingContext {
  return {
    sessionId: "session-a",
    runId: "run-a",
    expectedReleaseId: releaseA,
    serviceOrigin,
    envelopeKey: "plotpoint.shared.session-a.envelope",
    ...overrides,
  };
}

async function setupJoin(): Promise<JoinFixture> {
  const database = await createDatabase();
  const actual = new SharedSyncStore(database, {
    aggregateKind: "team",
    schemaId: "example.shared-state",
    validate: () => true,
  });
  const store: ReleasePinnedSharedStore = {
    reservePendingJoin: (input) => actual.reservePendingJoin(input),
    markPendingJoinReady: (runId, requestDigest) =>
      actual.markPendingJoinReady(runId, requestDigest),
    markPendingJoinSubmitting: (runId, requestDigest) =>
      actual.markPendingJoinSubmitting(runId, requestDigest),
    pendingJoinForRun: (runId) => actual.pendingJoinForRun(runId),
    commitJoinedSession: ({ context, response: identity, pull: candidate }) =>
      actual.commitJoinedSession({
        binding: {
          sessionId: context.sessionId,
          runId: context.runId,
          releaseId:
            context.expectedReleaseId === releaseA ? identity.releaseId : context.expectedReleaseId,
          participantId: identity.participantId,
          teamId: identity.teamId,
          serviceOrigin: context.serviceOrigin,
          envelopeKey: context.envelopeKey,
        },
        pull: candidate,
      }),
    applyPull: (context, candidate) =>
      actual.applyPull(
        {
          sessionId: context.sessionId,
          runId: context.runId,
          releaseId: context.expectedReleaseId,
          participantId: context.sessionId === "session-b" ? "participant-b" : "participant-a",
          teamId: context.sessionId === "session-b" ? "team-b" : "team-a",
          serviceOrigin: context.serviceOrigin,
          envelopeKey: context.envelopeKey,
        },
        candidate,
      ),
    session: (sessionId) => actual.session(sessionId),
    view: (sessionId) => actual.view(sessionId),
  };
  const candidate = pending();
  await store.reservePendingJoin(candidate);
  await store.markPendingJoinReady("run-a", candidate.requestDigest);
  await store.markPendingJoinSubmitting("run-a", candidate.requestDigest);
  return {
    database,
    store,
    context: bindingContext(),
    response: response(),
  };
}

async function assertNoExposedJoin(fixture: JoinFixture): Promise<void> {
  await expect(fixture.store.pendingJoinForRun("run-a")).resolves.toMatchObject({
    runId: "run-a",
    status: "submitting",
  });
  await expect(fixture.store.session("session-a")).resolves.toBeNull();
  await expect(fixture.store.view("session-a")).rejects.toThrow("shared-session-missing");
  await expect(fixture.database.sharedState("session-a")).resolves.toEqual({
    sessions: [],
    outbox: [],
    projections: [],
    results: [],
    gameplayEvents: [],
  } satisfies SharedDatabaseState);
}

const joinMismatchCases: readonly {
  readonly name: string;
  readonly mutate: (fixture: JoinFixture) => Promise<void> | void;
}[] = [
  {
    name: "active run",
    mutate: async (fixture) => {
      await fixture.database.runAsync(
        "INSERT INTO runs(run_id,release_id,started_at,status) VALUES (?,?,?,'active')",
        "run-b",
        releaseA,
        "2030-01-01T00:00:01.000Z",
      );
      Object.assign(fixture, { context: bindingContext({ runId: "run-b" }) });
    },
  },
  {
    name: "active run release",
    mutate: async ({ database }) => {
      await database.runAsync("UPDATE runs SET release_id=? WHERE run_id=?", releaseB, "run-a");
    },
  },
  {
    name: "expected release",
    mutate: (fixture) => {
      Object.assign(fixture, { context: bindingContext({ expectedReleaseId: releaseB }) });
    },
  },
  {
    name: "response release",
    mutate: (fixture) => {
      Object.assign(fixture, { response: response({ releaseId: releaseB }) });
    },
  },
  {
    name: "snapshot release",
    mutate: (fixture) => {
      Object.assign(fixture, { response: response({ sync: pull({ releaseId: releaseB }) }) });
    },
  },
  {
    name: "session",
    mutate: (fixture) => {
      Object.assign(fixture, { response: response({ sync: pull({ sessionId: "session-b" }) }) });
    },
  },
  {
    name: "participant",
    mutate: (fixture) => {
      Object.assign(fixture, {
        response: response({ sync: pull({ participantId: "participant-b" }) }),
      });
    },
  },
  {
    name: "team",
    mutate: (fixture) => {
      Object.assign(fixture, { response: response({ sync: pull({ teamId: "team-b" }) }) });
    },
  },
  {
    name: "service origin",
    mutate: (fixture) => {
      Object.assign(fixture, {
        context: bindingContext({ serviceOrigin: "https://other.example" }),
      });
    },
  },
  {
    name: "envelope key",
    mutate: (fixture) => {
      Object.assign(fixture, {
        context: bindingContext({ envelopeKey: "plotpoint.shared.other.envelope" }),
      });
    },
  },
];

describe("release-pinned shared play", () => {
  it.each(joinMismatchCases)(
    "retains the complete pending join and exposes no view on $name mismatch",
    async ({ mutate }) => {
      const fixture = await setupJoin();
      await mutate(fixture);

      await expect(
        fixture.store.commitJoinedSession({
          context: fixture.context,
          response: {
            participantId: fixture.response.participantId,
            teamId: fixture.response.teamId,
            releaseId: fixture.response.releaseId,
          },
          pull: fixture.response.sync,
        }),
      ).rejects.toThrow();
      await assertNoExposedJoin(fixture);
    },
  );

  const pullMismatchCases: readonly {
    readonly name: string;
    readonly mutate: (fixture: JoinFixture) => Promise<{
      readonly sessionId: string;
      readonly pull: SyncPull;
      readonly context: ReleasePinnedBindingContext;
    }>;
  }[] = [
    {
      name: "run",
      mutate: async () => ({
        sessionId: "session-a",
        pull: pull({ cursor: "cursor-2", stateVersion: 2 }),
        context: bindingContext({ runId: "run-b" }),
      }),
    },
    {
      name: "active run release",
      mutate: async (fixture) => {
        await fixture.database.runAsync(
          "UPDATE runs SET release_id=? WHERE run_id=?",
          releaseB,
          "run-a",
        );
        return {
          sessionId: "session-a",
          pull: pull({ cursor: "cursor-2", stateVersion: 2 }),
          context: bindingContext(),
        };
      },
    },
    {
      name: "expected release",
      mutate: async () => ({
        sessionId: "session-a",
        pull: pull({ cursor: "cursor-2", stateVersion: 2 }),
        context: bindingContext({ expectedReleaseId: releaseB }),
      }),
    },
    {
      name: "snapshot release",
      mutate: async () => ({
        sessionId: "session-a",
        pull: pull({ releaseId: releaseB, cursor: "cursor-2", stateVersion: 2 }),
        context: bindingContext(),
      }),
    },
    {
      name: "session",
      mutate: async () => ({
        sessionId: "session-b",
        pull: pull({ sessionId: "session-b", cursor: "cursor-2", stateVersion: 2 }),
        context: bindingContext(),
      }),
    },
    {
      name: "participant",
      mutate: async () => ({
        sessionId: "session-a",
        pull: pull({ participantId: "participant-b", cursor: "cursor-2", stateVersion: 2 }),
        context: bindingContext(),
      }),
    },
    {
      name: "team",
      mutate: async () => ({
        sessionId: "session-a",
        pull: pull({ teamId: "team-b", cursor: "cursor-2", stateVersion: 2 }),
        context: bindingContext(),
      }),
    },
    {
      name: "service origin",
      mutate: async () => ({
        sessionId: "session-a",
        pull: pull({ cursor: "cursor-2", stateVersion: 2 }),
        context: bindingContext({ serviceOrigin: "https://other.example" }),
      }),
    },
    {
      name: "envelope key",
      mutate: async () => ({
        sessionId: "session-a",
        pull: pull({ cursor: "cursor-2", stateVersion: 2 }),
        context: bindingContext({ envelopeKey: "plotpoint.shared.other.envelope" }),
      }),
    },
  ];

  it.each(pullMismatchCases)(
    "rolls back the complete pull on $name mismatch",
    async ({ mutate }) => {
      const fixture = await setupJoin();
      await fixture.store.commitJoinedSession({
        context: fixture.context,
        response: {
          participantId: fixture.response.participantId,
          teamId: fixture.response.teamId,
          releaseId: fixture.response.releaseId,
        },
        pull: fixture.response.sync,
      });
      const before = await fixture.database.sharedState("session-a");
      const candidate = await mutate(fixture);

      await expect(
        fixture.store.applyPull(
          { ...candidate.context, sessionId: candidate.sessionId },
          candidate.pull,
        ),
      ).rejects.toThrow();
      await expect(fixture.database.sharedState("session-a")).resolves.toEqual(before);
    },
  );

  it("preserves revoked membership and blocked actions when a stale active join or pull arrives", async () => {
    const fixture = await setupJoin();
    await fixture.store.commitJoinedSession({
      context: fixture.context,
      response: {
        participantId: fixture.response.participantId,
        teamId: fixture.response.teamId,
        releaseId: fixture.response.releaseId,
      },
      pull: fixture.response.sync,
    });
    await fixture.store.applyPull(
      fixture.context,
      pull({ membershipStatus: "revoked", cursor: "cursor-revoked" }),
    );
    const revoked = await fixture.database.sharedState("session-a");

    await expect(
      fixture.store.commitJoinedSession({
        context: fixture.context,
        response: {
          participantId: fixture.response.participantId,
          teamId: fixture.response.teamId,
          releaseId: fixture.response.releaseId,
        },
        pull: fixture.response.sync,
      }),
    ).rejects.toThrow("membership-reactivation-conflict");
    await expect(
      fixture.store.applyPull(
        fixture.context,
        pull({ membershipStatus: "active", cursor: "cursor-stale" }),
      ),
    ).rejects.toThrow("membership-reactivation-conflict");
    await expect(fixture.database.sharedState("session-a")).resolves.toEqual(revoked);
  });

  it("keeps a revised release on a fresh run and fresh session without migrating the old binding", async () => {
    const fixture = await setupJoin();
    await fixture.store.commitJoinedSession({
      context: fixture.context,
      response: {
        participantId: fixture.response.participantId,
        teamId: fixture.response.teamId,
        releaseId: fixture.response.releaseId,
      },
      pull: fixture.response.sync,
    });
    const oldBinding = await fixture.store.session("session-a");

    await fixture.database.runAsync(
      "INSERT INTO runs(run_id,release_id,started_at,status) VALUES (?,?,?,'active')",
      "run-b",
      releaseB,
      "2030-01-01T00:00:01.000Z",
    );
    const secondPending = pending({
      runId: "run-b",
      expectedReleaseId: releaseB,
      sessionId: "session-b",
      joinRequestId: "join-request-b",
      requestDigest: `sha256:${"e".repeat(64)}`,
      invitationDigest: `sha256:${"f".repeat(64)}`,
      envelopeKey: "plotpoint.shared.session-b.envelope",
    });
    await fixture.store.reservePendingJoin(secondPending);
    await fixture.store.markPendingJoinReady("run-b", secondPending.requestDigest);
    await fixture.store.markPendingJoinSubmitting("run-b", secondPending.requestDigest);
    const secondContext = bindingContext({
      sessionId: "session-b",
      runId: "run-b",
      expectedReleaseId: releaseB,
      envelopeKey: secondPending.envelopeKey,
    });
    await fixture.store.commitJoinedSession({
      context: secondContext,
      response: {
        participantId: "participant-b",
        teamId: "team-b",
        releaseId: releaseB,
      },
      pull: pull({
        sessionId: "session-b",
        releaseId: releaseB,
        participantId: "participant-b",
        teamId: "team-b",
      }),
    });

    await expect(fixture.store.session("session-a")).resolves.toEqual(oldBinding);
    await expect(fixture.store.session("session-b")).resolves.toMatchObject({
      runId: "run-b",
      releaseId: releaseB,
      sessionId: "session-b",
    });
    await expect(fixture.store.pendingJoinForRun("run-a")).resolves.toBeNull();
    await expect(fixture.store.pendingJoinForRun("run-b")).resolves.toBeNull();
  });
});
