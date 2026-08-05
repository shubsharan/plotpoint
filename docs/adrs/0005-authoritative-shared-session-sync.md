---
status: Accepted
---

# ADR: Authoritative Shared Sessions and Snapshot Recovery

## Context

Plotpoint needs reusable infrastructure for release-pinned multiplayer sessions. Games may define
different cooperative mechanics, aggregate state, authorization rules, observations, and projections,
but the platform must provide the same durable guarantees for authenticated membership, offline
intent, exact retry, revocation, and recovery after interruption.

The co-op game is the first acceptance fixture for these guarantees, not the platform
abstraction. Its terminology and rules belong in the game definition, trusted-mechanic adapter, and
feature tests. Encoding targets, discoveries, locations, or a particular team shape in the core sync
contract would make later multiplayer games inherit accidental demo-game constraints.

The first supported shared sessions have small authorized views. Complete snapshot replacement is
therefore simpler and safer than introducing participant-specific materialized projections, ordered
delta feeds, background workers, or a general event-delivery subsystem before a game requires them.

## Decision

1. `apps/api` is the authoritative shared-session boundary and remains one Node modular monolith
   backed by PostgreSQL. Authoritative command transactions use `READ COMMITTED`, explicit membership
   and aggregate row locks, and database uniqueness constraints.
2. Every shared session is pinned to one immutable release. The platform owns generic session,
   participant, team, membership, invitation, credential, command-receipt, and synchronization
   concepts. A release-declared trusted-mechanic binding selects the platform-owned aggregate model,
   commands, authorization rules, and projections described by ADR 0001; game rules do not enter the
   shared-session service as hard-coded branches.
3. Shared Play and Sync use game-neutral, schema-identified envelopes for command
   intents, confirmed projections, exact participant-visible terminal results, opaque cursors, and
   synchronization status. Core protocol and persistence contracts contain no reference-game fields.
4. Each command targets one authoritative aggregate with a stable command ID, expected revision, and
   any capability observations required by its declared mechanic. The selected platform adapter may
   accept a stale revision when its domain invariant still holds or return a stable no-op when the
   desired fact is already true. The platform guarantees transactional execution and idempotent
   receipt; it does not prescribe game-specific conflict semantics.
5. Synchronization uses foreground HTTPS submission and snapshot pulls. Each pull returns the complete
   current projection authorized for the participant, that participant's unique terminal results after
   an opaque cursor, membership status, and the next cursor. The player validates the release, session,
   participant, projection schema, and terminal consistency before atomically replacing confirmed
   projections, reconciling the outbox, and advancing recovery state.
6. The player persists shared commands through the explicit `queued | submitting | blocked-revoked`
   lifecycle. Stable command IDs make response-loss retries exact. Finite, serialized foreground passes
   prevent overlapping triggers from submitting the same eligible row more than once per pass.
7. The service persists release registrations, shared sessions, memberships, invitations,
   authoritative aggregate rows, command receipts, accepted-transition records, and allowlisted
   operational events. This decision does not require participant projection stores, delivery feeds,
   cursor rows, generic effect outboxes, background workers, or WebSockets.
8. Join is idempotent for the same immutable binding. Revocation is terminal for that credential and
   atomically moves retained queued work to `blocked-revoked` before local credentials are removed.
   Credential recovery, rotation, reactivation, team reassignment, service rebinding, and active-session
   release migration are deferred.
9. Capability observations may cross the configured HTTPS boundary and contribute to the canonical
   request digest. Raw or sensitive values are excluded from receipts, transition records,
   projections, logs, operational events, and reports unless a future serialized contract explicitly
   permits retention. Mechanic adapters may derive only the redacted facts their declared projections
   require.
10. Reference games validate this infrastructure through their adapters and acceptance tests. They may
    specialize schemas and domain policy, but they cannot add game-named fields or behavior to the core
    Host API, Sync, shared-session persistence model, or recovery state machine.

## Consequences

- Multiplayer games share one release-bound authority, membership, retry, revocation, and recovery
  model without inheriting the co-op game's vocabulary or rules.
- Complete authorized snapshots trade small repeated payloads for failure-atomic recovery and a much
  smaller protocol surface.
- Commands serialize at their selected aggregate boundary. Domain-aware stale acceptance remains an
  explicit mechanic-adapter policy rather than a platform-wide assumption.
- Larger games, secret-role games, or high-frequency sessions may justify aggregate partitioning,
  participant materialization, delta delivery, or background transport through a future ADR.
- Demo-game details remain in feature specifications, data-only project configuration, trusted
  adapters, and conformance fixtures where they can evolve without redefining platform architecture.
- Simulator and emulator evidence can validate sequencing and compatibility, but physical-device
  behavior remains a separate product evidence gate.

## Supersession

**Supersedes**: None
**Superseded by**: None
