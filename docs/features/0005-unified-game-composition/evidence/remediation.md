# Unified Game Composition Remediation Evidence

Initialized on 2026-08-06. This file is authoritative only for tasks T078 and later. Every result stays
`NOT RUN` until executed against the final remediation worktree; passing historical Phase 8 commands is
not carried forward.

## Focused Contract And Adversarial Suites

- Status: **PASS** on 2026-08-06.
- Runtime source freshness and production transport: **PASS**; the player project completed 25 test
  files and 179 tests, including generated-source freshness and both installed WebView-transport journeys.
- Participant-scoped authority and stale-command matrix: **PASS**; the API project completed 6 test
  files and 25 tests against its disposable PostgreSQL boundary.
- Join, restart, connectivity, revocation, and malformed-pull recovery: **PASS** in the player project,
  including controller/store recreation followed only by `start()` and byte-identical malformed-pull checks.
- Committed evidence and privacy matrix: **PASS** for 5-second and 30-second policy dispositions,
  unused observations, chronology, repeat export, and adversarial private values.

## PostgreSQL And Installed Product Journeys

- Disposable PostgreSQL/Testcontainers: **PASS** with PostgreSQL 17 through the API acceptance and
  integration suites.
- Field-puzzle installed generated-runtime journey: **PASS** through the generated production runtime,
  WebView-style message transport, real SQLite persistence, recreation, recovery, and ledger report.
- Co-op installed three-participant, restart, report, revision, and fresh-session journey: **PASS** through
  compiled release bytes, generated production runtime, real bridge routers, `SharedPlayController`, real
  SQLite, the HTTP client/API, disposable PostgreSQL, controller recreation, and committed-evidence export.

## Four-Example Compiler Matrix

- Validate, compile, inspect, verify, and reproduce all four examples: **PASS**. Both compiled copies were
  byte-identical. Release identities were field puzzle `sha256:65bf7468b7e2166f620af6200da8844e844cb0d64760fa04e3cc18862ae6a2dd`,
  minimal puzzle `sha256:ad2a33ec8f88a67a45f7cdcdac82d68a24f533925267232434f598e8c31697ba`,
  branching tour `sha256:3bfc3ddf86a38dcac2da81ff851cf111e99b59f01ef92bcb1fae0f3890cccb1b`,
  and co-op `sha256:6b3a9adb1e9a9549a6a791f049fd6d9bdd3660b8e9a84d90d2023d9e265d58f2`.

## Repository Gates

- `pnpm verify`: **PASS**; format, lint, type checks, build, 93 test files and 662 tests, Spec Kit
  workflow contract tests, documentation synchronization, and workflow validation completed successfully.
- Mandatory workflow validation: **PASS** within `pnpm verify`.
- `git diff --check`: **PASS** after the final Spec Kit synchronization and cross-artifact analysis.

The full Vitest runner completed 93 files and 662 tests. The project-level timeout is 15 seconds for real
compiler and installed-player boundaries, while explicit adversarial deadlines remain local to their tests.

## Native Simulation

- iOS simulator build/install/launch: **PASS** after final player production changes using Expo's native
  run for the iPhone 17 Pro simulator; Xcode reported `Build Succeeded`, installation/open succeeded, and
  an explicit simulator launch returned process ID 35832.
- Android emulator build/install/launch: **PASS** after final player production changes using Expo's native
  run for `Plotpoint_API_36`; Gradle built and installed successfully, and an explicit activity launch
  returned application process ID 11642. The serial-form selector was rejected before build; the configured
  AVD name was resolved from adb, and the sandboxed Gradle-cache attempt was retried with approved access.

## Physical Devices

- Physical iOS: **NOT RUN**.
- Physical Android: **NOT RUN**.

## Phase 14 Checkpoint 1: Sole Runtime And Field Journey

- Status: **PASS** on 2026-08-06.
- Red evidence: the installed field test first observed missing reverse child cleanup, then the absence of
  component actions before the generated kernel and component implementation changed.
- `pnpm --filter @plotpoint/player runtime:check`: **PASS**.
- `pnpm exec vitest run apps/player/test/field-puzzle-acceptance.test.ts apps/player/test/runtime-composition.test.ts apps/player/test/runtime-lifecycle.test.ts examples/releases/field-puzzle/test/field-puzzle.test.ts`:
  **PASS**, 4 files and 17 tests.
- `pnpm --filter @plotpoint/player check-types`: **PASS**.
- `pnpm --filter @plotpoint-example/field-puzzle check-types`: **PASS**.
- `git diff --check`: **PASS**.
- The installed journey used mounted DOM actions for check-in, solve, and second check-in, reached state
  version 3, recreated the generated runtime over recovered SQLite state, and exported three command plus
  two captured/two consumed capability events. No test imports a shadow runtime implementation.

## Phase 14 Checkpoint 2: Controller, Projection, And Scheduler Ownership

- Status: **PASS** on 2026-08-06.
- Red evidence: startup transport rejected after publishing recovery, pending-join retry could not resume,
  detached enqueue synchronization produced an unhandled rejection, and an in-flight claim trigger failed
  to request its trailing pass before the ownership changes.
- Focused controller, projection, recovery, scheduler, and App ownership matrix: **PASS**, 5 files and 46
  tests.
