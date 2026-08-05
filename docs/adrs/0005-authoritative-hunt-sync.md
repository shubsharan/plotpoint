---
status: Accepted
---

# ADR: Simplified Cooperative Hunt Authority and Snapshot Recovery

## Context

Feature 0004 is the first server-authoritative product loop. Early design work considered
target-scoped aggregates, participant-specific materialized projections, ordered delivery feeds,
corrective snapshots, full membership recovery, and a hunt-specific Host API extension. Review
showed that this generalized synchronization before one game required it while making the durable
player boundary specific to target discovery.

The reference hunt needs three invited participants, location-backed shared discoveries, durable
offline submission, exact retry, revocation, convergence, and a useful redacted report. Its complete
authorized state is small enough to replace atomically on every pull. Loop 1 simulator and emulator
evidence is accepted for sequencing; physical-device validation remains deferred behind the recorded
toolchain blocker.

## Decision

1. `apps/api` remains one Node modular monolith backed by PostgreSQL. Authoritative command
   transactions use `READ COMMITTED`, explicit participant and team-aggregate row locks, and database
   uniqueness constraints.
2. One team aggregate owns the hunt's complete target map and derived completion. Target discovery is
   domain-aware: a stale team version may still accept when the named target remains available; a
   later discovery of an already discovered target is a stable `no-op`.
3. Host API 1.0 remains unchanged. Host API 1.1 adds game-neutral shared-play operations for generic
   command intents, schema-identified confirmed projections, exact terminal results, and sync status.
   Host-owned contracts contain no hunt, target, or mechanic-specific fields.
4. Foreground Location Capability V1 remains unchanged. Shared command intents name persisted
   observation IDs; the native host resolves them and attaches the exact stored observations to the
   service request. The trusted target-discovery module validates zone, freshness, and accuracy.
   This is trusted-client evidence, not device attestation.
5. Synchronization uses foreground HTTPS command submission and snapshot pulls. Each pull returns one
   complete current authorized projection, the authenticated participant's terminal results after an
   opaque cursor, and the next cursor. The player atomically replaces its confirmed projection,
   upserts terminal results, and advances the cursor in SQLite.
6. The server persists release registrations, sessions with one team identity, participants,
   one-use invitations, the team aggregate, command receipts, accepted-transition journal/events, and
   allowlisted operational events. It does not add participant projections, delivery feeds, cursor
   rows, membership epochs, generic effect outboxes, or worker behavior.
7. Feature 0004 supports idempotent join and operator revocation. Credential recovery, reactivation,
   rotation, and team reassignment are deferred. Revoked clients retain queued commands as
   `blocked-revoked` evidence but cannot submit them.
8. Raw location observations may cross the configured HTTPS boundary and contribute to the canonical
   request digest. Coordinates are not retained in receipts, journals, projections, logs,
   operational events, or reports.

## Consequences

- The first hunt has one obvious authoritative transaction boundary and no client-side delta engine.
- Different targets serialize briefly on one team row, but domain-aware stale acceptance avoids false
  user-visible conflicts for still-available targets.
- Complete snapshots trade small repeated payloads for simpler interruption recovery and authorization.
- Later games can reuse Host API 1.1 without player changes because commands and projections are
  schema-identified canonical data.
- A larger or secret-role game may justify participant materialization, delta delivery, or aggregate
  partitioning through a future architectural decision.
- Physical iOS and Android evidence remains an honest deferred product gate and is not inferred from
  simulator or emulator results.

## Supersession

**Supersedes**: None
**Superseded by**: None
