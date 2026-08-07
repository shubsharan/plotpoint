import type {
  SharedCommandIntent,
  SharedTerminal,
  SyncCommandResult,
  SyncPull,
} from "@plotpoint/protocol";
import { afterEach, describe, expect, it } from "vitest";

import { SharedSyncStore, type SharedSessionBinding } from "../src/shared/database";
import {
  createSharedTestDatabase,
  TEST_SQLITE_INTERRUPTED_AFTER_WRITE,
  TEST_SQLITE_INTERRUPTED_BEFORE_COMMIT,
  type TestSharedSqliteDatabase,
} from "./helpers/shared-sqlite";

const releaseId = `sha256:${"a".repeat(64)}` as const;
const sessionId = "session-1";
const bindingContext: SharedSessionBinding = {
  sessionId,
  runId: "run-1",
  releaseId,
  participantId: "participant-1",
  teamId: "team-1",
  serviceOrigin: "https://example.test",
  envelopeKey: "plotpoint.shared.session-1.envelope",
};
const projectionRule = {
  aggregateKind: "team" as const,
  schemaId: "example.counter",
  validate: () => true,
};

interface SubmissionBatchRecord {
  readonly sessionId: string;
  readonly commandId: string;
  readonly target: SharedCommandIntent["target"];
  readonly expectedStateVersion: number;
  readonly commandType: string;
  readonly payload: SharedCommandIntent["payload"];
  readonly observationIds: readonly string[];
  readonly status: "submitting";
  readonly enqueuedAt: string;
}

interface Phase6SubmissionStore {
  beginSubmissionBatch(session: string): Promise<{
    readonly sessionId: string;
    readonly commands: readonly SubmissionBatchRecord[];
  }>;
  failSubmissionBatch(session: string): Promise<void>;
}

