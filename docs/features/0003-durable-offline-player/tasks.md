# Tasks: Durable Offline Field Puzzle

**Input**: Design documents from `docs/features/0003-durable-offline-player/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, Accepted ADRs 0003 and 0004

**Tests**: Contract, integration, interruption, and redaction tests are required by the specification.

## Phase 1: Setup

- [x] T001 Update workspace and player dependency configuration in `apps/player/package.json`, `apps/player/app.json`, `apps/player/tsconfig.json`, and `pnpm-workspace.yaml`
- [x] T002 [P] Add player test project and aliases in `vitest.config.ts`
- [x] T003 [P] Extend mobile and generated-artifact exclusions in `.gitignore` and `.prettierignore`

## Phase 2: Foundational Contracts

- [x] T004 Add InstallDescriptorV1 validation and private-network policy in `packages/protocol/src/player/install.ts`
- [x] T005 [P] Add closed Host Bridge V1 envelope types and validation in `packages/protocol/src/player/bridge.ts`
- [x] T006 [P] Add foreground location and PlayReportV1 contracts in `packages/protocol/src/player/report.ts`
- [x] T007 Export player contracts from `packages/protocol/src/index.ts`
- [x] T008 Add protocol contract and boundary tests in `packages/protocol/test/player-contracts.test.ts`

## Phase 3: User Story 1 — Install A Field Puzzle (P1)

**Independent Test**: Serve one valid artifact, install it by descriptor, then reject mutation, wrong
identity, incompatibility, excessive size, timeout, and interruption without replacing a valid install.

- [x] T009 [US1] Add verified private-LAN serving and interface selection in `packages/compiler/src/serve/serve-release.ts`
- [x] T010 [US1] Extend CLI parsing and lifecycle for `plotpoint serve` in `packages/compiler/src/cli.ts`
- [x] T011 [US1] Add QR dependency and compiler exports in `packages/compiler/package.json` and `packages/compiler/src/index.ts`
- [x] T012 [US1] Add LAN server and CLI integration tests in `packages/compiler/test/integration/serve-release.test.ts` and `packages/compiler/test/integration/cli.test.ts`
- [x] T013 [US1] Implement bounded descriptor download, artifact verification, compatibility, and atomic publication policy in `apps/player/src/install/install-release.ts`
- [x] T014 [US1] Add the Expo scanner and installation screens in `apps/player/App.tsx`

## Phase 4: User Story 2 — Complete The Field Puzzle Offline (P2)

**Independent Test**: Use scripted and physical observations to complete checkpoint one, the puzzle,
and checkpoint two offline; denied, unavailable, stale, inaccurate, and distant inputs do not advance.

- [x] T015 [US2] Implement player SQLite migrations and repositories in `apps/player/src/persistence/database.ts`
- [x] T016 [US2] Implement location adapter and observation persistence in `apps/player/src/location/foreground-location.ts`
- [x] T017 [US2] Implement trusted WebView bootstrap and navigation policy in `apps/player/src/runtime/bootstrap.ts`
- [x] T018 [US2] Implement Bridge V1 request routing in `apps/player/src/bridge/host-bridge.ts`
- [x] T019 [US2] Add field-puzzle schemas, content, commands, progression, and presentation under `examples/releases/field-puzzle/`
- [x] T020 [US2] Add player location, bootstrap, and route tests in `apps/player/test/bootstrap.test.ts` and `examples/releases/field-puzzle/test/field-puzzle.test.ts`

## Phase 5: User Story 3 — Resume Progress Exactly Once (P3)

**Independent Test**: Interrupt immediately before and after commit, restart, and prove every command
is absent or restored once; duplicate delivery returns the original result.

- [x] T021 [US3] Implement canonical transition validation and atomic commit in `apps/player/src/persistence/commit-transition.ts`
- [x] T022 [US3] Implement run creation, bootstrap recovery, and invalid-record diagnostics in `apps/player/src/runtime/recovery.ts`
- [x] T023 [US3] Connect runtime readiness, capability requests, commit results, and recovery to `apps/player/App.tsx`
- [x] T024 [US3] Add duplicate, stale-version, rollback, and recovery tests in `apps/player/test/commit-transition.test.ts` and `apps/player/test/recovery.test.ts`

## Phase 6: User Story 4 — Learn And Revise (P4)

**Independent Test**: Export a useful redacted report, revise one game input, install a new identity,
and begin a fresh run while preserving the prior run.

- [x] T025 [US4] Implement PlayReportV1 derivation and redaction in `apps/player/src/reports/create-play-report.ts`
- [x] T026 [US4] Add native report sharing for the current run in `apps/player/App.tsx`
- [x] T027 [US4] Add report completeness, redaction, and fresh-run tests in `apps/player/test/play-report.test.ts` and `apps/player/test/install-release.test.ts`

## Phase 7: Verification And Documentation

- [x] T028 Update Loop 1 operation and trust-boundary guidance in `README.md` and `docs/features/0003-durable-offline-player/quickstart.md`
- [x] T029 Record provider-free verification and physical-device acceptance slots in `docs/features/0003-durable-offline-player/checklists/implementation.md`
- [x] T030 Run formatting, lint, type checks, builds, tests, Spec Kit sync/check, and `pnpm verify`

## Dependencies

`Setup -> Contracts -> US1 install -> US2 play -> US3 recovery -> US4 learning -> Verification`

US1 establishes the release on-device. US2 requires that installation. US3 makes US2 durable. US4
derives learning from the durable records. Tasks marked `[P]` touch disjoint files and may run together.

## Implementation Strategy

Close one usable slice at each story checkpoint. Do not introduce hosted services, authentication,
general effect delivery, synchronization, active-run migration, or capabilities beyond foreground
location. Physical-device evidence may remain pending when provider-free code verification is complete.
