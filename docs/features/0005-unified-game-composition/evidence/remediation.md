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
- `pnpm --filter @plotpoint/player test`: **PASS**, 24 files and 182 tests. At this checkpoint the recovery
  suite covered the then-current envelope-first attempt, atomic binding/pull commit, interruption resume,
  and post-commit envelope reduction. Phase 16 supersedes the attempt ordering with SQLite reservation
  ownership.
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

## Phase 15 Root-Cause Simplification

- Status: **PASS** on 2026-08-06 after the four ownership boundaries and reviewer-discovered seam defects
  were corrected at their owners.
- Protocol/compiler semantic-parity checkpoint: **PASS**. Protocol completed 14 files and 149 tests;
  compiler completed 26 files and 170 tests. The compiler now maps every protocol composition issue and
  retains only source/material diagnostics after the shared analyzer passes.
- Generated-runtime command, capability, and lifecycle checkpoint: **PASS** inside the player project's
  25 files and 195 tests. Executable tests cover shared identical attempts, changed reuse, ordered distinct
  commands, exact component minors, queue closure with a lost host reply, and awaited root cleanup.
- Canonical shared reconciliation and typed-ledger checkpoint: **PASS**. Exact binding is checked before and
  inside transactions; full result JSON includes capability evidence; typed deltas make locked retries
  zero-write; 100 normal/corrective/revoked retries preserve the complete ledger; failure facts, recovery,
  revocation, clock skew, and interruption remain transaction-owned.
- Installed field/co-op and PostgreSQL/Testcontainers journeys: **PASS**. API completed 6 files and 26
  tests, including the installed three-participant co-op journey; the field journey passed in the player
  project.
- Four-release validate/compile/inspect/verify/second-compile/`cmp` matrix: **PASS** with unchanged identities:
  field puzzle `sha256:65bf7468b7e2166f620af6200da8844e844cb0d64760fa04e3cc18862ae6a2dd`,
  minimal local puzzle `sha256:ad2a33ec8f88a67a45f7cdcdac82d68a24f533925267232434f598e8c31697ba`,
  branching media tour `sha256:3bfc3ddf86a38dcac2da81ff851cf111e99b59f01ef92bcb1fae0f3890cccb1b`,
  and co-op game `sha256:6b3a9adb1e9a9549a6a791f049fd6d9bdd3660b8e9a84d90d2023d9e265d58f2`.
- `pnpm verify`: **PASS** with clean format/lint, all package type checks/builds, 95 test files and 682
  tests, Spec Kit workflow tests, and workflow validation. `git diff --check`: **PASS**.
- Fresh iOS simulator: **PASS** on iPhone 17 Pro. Xcode reported `Build Succeeded`, zero errors and one
  duplicate-library warning; Expo installed/opened `com.plotpoint.player`, and explicit `simctl launch`
  returned PID 72008.
- Fresh Android emulator: **PASS** on `Plotpoint_API_36`. Gradle reported `BUILD SUCCESSFUL`, Expo
  installed/opened `com.plotpoint.player`, and explicit activity/package/PID checks returned PID 12345.
  An initial explicit serial selector found no Expo device name; the sole-connected-device retry succeeded
  without a source change.
- Physical iOS and physical Android: **NOT RUN**.

## Phase 16 Cohesion Closure

- Status: **PASS** on 2026-08-06. SQLite now reserves the only durable join attempt before SecureStore;
  `SharedJoinCoordinator` alone classifies and resumes pending/bound state, while `SharedPlayController`
  consumes only its typed `unbound | bound | blocked` outcome.
- Red-to-green recovery and chronology checkpoint: **PASS**. The initial focused run failed only the
  envelope-less `preparing` startup and wall-clock rollback cases. The completed focused player/runtime
  matrix passed 6 files and 41 tests, covering safe cancellation, exact preparing/ready/submitting resend,
  orphan-envelope ownership reconstruction, committed-envelope reduction, missing-credential blocking,
  and nondecreasing elapsed evidence.
- Installed co-op PostgreSQL/Testcontainers acceptance: **PASS**, 1 file and 1 test. The mounted generated
  ClueBoard action emitted `capability.request`, `shared.view.get`, and `shared.command.enqueue`; production
  location and composition-aware shared handlers persisted the observation, reached PostgreSQL through
  the controller/HTTP path, refreshed zero to one confirmed target, survived controller recreation, and
  exported the generic committed report.
- `pnpm verify`: **PASS**, including generated-runtime freshness, clean format/lint, all package type
  checks/builds, 95 test files and 688 tests, Spec Kit workflow tests, and workflow validation.
- Fresh four-release validate/compile/inspect/verify/second-compile/`cmp` matrix: **PASS** with unchanged
  identities: field puzzle `sha256:65bf7468b7e2166f620af6200da8844e844cb0d64760fa04e3cc18862ae6a2dd`,
  minimal local puzzle `sha256:ad2a33ec8f88a67a45f7cdcdac82d68a24f533925267232434f598e8c31697ba`,
  branching media tour `sha256:3bfc3ddf86a38dcac2da81ff851cf111e99b59f01ef92bcb1fae0f3890cccb1b`,
  and co-op game `sha256:6b3a9adb1e9a9549a6a791f049fd6d9bdd3660b8e9a84d90d2023d9e265d58f2`.
