# Data Model: Cooperative Hunt Loop

Wire compatibility is centrally registered; PostgreSQL and SQLite layouts are implementation-owned. The model keeps
only records required by the three-player location hunt.

## Server Records

### Release Registration

Immutable `releaseId`, validated manifest/compatibility, trusted mechanic identity, and extracted target
configuration. Each target defines stable ID, public prompt/zone label, latitude, longitude, radius,
maximum observation age, and maximum horizontal accuracy. Uploaded bytes are discarded after verification.

### Hunt Session

Stable `sessionId`, idempotent `creationId` plus request digest, immutable `releaseId`, embedded `teamId`
and label, and creation time. Completion is not stored independently; it is derived from the team aggregate.

### Invitation and Participant

One-use invitation secrets and participant bearer credentials are 256-bit random values stored as
keyed digests. An invitation has session scope, expiry, consumption data, and identical-retry binding.
A participant has immutable session/team scope, join request identity, credential digest, and
`active | revoked` status. Revocation is terminal in Feature 0004.

### Team Aggregate

One `(sessionId, teamId)` row contains schema identity/version, state version, and canonical state:

```ts
interface TeamHuntState {
  readonly targets: readonly {
    readonly targetId: string;
    readonly status: "available" | "discovered";
  }[];
  readonly completedTargets: number;
  readonly complete: boolean;
}
```

Targets use stable ordinal order. Every accepted first discovery increments the team state version.
A stale command may accept when its named target is still available; an already discovered target is
a no-op. The row is the single command lock and completion authority.

### Command Receipt, Journal, and Events

An immutable receipt keyed by `(sessionId, commandId)` stores participant, target aggregate, command
type, expected version, canonical request digest, exact terminal, allowlisted outcome code, resulting
version, decision position, and decision time. It stores no raw payload or observation.

Only accepted changing transitions create journal and domain-event rows. Operational events contain
allowlisted codes, aliases/foreign keys under server access control, versions, and relative timing;
they never contain raw location, credentials, payload/state, SQL errors, paths, or stacks.

## Player Records

- SecureStore owns the raw participant credential.
- `shared_sessions` stores non-secret scope, credential key reference, transport/sync status, cursor,
  and confirmed time.
- `shared_outbox` stores immutable generic command intents, observation IDs, and
  `queued | in-flight | terminal | blocked-revoked` status.
- `shared_projections` stores the latest schema-identified confirmed projection.
- `shared_results` stores immutable exact terminal results.
- `shared_sync_events` stores a bounded redacted relative-time timeline for reports.

Enqueue commits before release-visible pending acknowledgement. Snapshot replacement, result upserts,
and cursor advancement commit atomically while preserving outbox commands. Revocation changes queued
commands to `blocked-revoked` without deleting them.