const databases: TestSharedSqliteDatabase[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function command(commandId: string, expectedStateVersion = 0, amount = 1): SharedCommandIntent {
  return {
    commandId,
    target: {
      aggregateKind: "team",
      aggregateId: "team-1",
      schemaId: "example.counter",
    },
    expectedStateVersion,
    type: "example.increment",
    payload: { amount },
    observationIds: [],
  };
}

function pull(
  input: {
    readonly cursor?: string;
    readonly confirmedAt?: string;
    readonly count?: number;
    readonly results?: readonly SyncCommandResult[];
    readonly duplicateProjection?: boolean;
  } = {},
): SyncPull {
  const projection = {
    aggregateKind: "team" as const,
    aggregateId: "team-1",
    schemaId: "example.counter",
    stateVersion: input.count ?? 1,
    value: { count: input.count ?? 1 },
  };
  return {
    kind: "snapshot",
    reset: false,
    nextCursor: input.cursor ?? "cursor-1",
    snapshot: {
      sessionId,
      releaseId,
      participantId: "participant-1",
      teamId: "team-1",
      membershipStatus: "active",
      confirmedAt: input.confirmedAt ?? "2030-01-01T00:00:01.000Z",
      projections: input.duplicateProjection ? [projection, { ...projection }] : [projection],
    },
    commandResults: input.results ?? [],
  };
}

function result(
  commandId: string,
  terminal: SharedTerminal,
  resultingStateVersion: number,
  decisionPosition: string,
  capabilityEvidence?: SyncCommandResult["capabilityEvidence"],
): SyncCommandResult {
  return {
    commandId,
    disposition: "decided",
    terminal,
    outcomeCode: `${terminal}-outcome`,
    resultingStateVersion,
    decisionPosition,
    ...(capabilityEvidence === undefined ? {} : { capabilityEvidence }),
  };
}

async function setup(): Promise<{
  readonly database: TestSharedSqliteDatabase;
  readonly store: SharedSyncStore & Phase6SubmissionStore;
}> {
  const database = await createSharedTestDatabase();
  databases.push(database);
  await database.runAsync(
    `INSERT INTO shared_sessions
     (session_id,run_id,release_id,participant_id,team_id,service_origin,envelope_key,membership_status,
      transport_status,sync_status,cursor,confirmed_at)
     VALUES (?,?,?,?,?,?,?,'active','offline','current','0',?)`,
    sessionId,
    "run-1",
    releaseId,
    "participant-1",
    "team-1",
    "https://example.test",
    bindingContext.envelopeKey,
    "2030-01-01T00:00:00.000Z",
  );
  const store = new SharedSyncStore(database, projectionRule) as SharedSyncStore &
    Phase6SubmissionStore;
  return { database, store };
}

async function enqueue(
  store: SharedSyncStore,
  value: SharedCommandIntent,
  enqueuedAt: string,
): Promise<void> {
  await expect(store.enqueue(sessionId, value, enqueuedAt)).resolves.toMatchObject({
    commandId: value.commandId,
    disposition: "queued",
    terminal: "pending",
  });
}

describe("shared SQLite recovery", () => {
  it("claims the finite queued set plus interrupted submissions in one atomic transaction", async () => {
    const { database, store } = await setup();
    await enqueue(store, command("command-b"), "2030-01-01T00:00:01.000Z");
    await enqueue(store, command("command-a"), "2030-01-01T00:00:01.000Z");
    await enqueue(store, command("command-interrupted"), "2030-01-01T00:00:00.000Z");
    await enqueue(store, command("command-blocked"), "2029-12-31T23:59:59.000Z");
    await database.runAsync(
      "UPDATE shared_outbox SET status='submitting' WHERE session_id=? AND command_id=?",
      sessionId,
      "command-interrupted",
    );
    await database.runAsync(
      "UPDATE shared_outbox SET status='blocked-revoked' WHERE session_id=? AND command_id=?",
      sessionId,
      "command-blocked",
    );

    const before = await database.sharedState(sessionId);
    database.interruptNextTransactionBeforeCommit();
    await expect(store.beginSubmissionBatch(sessionId)).rejects.toThrow(
      TEST_SQLITE_INTERRUPTED_BEFORE_COMMIT,
    );
    await expect(database.sharedState(sessionId)).resolves.toEqual(before);

    const batch = await store.beginSubmissionBatch(sessionId);
    expect(batch.sessionId).toBe(sessionId);
    expect(batch.commands.map(({ commandId }) => commandId)).toEqual([
      "command-interrupted",
      "command-a",
      "command-b",
    ]);
    expect(batch.commands.every(({ status }) => status === "submitting")).toBe(true);
    await expect(
      database.getAllAsync<{ command_id: string; status: string }>(
        "SELECT command_id,status FROM shared_outbox WHERE session_id=? ORDER BY command_id",
        sessionId,
      ),
    ).resolves.toEqual([
      { command_id: "command-a", status: "submitting" },
      { command_id: "command-b", status: "submitting" },
      { command_id: "command-blocked", status: "blocked-revoked" },
      { command_id: "command-interrupted", status: "submitting" },
    ]);
    await expect(
      database.getFirstAsync<{ transport_status: string; sync_status: string }>(
        "SELECT transport_status,sync_status FROM shared_sessions WHERE session_id=?",
        sessionId,
      ),
    ).resolves.toEqual({ transport_status: "connecting", sync_status: "syncing" });
  });

  it("uses stable ordering, returns detached records, and defers rows enqueued after claim", async () => {
    const { database, store } = await setup();
    await enqueue(store, command("command-c"), "2030-01-01T00:00:02.000Z");
    await enqueue(store, command("command-b"), "2030-01-01T00:00:01.000Z");
    await enqueue(store, command("command-a"), "2030-01-01T00:00:01.000Z");

    const batch = await store.beginSubmissionBatch(sessionId);
    expect(batch.commands.map(({ commandId }) => commandId)).toEqual([
      "command-a",
      "command-b",
      "command-c",
    ]);
    const returnedPayload = batch.commands[0]!.payload as { amount: number };
    try {
      returnedPayload.amount = 99;
    } catch {
      // Runtime freezing is also a valid way to provide an immutable detached batch.
    }

    await enqueue(store, command("command-later"), "2030-01-01T00:00:03.000Z");
    await expect(
      database.getAllAsync<{ command_id: string; payload_json: string; status: string }>(
        `SELECT command_id,payload_json,status FROM shared_outbox
         WHERE session_id=? ORDER BY enqueued_at,command_id`,
        sessionId,
      ),
    ).resolves.toEqual([
      { command_id: "command-a", payload_json: '{"amount":1}', status: "submitting" },
      { command_id: "command-b", payload_json: '{"amount":1}', status: "submitting" },
      { command_id: "command-c", payload_json: '{"amount":1}', status: "submitting" },
      { command_id: "command-later", payload_json: '{"amount":1}', status: "queued" },
    ]);
  });

  it("requeues only claimed rows and records degraded recovery status atomically", async () => {
    const { database, store } = await setup();
    await enqueue(store, command("command-claimed"), "2030-01-01T00:00:01.000Z");
    await enqueue(store, command("command-blocked"), "2030-01-01T00:00:02.000Z");
    await database.runAsync(
      "UPDATE shared_outbox SET status='blocked-revoked' WHERE session_id=? AND command_id=?",
      sessionId,
      "command-blocked",
    );
    await store.beginSubmissionBatch(sessionId);

    const beforeFailure = await database.sharedState(sessionId);
    database.interruptNextTransactionBeforeCommit();
    await expect(store.failSubmissionBatch(sessionId)).rejects.toThrow(
      TEST_SQLITE_INTERRUPTED_BEFORE_COMMIT,
    );
    await expect(database.sharedState(sessionId)).resolves.toEqual(beforeFailure);

    await store.failSubmissionBatch(sessionId);
    await expect(
      database.getAllAsync<{ command_id: string; status: string }>(
        "SELECT command_id,status FROM shared_outbox WHERE session_id=? ORDER BY command_id",
        sessionId,
      ),
    ).resolves.toEqual([
      { command_id: "command-blocked", status: "blocked-revoked" },
      { command_id: "command-claimed", status: "queued" },
    ]);
    await expect(
      database.getFirstAsync<{ transport_status: string; sync_status: string }>(
        "SELECT transport_status,sync_status FROM shared_sessions WHERE session_id=?",
        sessionId,
      ),
    ).resolves.toEqual({ transport_status: "degraded", sync_status: "recovery-required" });
  });

  it("compare-or-inserts every exact terminal and makes an exact replay byte-equivalent", async () => {
    const { database, store } = await setup();
    const cases = [
      { command: command("accepted", 0), result: result("accepted", "accepted", 1, "1") },
      { command: command("no-op", 2), result: result("no-op", "no-op", 2, "2") },
      { command: command("rejected", 3), result: result("rejected", "rejected", 3, "3") },
      { command: command("invalid", 4), result: result("invalid", "invalid", 4, "4") },
    ];
    for (const item of cases) {
      await enqueue(store, item.command, "2030-01-01T00:00:01.000Z");
    }
    const authoritativePull = pull({ results: cases.map(({ result: value }) => value) });

    await store.applyPull(bindingContext, authoritativePull);
    const once = await database.sharedState(sessionId);
    expect(
      once.results.map(({ result_json }) => JSON.parse(result_json as string).terminal),
    ).toEqual(["accepted", "invalid", "no-op", "rejected"]);
    expect(once.outbox).toEqual([]);

    await expect(store.applyPull(bindingContext, authoritativePull)).resolves.toBeUndefined();
    await expect(database.sharedState(sessionId)).resolves.toEqual(once);
  });

  it("rejects a changed repeated terminal even if stale outbox provenance remains", async () => {
    const { database, store } = await setup();
    const originalCommand = command("command-1");
    const originalPull = pull({ results: [result("command-1", "accepted", 1, "1")] });
    await enqueue(store, originalCommand, "2030-01-01T00:00:01.000Z");
    await store.applyPull(bindingContext, originalPull);
    await database.runAsync(
      `INSERT INTO shared_outbox
       (session_id,command_id,intent_json,target_json,expected_state_version,command_type,payload_json,
        observation_ids_json,status,enqueued_at) VALUES (?,?,?,?,?,?,?,?,'submitting',?)`,
      sessionId,
      originalCommand.commandId,
      JSON.stringify(originalCommand),
      JSON.stringify(originalCommand.target),
      originalCommand.expectedStateVersion,
      originalCommand.type,
      JSON.stringify(originalCommand.payload),
      JSON.stringify(originalCommand.observationIds),
      "2030-01-01T00:00:01.000Z",
    );
    const before = await database.sharedState(sessionId);
    const conflictingPull = pull({
      cursor: "cursor-conflict",
      count: 99,
      results: [result("command-1", "rejected", 0, "99")],
    });

    await expect(store.applyPull(bindingContext, conflictingPull)).rejects.toThrow();
    await expect(database.sharedState(sessionId)).resolves.toEqual(before);
  });

  it("treats capability evidence as part of the complete result identity", async () => {
    const { database, store } = await setup();
    const originalCommand = command("command-evidence");
    const original = result("command-evidence", "accepted", 1, "1", [
      {
        observationId: "observation-1",
        capabilityId: "plotpoint.location.foreground",
        disposition: "consumed",
      },
    ]);
    await enqueue(store, originalCommand, "2030-01-01T00:00:01.000Z");
    await store.applyPull(bindingContext, pull({ results: [original] }));
    const before = await database.sharedState(sessionId);
    const changedEvidence = {
      ...original,
      capabilityEvidence: [
        { ...original.capabilityEvidence![0]!, disposition: "expired" as const },
      ],
    };

    await expect(
      store.applyPull(bindingContext, pull({ cursor: "cursor-2", results: [changedEvidence] })),
    ).rejects.toThrow("shared-result-identity-conflict");
    await expect(database.sharedState(sessionId)).resolves.toEqual(before);
  });

  it("restores synchronization status for an exact successful pull without replay evidence", async () => {
    const { database, store } = await setup();
    const exact = pull();
    await store.applyPull(bindingContext, exact);
    const applied = await database.sharedState(sessionId);

    await store.beginSubmissionBatch(sessionId);
    await store.applyPull(bindingContext, exact);

    const restored = await database.sharedState(sessionId);
    expect(restored.sessions).toEqual([
      expect.objectContaining({ transport_status: "online", sync_status: "current" }),
    ]);
    expect(restored.gameplayEvents).toEqual(applied.gameplayEvents);
  });

  it("orders opaque decimal decision positions numerically", async () => {
    const { store } = await setup();
    await enqueue(store, command("command-two"), "2030-01-01T00:00:01.000Z");
    await enqueue(store, command("command-ten"), "2030-01-01T00:00:02.000Z");
    await store.applyPull(
      bindingContext,
      pull({
        results: [
          result("command-ten", "accepted", 2, "10"),
          result("command-two", "accepted", 1, "2"),
        ],
      }),
    );

    const view = await store.view(sessionId);
    expect(view.actions.map(({ commandId }) => commandId)).toEqual(["command-two", "command-ten"]);
  });

  it("keeps shared evidence chronology bounded when host time moves backward", async () => {
    const database = await createSharedTestDatabase();
    databases.push(database);
    await database.runAsync(
      `INSERT INTO shared_sessions
       (session_id,run_id,release_id,participant_id,team_id,service_origin,envelope_key,membership_status,
        transport_status,sync_status,cursor,confirmed_at)
       VALUES (?,?,?,?,?,?,?,'active','offline','current','0',?)`,
      sessionId,
      "run-1",
      releaseId,
      "participant-1",
      "team-1",
      "https://example.test",
      bindingContext.envelopeKey,
      "2030-01-01T00:00:00.000Z",
    );
    const hostTimes = [new Date("2030-01-01T00:00:05.000Z"), new Date("2030-01-01T00:00:03.000Z")];
    const store = new SharedSyncStore(database, projectionRule, () => hostTimes.shift()!);
    await store.applyPull(
      bindingContext,
      pull({ cursor: "future", confirmedAt: "2099-01-01T00:00:00.000Z" }),
    );
    await store.applyPull(
      bindingContext,
      pull({ cursor: "past", confirmedAt: "1900-01-01T00:00:00.000Z" }),
    );

    await expect(
      database.getAllAsync<{ committed_at: string; elapsed_ms: number }>(
        "SELECT committed_at,elapsed_ms FROM game_play_events WHERE run_id=? ORDER BY sequence",
        "run-1",
      ),
    ).resolves.toEqual([
      { committed_at: "2030-01-01T00:00:05.000Z", elapsed_ms: 5000 },
      { committed_at: "2030-01-01T00:00:05.000Z", elapsed_ms: 5000 },
    ]);
  });

  it("rejects duplicate projection identities before starting a transaction", async () => {
    const { database, store } = await setup();
    const before = await database.sharedState(sessionId);
    const transactionStarts = database.transactionStarts;

    await expect(
      store.applyPull(bindingContext, pull({ duplicateProjection: true })),
    ).rejects.toThrow();
    expect(database.transactionStarts).toBe(transactionStarts);
    await expect(database.sharedState(sessionId)).resolves.toEqual(before);
  });

  it("rejects duplicate command results before starting a transaction", async () => {
    const { database, store } = await setup();
    await enqueue(store, command("command-1"), "2030-01-01T00:00:01.000Z");
    const duplicate = result("command-1", "accepted", 1, "1");
    const before = await database.sharedState(sessionId);
    const transactionStarts = database.transactionStarts;

    await expect(
      store.applyPull(bindingContext, pull({ results: [duplicate, duplicate] })),
    ).rejects.toThrow();
    expect(database.transactionStarts).toBe(transactionStarts);
    await expect(database.sharedState(sessionId)).resolves.toEqual(before);
  });

  it("rolls back complete snapshot replacement after mid-write and pre-commit interruption", async () => {
    const { database, store } = await setup();
    await database.runAsync(
      `INSERT INTO shared_projections
       (session_id,aggregate_kind,aggregate_id,schema_id,state_version,value_json)
       VALUES (?,'team','team-1','example.counter',0,'{"count":0}')`,
      sessionId,
    );
    await enqueue(store, command("command-1"), "2030-01-01T00:00:01.000Z");
    const replacement = pull({
      cursor: "cursor-2",
      count: 2,
      results: [result("command-1", "accepted", 1, "1")],
    });
    const before = await database.sharedState(sessionId);

    database.interruptNextTransactionAfterWrite(3);
    await expect(store.applyPull(bindingContext, replacement)).rejects.toThrow(
      TEST_SQLITE_INTERRUPTED_AFTER_WRITE,
    );
    await expect(database.sharedState(sessionId)).resolves.toEqual(before);

    database.interruptNextTransactionBeforeCommit();
    await expect(store.applyPull(bindingContext, replacement)).rejects.toThrow(
      TEST_SQLITE_INTERRUPTED_BEFORE_COMMIT,
    );
    await expect(database.sharedState(sessionId)).resolves.toEqual(before);

    await expect(store.applyPull(bindingContext, replacement)).resolves.toBeUndefined();
    expect((await database.sharedState(sessionId)).sessions).toEqual([
      expect.objectContaining({ cursor: "cursor-2", sync_status: "current" }),
    ]);
  });
});
