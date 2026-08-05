---
status: Pending
---

# Feature Specification: Cooperative Hunt Loop

**Branch**: `feature/0004-cooperative-hunt-loop`
**Epic**: [Plotpoint Core Product Loops](../../epics/0001-plotpoint-core-platform/epic.md)

## User Scenarios

### User Story 1 - Join a Release-Pinned Hunt (P1)

An operator registers one verified release, starts a one-team session, and gives three players unique
one-use invitations. Each player joins idempotently, stores its session credential in native secure
storage, and receives the same release-pinned initial authorized view.

**Independent test**: Join three clean player stores, retry one response-lost join, reject invalid or
consumed invitations, restart each player, and verify session/release/team identity without exposing credentials.

### User Story 2 - Discover Targets with Location Evidence (P1)

Players request foreground location and submit shared target-discovery commands. The host attaches the
exact persisted observation. The trusted server mechanic validates zone, freshness, and accuracy and
updates one authoritative team hunt.

**Independent test**: Accept fresh accurate in-zone evidence; reject denied, unavailable, stale, future,
inaccurate, and outside-zone evidence; race the same target; and submit different targets from one stale view.

### User Story 3 - Disconnect and Converge (P2)

A disconnected player keeps the last confirmed view and queues eligible attempts as pending. After
restart and reconnection, exact commands are submitted and one complete authorized snapshot plus terminal
results atomically replaces local confirmed state.

**Independent test**: Disconnect one of three players for the reference hunt's full configured route,
restart around every persistence boundary, reconnect, and converge without manual reset or duplicate acceptance.

### User Story 4 - Revoke and Learn (P3)

An operator can revoke a participant. The player retains blocked queued evidence but cannot submit it.
Players export a redacted report that explains location rejection, same-target no-op, and snapshot recovery.

**Independent test**: Revoke a participant with queued work, verify explicit revoked state, export a
report, and prove credentials, invitations, coordinates, payload/state, and reusable identities are absent.

## Requirements

- **FR-001**: Sessions MUST pin one verified immutable release for their lifetime.
- **FR-002**: One-use invitations and repeated identical joins MUST not create duplicate participants.
- **FR-003**: Participant credentials MUST remain in native secure storage and be stored server-side only as keyed digests.
- **FR-004**: Unknown, expired, consumed, and wrong-session invitations MUST disclose no game view.
- **FR-005**: Host API 1.1 commands and projections MUST remain game-neutral and schema identified.
- **FR-006**: Release code MUST reference persisted observation identities; it MUST NOT supply replacement sensor values.
- **FR-007**: Shared discoveries MUST be decided by one trusted server module using target, freshness, accuracy, and zone policy.
- **FR-008**: One team aggregate MUST own target state and derived completion.
- **FR-009**: A stale command MAY accept only when the trusted mechanic proves its named target remains available.
- **FR-010**: The first valid discovery MUST accept once; later valid discoveries of that target MUST return a stable no-op.
- **FR-011**: Exact command retries MUST return the original terminal; changed reuse MUST alter no durable state.
- **FR-012**: Accepted decisions MUST atomically commit receipt, team state/version, journal, and domain events.
- **FR-013**: Raw observations MUST NOT persist in server receipts, journals, projections, logs, events, or reports.
- **FR-014**: Pending commands MUST NOT change the confirmed projection before authoritative acceptance.
- **FR-015**: Outbox commands, terminal results, confirmed projection, and cursor MUST survive process/device restart.
- **FR-016**: Every pull MUST provide a complete current authorized projection and retained participant results after an opaque cursor.
- **FR-017**: Snapshot replacement, result upsert, and cursor advancement MUST commit atomically in SQLite.
- **FR-018**: Operator revocation MUST prevent further acceptance and move queued local work to blocked-revoked without deletion.
- **FR-019**: Reports MUST preserve exact terminal semantics and redacted Location V1 quality bands.
- **FR-020**: Provider-free, iOS simulator, and Android emulator evidence MUST remain distinct from deferred physical-device claims.

## Success Criteria

- **SC-001**: Three players join one release-pinned hunt and complete every configured target in the provider-free loop.
- **SC-002**: A same-target three-player race changes team state once; each command reaches an exact terminal.
- **SC-003**: Different available targets submitted from one stale team version both accept through the trusted conflict policy.
- **SC-004**: Every location failure class produces an explicit non-progressing result and no raw coordinate appears in prohibited stores/exports.
- **SC-005**: A disconnected/restarted player converges through one snapshot pull across the reference hunt's complete configured lifecycle.
- **SC-006**: Interruption tests at every server and SQLite commit boundary produce no partial accepted state or lost terminal.
- **SC-007**: The same complete loop passes provider-free, iOS simulator, and Android emulator validation; physical-device status remains deferred.

## Assumptions and Boundaries

- Release code is trusted internal code; location evidence is trusted-client evidence, not attestation.
- There is one team and one team aggregate per session. Recovery/reactivation and team changes are deferred.
- No WebSockets, background sync/location, general accounts, ORM, arbitrary server code, generic effects,
  delta delivery, participant projection store, distributed services, or active-session release migration.

## Architecture Decisions

- [ADR-0001: Deterministic Runtime Contract](../../adrs/0001-deterministic-runtime-contract.md)
- [ADR-0002: Immutable Release Format](../../adrs/0002-immutable-release-format.md)
- [ADR-0003: Trusted Single-WebView Runtime](../../adrs/0003-trusted-webview-runtime.md)
- [ADR-0004: Host-Owned Atomic Player Persistence](../../adrs/0004-atomic-player-persistence.md)
- [ADR-0005: Authoritative Shared Sessions and Snapshot Recovery](../../adrs/0005-authoritative-shared-session-sync.md)
