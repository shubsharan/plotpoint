# Tasks: Cooperative Hunt Loop

Tests precede implementation within each phase. PostgreSQL is authoritative, SQLite owns durable local
sync state, SecureStore owns the credential, and the trusted module owns location-discovery semantics.

## Phase 1: Contracts and Setup

- [x] T001 Add `pg`, `@types/pg`, `@testcontainers/postgresql`, and `expo-secure-store` dependencies and scripts.
- [x] T002 [P] Add generic Shared Play command, projection, exact terminal, and view types/parsers.
- [x] T003 [P] Add internal Sync command/result/snapshot types and closed parsers.
- [x] T004 [P] Add Shared Hunt Report types by reusing Play Report terminals and Location projections.
- [x] T005 Add contract tests with two unrelated command/projection schemas and malformed inputs.

## Phase 2: Authoritative Foundation

- [x] T006 [P] Add PostgreSQL test-container lifecycle and migration tests.
- [x] T007 Add the minimal release/session/invitation/participant/team-aggregate/receipt/journal/event migration.
- [x] T008 [P] Implement `READ COMMITTED` transaction and migration primitives in `packages/db`.
- [x] T009 [P] Add timing-safe keyed credential digest/token helpers and validated API configuration.
- [x] T010 Implement bounded Node HTTP parsing, routing, error mapping, and test server seams.
- [x] T011 Add lifecycle contract/integration tests for registration, session creation, invitation, join retry, and revocation.
- [x] T012 Implement release registration and minimal session/invitation/participant repositories.
- [x] T013 Implement release, session, invitation, join, and revoke services/routes plus operator commands.

## Phase 3: Location-Authoritative Commands

- [x] T014 Add trusted mechanic tests for every location outcome, stale different-target acceptance, and same-target no-op.
- [x] T015 Extend `team-session-hunt` with target-zone configuration, schemas, and location-backed release logic/UI.
- [x] T016 Implement the trusted target-discovery config parser, state transition, projection, and redacted outcome helpers.
- [x] T017 Add PostgreSQL fault/concurrency tests for exact retry, changed reuse, revocation linearization, and rollback.
- [x] T018 Implement team aggregate and receipt/journal/event repositories.
- [x] T019 Implement the locked authoritative command transaction and command endpoint.

## Phase 4: Player Shared Play and Snapshot Sync

- [x] T020 [P] Add SecureStore credential and additive SQLite shared-sync schema tests.
- [x] T021 [P] Add bridge conformance tests proving generic commands, persisted observation resolution, and exact terminals.
- [x] T022 [P] Add interruption tests for enqueue, submit receipt, snapshot replacement, result upsert, and cursor advancement.
- [x] T023 Implement SecureStore credential custody and native join/revoke client state.
- [x] T024 Implement additive SQLite shared session, outbox, projection, result, cursor, and sync-event persistence.
- [x] T025 Implement the generic Shared Play bridge/client and resolve observation IDs from the existing observation store.
- [x] T026 Implement foreground HTTP submission, complete snapshot pull, and revoked-session mapping.
- [x] T027 Implement the sync coordinator and honest pending/confirmed/no-op/rejected/invalid/blocked-revoked UI states.

## Phase 5: Report and Acceptance

- [x] T028 [P] Add report chronology, exact-terminal, Location projection, alias, and adversarial-redaction tests.
- [x] T029 Implement bounded sync-event recording and Shared Hunt Report generation/share UI.
- [x] T030 Add provider-free three-player join, location discovery, race, offline restart, snapshot convergence, revocation, and report acceptance.
- [x] T031 Add static architecture tests preventing server release execution and hunt-specific player protocol fields.
- [x] T032 Record provider-free verification and deferred physical-device evidence honestly.
- [x] T033 Run `pnpm verify`, focused PostgreSQL integration, simulator/emulator validation, and `git diff --check`.

## Dependencies

`T001-T005 -> T006-T013 -> T014-T019 -> T020-T027 -> T028-T033`. Tasks marked `[P]` may run in
parallel only when their files do not overlap. Every test task must fail for the intended missing behavior
before its corresponding implementation task is completed.
