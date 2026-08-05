# Contract: Shared Recovery State Machine

This contract fixes player-owned persistence and foreground orchestration while preserving Host API
1.1 Shared Play and Sync wire shapes.

## Durable Outbox

```ts
type SharedOutboxStatus = "queued" | "submitting" | "blocked-revoked";

interface SharedOutboxRecord {
  readonly sessionId: string;
  readonly commandId: string;
  readonly target: SharedCommandIntent["target"];
  readonly expectedStateVersion: number;
  readonly commandType: string;
  readonly payload: object;
  readonly observationIds: readonly string[];
  readonly status: SharedOutboxStatus;
  readonly enqueuedAt: string;
}
```

- `queued` is eligible at the beginning of a pass.
- `submitting` is owned by the current or interrupted pass. Before a new batch claim, interrupted
  submitting rows become queued in the same transaction.
- `blocked-revoked` is retained evidence and is never eligible.

Enqueue commits a new exact row or reads the prior exact row before returning pending. Changed reuse of
`commandId` fails. Revocation atomically changes queued/submitting rows to blocked evidence.

## Finite Batch Claim

```ts
interface SubmissionBatch {
  readonly sessionId: string;
  readonly commands: readonly SharedOutboxRecord[];
}

interface SharedSyncStore {
  beginSubmissionBatch(sessionId: string): Promise<SubmissionBatch>;
  failSubmissionBatch(sessionId: string): Promise<void>;
  applyPull(sessionId: string, pull: SyncPull): Promise<SnapshotApplication>;
  markRevoked(sessionId: string): Promise<void>;
}
```

`beginSubmissionBatch` is one exclusive SQLite transaction:

1. validate that the immutable session binding is usable and active;
2. recover interrupted `submitting` rows to `queued`;
3. select every queued row currently present in `(enqueued_at, command_id)` order;
4. mark exactly that finite set `submitting`;
5. persist `transport=connecting`, `synchronization=syncing`; and
6. return detached immutable copies.

One pass submits every returned member sequentially at most once and then performs at most one pull.
Rows enqueued after claim remain queued. The submit response is validated but does not delete the
outbox row; authoritative pull reconciliation owns terminalization. A retryable failure calls
`failSubmissionBatch`, which requeues submitting rows and records degraded status atomically.

## Keyed Single Flight

One long-lived coordinator instance owns process-local state:

```ts
interface SharedSyncScheduler {
  request(
    sessionId: string,
    trigger: "enqueue" | "foreground" | "reconnect" | "retry",
  ): Promise<void>;
}
```

For one session, only one pass may submit or apply a pull. Overlapping callers observe the promise for
the pass covering their trigger. A trigger during an active pass requests at most one following pass;
further triggers coalesce. Different sessions may run independently. Process restart loses promises
but not the durable submitting rows recovered by the next claim.

`shared.view.get` is a pure durable read and never schedules synchronization. Enqueue schedules only
after its SQLite transaction commits. After the host durably observes an offline-to-reachable network
transition, it requests the explicit `reconnect` trigger for each active session; that trigger coalesces
through the same keyed single flight and never runs from a view read. Notifications are emitted after
durable enqueue, batch status, pull, failure, or revocation changes—not after mere network attempts.

If submit or pull returns authenticated `participant-revoked`, the coordinator calls `markRevoked`
before removing the SecureStore credential. One SQLite transaction sets membership/sync status to
revoked, transport to degraded, changes all queued/submitting actions to `blocked-revoked`, and records
the redacted revocation event. It is idempotent and does not require a snapshot.

## Pending Join Recovery

```ts
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
```

SQLite enforces one pending-or-bound session per `runId`: `pending_shared_joins.run_id` is unique, and
cross-table guards prevent a pending row beside an existing shared-session binding. One exclusive
transaction compares any existing pending/bound record before reserving a new `preparing` row. Exact
pending request reuse resumes the same keys and digest; a changed session, origin, release, request ID,
or request digest fails before secret writes or network submission. Concurrent different joins race on
the same invariant, so only one can reserve the run.

After reservation, the player stores the raw invitation and participant credential in SecureStore
under the exact `invitationKey` and `credentialKey`, then changes the same row to `ready`. A request is
sent only after both stores are durable. A crash while preparing may leave a non-sendable row or unused
secrets, which startup cleanup can remove or an exact retry can complete; it cannot consume an invitation
without a recoverable request record.