- `pnpm --filter @plotpoint/player test`: **PASS**, 24 files and 180 tests.
- `pnpm --filter @plotpoint/player check-types`: **PASS**.
- `git diff --check`: **PASS**.
- Verified runtime metadata is prepared once before controller startup; the controller exclusively gates
  mounting, retryability, and fresh-bound notification. The same exact projection resolver rejects empty,
  multiple, wrong-release, wrong-kind, wrong-ID, wrong-schema, and invalid-payload snapshots before any
  SQLite mutation and before Web exposure.

## Phase 14 Checkpoint 3: Participant-Scoped Commit-Safe Cursors

- Status: **PASS** on 2026-08-06.
- Red evidence: the PostgreSQL schema test first observed the global sequence, missing participant counter,
  and globally unique receipt position.
- PostgreSQL/Testcontainers integration: **PASS**, 1 file and 4 tests, including a held uncommitted receipt,
  an authenticated concurrent pull that stayed at the committed cursor, same-participant positions 1 then
  2, and an independent participant position 1 while the first participant row remained locked.
- API plus database focused unit suites: **PASS**, 2 files and 12 tests.
- `pnpm --filter @plotpoint/api test`: **PASS**, 6 files and 26 tests.
- `pnpm --filter @plotpoint/api check-types` and `pnpm --filter @plotpoint/db check-types`: **PASS**.
- `git diff --check`: **PASS**.
- PostgreSQL now increments `hunt_participants.receipt_position` under the participant row lock in the same
  transaction as the receipt. Repeatable-read pull uses that participant's committed counter; an earlier
  pre-release schema is rejected with reset-or-reinstall guidance rather than migrated.

## Phase 14 Checkpoint 4: Mechanic And Secret Authority

- Status: **PASS** on 2026-08-06.
- Red evidence: the public mechanic adapter exposed a separable `authorize` result; SecureStore exposed
  optional envelope methods beside six raw invitation/credential methods; and pending SQLite storage
  retained separate invitation and credential keys.
- `pnpm --filter @plotpoint/modules test`: **PASS**, 2 files and 17 tests. Every authority, stale,
  already-satisfied, observation, and terminal-evidence case crosses only the complete `execute` result.
- `pnpm --filter @plotpoint/player test`: **PASS**, 24 files and 182 tests. Recovery tests prove the
  pending envelope is written before reservation, reduced only after atomic binding/pull commit, resumes
  after interruption, and leaves a committed join successful with durable recovery evidence if reduction
  must resume.
- Installed co-op PostgreSQL/Testcontainers acceptance: **PASS**, 1 file and 1 test, after migrating the
  cross-package player harness to the mandatory envelope and `envelope_key` schema.
- Module, player, and API type checks: **PASS**.
- `pnpm format`, `pnpm lint`, and `git diff --check`: **PASS**; lint retains the pre-existing generated
  harness unused-helper warning and reports no error.
- `TrustedMechanicAdapter` now exposes only binding validation, complete execution, and projection. The
  player has one mandatory envelope protocol and one immutable pending/bound key, with no fallback reader,
  schema migration, alias, or compatibility adapter. The governing contracts are single current documents.

## Phase 14 Final Acceptance

- Status: **PASS** on 2026-08-06 after all four dependency checkpoints.
- `pnpm verify`: **PASS**, including generated-runtime freshness, format, lint, all package type checks and
  builds, 93 test files and 662 tests, Spec Kit workflow tests, and workflow validation. The sole lint
  warning remains the pre-existing unused helper in the generated-runtime test harness.
- PostgreSQL/Testcontainers: **PASS** inside the complete suite, including the participant-row lock,
  repeatable-read cursor high-water, installed co-op controller, and report journey.
- Fresh four-release validation, compile, inspect, verify, second compile, and byte comparison: **PASS**.
  Release IDs are field puzzle
  `sha256:65bf7468b7e2166f620af6200da8844e844cb0d64760fa04e3cc18862ae6a2dd`, minimal local puzzle
  `sha256:ad2a33ec8f88a67a45f7cdcdac82d68a24f533925267232434f598e8c31697ba`, branching media tour
  `sha256:3bfc3ddf86a38dcac2da81ff851cf111e99b59f01ef92bcb1fae0f3890cccb1b`, and co-op game
  `sha256:6b3a9adb1e9a9549a6a791f049fd6d9bdd3660b8e9a84d90d2023d9e265d58f2`.
- The field release golden was intentionally regenerated after the playable component changed; the first
  full gate identified the stale pre-remediation identity, while both fresh compilations were already
  byte-identical. The corrected golden passed its focused compiler suite and the repeated full gate.
- iOS simulator: **PASS** on iPhone 17 Pro. Xcode reported `Build Succeeded` with zero errors and warnings,
  Expo installed/opened `com.plotpoint.player`, and explicit `simctl launch` returned PID 35832.
- Android emulator: **PASS** on `Plotpoint_API_36`. The approved Gradle-cache retry reported
  `BUILD SUCCESSFUL`, installed/opened `com.plotpoint.player`, and explicit activity/package/PID checks
  returned PID 11642. The earlier selector and sandbox-cache attempts made no build or source change.
- Physical iOS and physical Android: **NOT RUN**.
