# Contract: Shared Recovery State Machine

One run-scoped controller created from a verified installed run owns startup, join, enqueue, foreground,
connectivity, retry, snapshot publication, and disposal. SQLite owns durable recovery state; SecureStore
owns the single secret envelope; the controller is the sole authority for shared presentation.

## Controller and Presentation

The controller publishes exactly `local-only`, `join-required`, `joining`, `synchronizing`, `bound`,
`revoked`, or `recovery-required`. A recovery-required state always declares whether retry is possible
and never exposes a cached shared projection. The native shell mounts shared-capable runtime HTML only
for a current `bound` state.

`start()` cleans or resumes secret preparation, continues a complete pending join, schedules one pass
for an active binding, and resolves operational transport or synchronization failure into retryable
recovery after publishing that state. `retry()` resumes the pending join when no binding exists and
synchronizes the bound session otherwise. Detached enqueue synchronization terminates in explicit
controller state and never creates an unhandled rejection.

The controller subscription publishes `shared.sync.changed` exactly when it publishes a fresh bound
view. Foreground, reconnect, and manual retry only request synchronization; they do not publish separate
notifications. The App derives session identity, recovery controls, WebView mounting, and presentation
solely from controller state.

## Single Secret Envelope

`ParticipantCredentialStore` exposes mandatory envelope operations only. Each run has one deterministic
immutable `envelope_key` in pending or bound SQLite storage:

```ts
type SharedSecretEnvelope =
  | {
      readonly kind: "pending";
      readonly sessionId: string;
      readonly expectedReleaseId: ReleaseId;
      readonly serviceOrigin: string;
      readonly joinRequestId: string;
      readonly invitation: string;
      readonly participantCredential: string;
    }
  | { readonly kind: "bound"; readonly participantCredential: string };
```

SQLite first reserves the pending request with run, session, release, origin, request and invitation
digests, envelope key, and `preparing` status. Only the reservation owner writes the deterministic
pending envelope, then advances through `ready | submitting`. A `preparing` row without an envelope is
safe to cancel because no network request can have occurred; `ready` or `submitting` without the exact
envelope is non-retryable. Exact reuse resumes the same envelope; changed reuse conflicts before secret
mutation or network submission.

Binding and the validated initial pull commit atomically and delete the pending SQLite row. Only after
that commit is the pending envelope reduced at the same key to its bound form. If reduction is
interrupted, startup recognizes the committed binding and completes it before synchronization. A
response mismatch retains the complete pending attempt for exact retry and exposes no projection.
Revocation commits SQLite state and blocked work before removing the envelope.

There is no two-secret representation, optional envelope operation, migration, alias, or legacy
reader. An incompatible pre-release database fails with explicit reset or reinstall guidance.

## Durable Outbox and Finite Claim

Outbox status is `queued`, `submitting`, or `blocked-revoked`. Enqueue compare-or-inserts one exact row
before returning pending; changed command reuse fails. Revocation atomically turns queued or submitting
work into retained blocked evidence.

`beginSubmissionBatch()` uses one exclusive transaction to validate the active binding, recover
interrupted submissions, capture all currently queued rows in stable order, mark exactly that finite set
submitting, and record synchronizing status. One pass submits every captured member sequentially at most
once and performs at most one pull. Submit responses do not delete outbox rows; authoritative pull
reconciliation owns terminalization. Retryable failure requeues submitting rows atomically.

## Keyed Single Flight

One coordinator serializes passes per session. Every request receives the stable drain promise covering
its trigger. The scheduler marks the active pass's claim cutoff immediately before invoking
`beginSubmissionBatch()`: triggers before that cutoff coalesce into the active pass, while any trigger
after the cutoff conservatively requests one trailing pass. Further triggers coalesce into that same
trailing pass. Different sessions proceed independently, and durable rows recover process restart.

`shared.view.get` is a pure durable read. Enqueue schedules only after its transaction commits. Only a
durably observed unreachable-to-reachable transition requests reconnect. Foreground and explicit retry
enter the same scheduler.

## Pending Join and Immutable Binding

SQLite enforces one pending-or-bound session per run with a unique run constraint and cross-table
guards. Network submission begins only after the envelope and pending row are durable. Immediately
before sending, the pending status changes to `submitting`; response loss therefore resumes the exact
request identity and credential.

Fresh join commit requires equality across active run, expected release, response release, snapshot
release, route session, snapshot session, participant, team, service origin, and envelope key. Binding
identity is immutable:

```text
run + release + service origin + session + participant + team + envelope key
```

Membership may move only from active to revoked. Exact retry updates recovery fields only. Changed
reuse or stale reactivation rolls back with a stable conflict.

## Projection Validation and Atomic Pull

One pure resolver validates the complete pull before any mutation transaction and resolves the same
projection before runtime exposure. It requires exactly one projection with the binding's release,
declared schema, aggregate kind, aggregate ID, and valid payload. Empty, multiple, wrong-identity,
wrong-schema, or invalid-payload input leaves SQLite byte-identical and does not open a mutation
transaction.

The resolver receives the exact durable `SharedSessionBinding`; it never derives expected participant,
team, release, or session identity from the candidate pull. The transaction rechecks the stored binding
for race safety after pure validation succeeds.

The exclusive apply transaction then verifies immutable identities, compare-or-inserts each terminal
result, rejects changed repetition or missing provenance, replaces the complete projection set, removes
only outbox rows matched by identical terminals, reconciles revocation or interrupted work, advances
cursor and confirmed time, appends redacted evidence, and commits once. Reapplying a normal, corrective,
or revoked pull is byte-equivalent.

Terminal identity is canonical full `SyncCommandResult` JSON, including capability evidence. The session's
canonical last-pull digest plus a typed local reconciliation delta distinguishes a true no-op from interrupted
outbox recovery. A true no-op performs zero writes; evidence is appended only for transitions committed by
that transaction.

Authenticated pull ordering is participant-scoped. In a repeatable-read transaction the server reads
the authenticated participant's committed `receipt_position` as its high-water mark and returns only
that participant's receipts through it. New terminal decisions increment and insert that position in
the same participant-row-locked transaction, so rollback creates no gap and uncommitted work cannot be
skipped. `nextCursor` and `decisionPosition` remain opaque numeric strings on the existing wire; their
ordering scope is the authenticated participant, not the session or deployment.

## Revocation, Correlation, and Deferrals

Authenticated revocation commits membership, degraded transport, revoked synchronization status,
blocked outbox, and redacted evidence before the envelope is removed. Revoked state is terminal and no
game message is accepted before presentation unmounts.

Bridge parsing captures a valid canonical request ID before operation validation. Semantic failures
return `host.error` with that ID; only invalid JSON or an invalid ID uses `unknown`. The App never
fabricates a pre-routing error.

Background sync, WebSockets, delta feeds, multi-process leases, service rebinding, credential rotation,
active-session release migration, multi-device membership, and report reconstruction after loss of all
local evidence remain out of scope.