Immediately before a network attempt, one SQLite transaction changes `ready` to `submitting`; response
loss leaves that evidence intact. Startup treats complete `ready` and `submitting` rows as exact-retry
candidates, never as permission to generate a new request identity.

Restart loads the pending row and both key-addressed secrets, reconstructs the same request ID, expected release,
invitation, credential, session, and origin, and retries. Changed input for the same session/request
fails against `requestDigest`. Successful immutable session/snapshot commit deletes the pending SQLite
row in the same transaction; the invitation secret is removed only afterward, while the participant
credential remains. A response-side mismatch retains the complete pending attempt for exact retry and
exposes no shared view.

## Immutable Session Binding

Fresh join commit accepts the active `runId`, its expected installed `releaseId`, canonical service
origin, complete join response, and initial pull. Before any write it requires:

- active run release = expected release = response release = snapshot release;
- route session = response scope = snapshot session;
- response participant/team = snapshot participant/team;
- existing binding, when present, has the exact same run/release/session/participant/team/origin; and
- there is no second session binding for the run.

Fresh binding insertion and pending-row deletion occur in the same transaction. Exact retry updates
only membership, transport/sync
status, cursor, confirmed time, projections, and results. Changed reuse throws a stable binding conflict
and rolls back. An idempotent SQLite trigger rejects updates to run, release, session, participant,
team, and service origin. Every later pull repeats the same checks before projection deletion.

A response-side mismatch retains the pending SQLite request plus its SecureStore invitation and
credential because the server may have committed an exact participant before response processing; the
player exposes no session view until an exact retry succeeds for the matching release.

## Compare-or-Insert Snapshot Application

Before mutation, Sync Pull validation additionally requires unique projection identities and unique
command IDs. Every projection must match the active composition's declared projection schema ID/version,
the validator's digest must equal the schema's Release Format manifest digest, and the payload must
pass that validator before persistence or component exposure. One exclusive transaction then:

1. verifies snapshot and immutable binding identities;
2. for each command result, compares an existing immutable result exactly, or reads matching outbox
   provenance and inserts a new result;
3. fails if a repeated result changes terminal, outcome, resulting version, or decision position;
4. fails if both prior result and outbox provenance are absent;
5. replaces the complete projection set;
6. removes only outbox rows matched by identical terminal results;
7. if the authenticated snapshot membership is revoked, changes every remaining queued/submitting row
   to `blocked-revoked` and selects revoked/degraded status; otherwise requeues remaining submitting rows
   and selects `recovery-required` or `current`;
8. applies membership, transport, cursor, and confirmed time consistently with that branch; and
9. commits all changes together.

Applying one normal, corrective, or revoked pull repeatedly produces byte-equivalent durable
projections, results, outbox state, cursor, membership, and status. A conflicting repeat exposes none
of its candidate changes. After a revoked pull commits, the coordinator removes the SecureStore
credential; it never removes it before the blocked-outbox transaction succeeds.

## Bridge Correlation

Shared bridge parsing has two stages:

1. Decode JSON and capture `requestId` only when it is a valid non-empty canonical string.
2. Validate envelope type/version/direction and operation payload.

Semantic failure returns `host.error` with the captured ID. Only invalid JSON or invalid/missing ID uses
`unknown`. The App never fabricates an error before routing; a missing session is a handler error so the
router preserves request correlation.

## Clean Break and Deferrals

Fresh/provider-free databases install pending-join storage and immutable-binding guards and recover
only rows written by this corrected state machine. Database open does not inspect, rewrite, or
migrate superseded shapes. An incompatible schema fails with explicit reset/reinstall guidance and is
never silently dropped. Within the corrected schema, interrupted `submitting` rows and complete pending
join attempts remain fully recoverable. Multiple bindings, run/release mismatch, or changed service
origin becomes explicit recovery-required/conflict and no projection is exposed.

intentionally does not add background sync, WebSockets, delta feeds, multi-process leases, service
rebinding, credential rotation/recovery, active-session release migration, multi-device membership, or
terminal-report provenance reconstruction after loss of both local evidence sources.