- Fresh iOS simulator: **PASS** on iPhone 17 Pro. Xcode reported `Build Succeeded` with zero errors and
  warnings; Expo installed and opened `com.plotpoint.player`.
- Fresh Android emulator: **PASS** on `Plotpoint_API_36`. Gradle reported `BUILD SUCCESSFUL`; Expo installed
  the debug APK and opened the development-client route. The initial serial selector did not match Expo's
  device-name selector; targeting the queried AVD name succeeded without a source change.
- Spec Kit workflow validation and `git diff --check`: **PASS**. Physical iOS and physical Android remain
  explicitly **NOT RUN**.

## Phase 17 Response-Loss Closure

- Status: **PASS** on 2026-08-06. Invitation expiry now limits first consumption only: after a committed
  join, the service validates the complete stored identity and returns the original binding for an exact
  retry, while changed consumed attempts and expired unconsumed invitations remain unauthorized.
- Red-to-green response-loss checkpoint: **PASS**. The new API regression first reproduced the premature
  expiry rejection. Generated-runtime regressions cover concurrent sharing, successful caching, a lost
  response followed by exact durable replay, settled host failure, permanent changed-ID conflict, and
  waiter/timer cleanup on response and disposal.
- Focused API/PostgreSQL/installed co-op matrix: **PASS**, 3 files and 15 tests. The real PostgreSQL test
  moves a consumed invitation into the past, recovers its exact binding, rejects changed identities without
  participant or invitation mutation, and preserves release-first validation. The mounted co-op action
  continues to cross the production bridges and authoritative service.
- Focused generated-runtime/lifecycle matrix: **PASS**, 3 files and 21 tests. `transition.commit` alone has
  the fixed 15-second deadline; timeout retains the immutable fingerprint but releases the active promise,
  and explicit exact reissue applies the durable duplicate once. Generated source freshness and player/API
  type checks also pass.
- `pnpm verify`: **PASS**, including generated-runtime freshness, formatting, lint, all package type
  checks/builds, 95 test files and 692 tests, Spec Kit workflow contract tests, synchronization, and
  validation.
- Fresh iOS simulator: **PASS** on iPhone 17 Pro. Xcode reported `Build Succeeded` with zero errors and
  warnings; Expo installed/opened `com.plotpoint.player`, and explicit `simctl launch` returned PID 73436.
- Fresh Android emulator: **PASS** on `Plotpoint_API_36`. Gradle reported `BUILD SUCCESSFUL`; Expo installed
  and opened the debug application, and `adb` confirmed `com.plotpoint.player` at PID 14246.
- `git diff --check`: **PASS** after final documentation synchronization. Physical iOS and physical Android
  remain explicitly **NOT RUN**.

## Phase 18 Acknowledged Runtime Disposal Closure

- Status: **PASS** on 2026-08-06. React no longer owns WebView cleanup through effect teardown. One managed
  runtime-view owner injects an exact correlated disposal request, keeps the old view hidden and
  non-interactive while continuing to route cleanup host messages, and releases it only after the matching
  generated-runtime acknowledgement or explicit native process termination.
- Red-to-green lifecycle checkpoint: **PASS**. The first focused run failed because the player-owned
  disposal coordinator did not exist. The completed generated-runtime and coordinator regressions cover
  malformed, wrong, duplicate, and late acknowledgements; concurrent and startup-time requests;
  asynchronous application/component cleanup; cleanup-originated capability work; reverse exactly-once
  cleanup after failure; stable failure codes; and iOS/Android process-loss settlement without a deadline.
- Focused runtime, controller, field, and installed co-op matrix: **PASS**, 8 files and 43 tests. Static App
  ownership coverage proves scanner entry, every non-playable shared state, and runtime/controller
  replacement await managed disposal, while the installed journeys continue through the generated runtime,
  production bridges, SQLite, HTTP, and PostgreSQL.
- Player project: **PASS**, 27 files and 212 tests. Generated runtime freshness and player type checks also
  pass.
- `pnpm verify`: **PASS**, including generated-runtime freshness, formatting, lint, all package type checks
  and builds, 97 test files and 701 tests, Spec Kit workflow contract tests, synchronization, and validation.
- Fresh iOS simulator: **PASS** on iPhone 17 Pro. Xcode reported `Build Succeeded` with zero errors and
  warnings; Expo installed/opened `com.plotpoint.player`, and explicit `simctl launch` returned PID 69250.
- Fresh Android emulator: **PASS** on `Plotpoint_API_36`. Gradle reported `BUILD SUCCESSFUL`; Expo installed
  and opened the debug application, and `adb` confirmed `com.plotpoint.player` at PID 14470.
- Physical iOS and physical Android: **NOT RUN**. No public Host API, database schema, migration, background
  retry loop, or disposal timeout was added.
