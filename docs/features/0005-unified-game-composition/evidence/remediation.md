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
  byte-identical. Release identities were field puzzle `sha256:22834f9a8058b285a56362f2241e3f4924674cde16f072b06428c4a4ad78a2a6`,
  minimal puzzle `sha256:ad2a33ec8f88a67a45f7cdcdac82d68a24f533925267232434f598e8c31697ba`,
  branching tour `sha256:3bfc3ddf86a38dcac2da81ff851cf111e99b59f01ef92bcb1fae0f3890cccb1b`,
  and co-op `sha256:6b3a9adb1e9a9549a6a791f049fd6d9bdd3660b8e9a84d90d2023d9e265d58f2`.

## Repository Gates

- `pnpm verify`: **PASS**; format, lint, type checks, build, 94 test files and 657 tests, Spec Kit
  workflow contract tests, documentation synchronization, and workflow validation completed successfully.
- Mandatory workflow validation: **PASS** within `pnpm verify`.
- `git diff --check`: **PASS** after the final Spec Kit synchronization and cross-artifact analysis.

The full Vitest runner is intentionally bounded to one worker because compiler and installed-player tests
spawn real subprocesses. The unbounded runner oversubscribed the machine and caused unrelated timeouts;
the project-level timeout is 15 seconds for those real boundaries, while explicit adversarial deadlines
remain local to their tests. The bounded runner completed 94 files and 657 tests.

## Native Simulation

- iOS simulator build/install/launch: **PASS** after final player production changes using Expo's native
  run for the iPhone 17 Pro simulator; Xcode reported `Build Succeeded`, installation/open succeeded, and
  an explicit simulator launch returned process ID 6109.
- Android emulator build/install/launch: **PASS** after final player production changes using Expo's native
  run for emulator 5554; Gradle built and installed successfully, and an explicit activity launch returned
  application process ID 10634. The initial sandboxed Gradle-cache attempt was retried with approved access.

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
