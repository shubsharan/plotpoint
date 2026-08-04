# Tasks: Durable Offline Field Puzzle And Reusable Player Contract

**Input**: Design documents from `docs/features/0003-durable-offline-player/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Required by the feature's independent tests, reusable-contract claim, failure boundaries,
and measurable success criteria. This repository already contains an initial implementation; tasks
close contract and evidence gaps rather than recreate scaffolding.

## Phase 1: Baseline And Evidence Setup

**Purpose**: Preserve current provider-free evidence, prepare reusable conformance fixtures, and make
physical observations recordable before further hardening.

- [x] T001 Align generated debug-app commands and restrict native permissions to camera and foreground location in `apps/player/package.json` and `apps/player/app.json`
- [x] T002 Record the current provider-free baseline separately from revised-contract acceptance in `docs/features/0003-durable-offline-player/checklists/implementation.md`
- [x] T003 [P] Add reusable release, bridge, lifecycle, and fault fixtures in `apps/player/test/helpers/host-conformance.ts`
- [x] T004 [P] Create smoke-loop and final-loop evidence records for device, OS, release, run, and observed blockers in `docs/features/0003-durable-offline-player/evidence/physical-devices.md`

---

## Phase 2: Foundational Host API V1

**Purpose**: Establish the smallest cross-game player contract before story-specific behavior.

**Critical**: Host API Core is reusable; capability contracts, report projections, and SQLite layout
remain independently versioned or internal.

- [x] T005 Implement exact direction-specific bootstrap, transition, result, and host-error unions in `packages/protocol/src/player/bridge.ts`
- [x] T006 [P] Add accepted, no-op, rejected, recorded-invalid, duplicate, malformed, unsupported-version, and wrong-direction contract cases in `packages/protocol/test/player-contracts.test.ts`
- [x] T007 Implement generic versioned capability request/result dispatch without adding a capability catalog in `packages/protocol/src/player/bridge.ts`
- [x] T008 Derive aggregate schema and required capability compatibility from the verified release manifest in `apps/player/src/runtime/host-support.ts`
- [x] T009 Remove field aggregate identity, schema, and location assumptions from core bootstrap and transition routing in `apps/player/App.tsx` and `apps/player/src/bridge/host-bridge.ts`
- [x] T010 Prove the field puzzle and minimal local puzzle pass the same Host API V1 bootstrap and transition harness without player branches in `apps/player/test/host-conformance.test.ts`

**Checkpoint**: Two materially different releases exercise one Host API Core provider-free.

---

## Phase 3: User Story 1 - Install A Field Puzzle From Its Release (Priority: P1) MVP

**Goal**: Compile, serve, scan, verify, and atomically publish compatible releases while preserving
every prior playable installation on failure.

**Independent Test**: Install both conformance releases, disconnect, and launch offline; repeat the
highest-risk identity, compatibility, interruption, and prior-installation cases.

### Tests For User Story 1

- [x] T011 [P] [US1] Prove exact served bytes, invalid-input rejection, private-interface selection, and stable descriptors in `packages/compiler/test/integration/serve-release.test.ts`
- [x] T012 [P] [US1] Cover descriptor size, same-origin policy, combined deadline, streaming limit, redirects, identity mismatch, incompatibility, interrupted publication, and prior-install preservation in `apps/player/test/install-release.test.ts`

### Implementation For User Story 1

- [x] T013 [US1] Serve one verified captured artifact and stable descriptor from one eligible private IPv4 address in `packages/compiler/src/serve/serve-release.ts`
- [x] T014 [US1] Enforce URL, size, redirect, and combined network-deadline policy in `apps/player/src/install/native-adapters.ts`
- [x] T015 [US1] Publish unique ephemeral staging directories atomically and resolve same-release races idempotently in `apps/player/src/install/native-adapters.ts` and `apps/player/src/persistence/database.ts`
- [x] T016 [US1] Display exact release identity, manifest requirements, publication result, and actionable failure diagnostics in `apps/player/App.tsx`

**Checkpoint**: Both conformance releases install and launch offline without game-specific player code.

---

## Phase 4: User Story 2 - Complete A Location-Aware Puzzle Offline (Priority: P2)

**Goal**: Complete the release-owned field route offline, then run one early smoke loop on each physical
platform before exhaustive durability and report hardening.

**Independent Test**: Complete two checkpoints and the intervening puzzle with scripted observations;
then install, disconnect, play, restart once, export the current report, and record blockers on iOS and
Android.

### Tests For User Story 2

- [x] T017 [P] [US2] Validate exact location input, terminal output variants, signed age, geographic range, accuracy, and redacted report projection in `packages/protocol/test/player-contracts.test.ts`
- [x] T018 [P] [US2] Cover the complete route plus denial, unavailability, failure, future/stale time, poor accuracy, and out-of-radius outcomes in `examples/releases/field-puzzle/test/field-puzzle.test.ts`

### Implementation And Evidence For User Story 2

- [x] T019 [US2] Register Location V1 through generic capability dispatch and persist every terminal observation before delivery in `apps/player/src/location/foreground-location.ts` and `apps/player/src/bridge/host-bridge.ts`
- [x] T020 [US2] Keep coordinates, radii, freshness, accuracy, clues, and progression exclusively inside the release in `examples/releases/field-puzzle/src/config.ts` and `examples/releases/field-puzzle/src/commands/advance.ts`
- [x] T021 [US2] Exercise the complete disconnected route through the trusted WebView host with scripted observations in `apps/player/test/offline-route.test.ts`
- [ ] T022 [US2] Run one full field-puzzle smoke loop on a physical iOS device and record blockers in `docs/features/0003-durable-offline-player/evidence/physical-devices.md`
- [ ] T023 [US2] Run one full field-puzzle smoke loop on a physical Android device and record blockers in `docs/features/0003-durable-offline-player/evidence/physical-devices.md`

**Checkpoint**: Real platform evidence, not only interface sketches, determines remaining hardening.

---

## Phase 5: User Story 3 - Resume Accepted Progress Exactly Once (Priority: P3)

**Goal**: Preserve every canonical recorded terminal by command identity while only accepted changes
advance the snapshot and transition journal.

**Independent Test**: Interrupt immediately before and after the owning transaction, destroy the view,
restart the application, and deliver one command identity 100 times; accepted progress appears once and
invalid durable records fail closed.

### Tests For User Story 3

- [x] T024 [P] [US3] Cover all recorded terminals, stale host errors, missing observations, transaction faults, post-commit loss, and duplicate-100-times behavior in `apps/player/test/commit-transition.test.ts`
- [x] T025 [P] [US3] Cover altered releases, malformed snapshots, schema/version/journal mismatch, missing links, valid restart, and view recreation in `apps/player/test/recovery.test.ts`

### Implementation For User Story 3

- [x] T026 [US3] Validate the closed terminal-specific candidate union, target, schema, version, and same-run observations in `apps/player/src/persistence/validation.ts` and `apps/player/src/persistence/commit-transition.ts`
- [x] T027 [US3] Commit accepted receipt, next snapshot, journal, and observation links atomically while storing other canonical terminals as receipt-only results in `apps/player/src/persistence/database.ts`
- [x] T028 [US3] Reverify release identity and coherent durable records before bootstrap, failing closed with one internal run event in `apps/player/src/runtime/recovery.ts`
- [x] T029 [US3] Restore the original durable result after view or application recreation without reapplying transitions in `apps/player/App.tsx` and `apps/player/test/runtime-lifecycle.test.ts`

**Checkpoint**: Exactly-once behavior holds at the observed and specified durability boundaries.

---

## Phase 6: User Story 4 - Learn, Revise, And Start A Fresh Run (Priority: P4)

**Goal**: Export reusable core events plus capability-defined redacted projections, use the report for a
real game revision, and start a fresh run without changing player code.

**Independent Test**: Export successful, rejected, interrupted, and recovered evidence; inspect the
privacy boundary; revise one clue or location rule; install changed bytes; and retain the prior run.

### Tests For User Story 4

- [x] T030 [P] [US4] Validate ordered command, capability, lifecycle, and diagnostic report events plus location-specific redaction in `packages/protocol/test/player-contracts.test.ts`
- [x] T031 [P] [US4] Cover successful, rejected, interrupted, incoherent, missing-run, fresh-release, and forbidden-value cases in `apps/player/test/play-report.test.ts`

### Implementation And Evidence For User Story 4

- [x] T032 [US4] Store lifecycle, interruption, recovery, and diagnostic evidence in one minimal internal run-event representation in `apps/player/src/persistence/database.ts`
- [x] T033 [US4] Build stable core report events and validate capability-owned redacted projections in `apps/player/src/reports/create-play-report.ts`
- [x] T034 [US4] Centralize changed-release fresh-run creation with no migration or game-specific lifecycle inference in `apps/player/src/runtime/run-lifecycle.ts` and `apps/player/App.tsx`
- [x] T035 [US4] Record one report-driven field-game revision and complete two-release install, bootstrap, transition, recovery, and report conformance evidence in `docs/features/0003-durable-offline-player/evidence/report-driven-revision.md`

**Checkpoint**: Actual learning, not report-schema completion alone, closes the revision loop.

---

## Phase 7: Exit Hardening And Evidence

**Purpose**: Complete the remaining proportional boundary matrix after two-game and physical evidence.

- [x] T036 Complete remaining race, timeout, malformed-record, redaction, and compatibility fixtures and run `pnpm verify` with results recorded in `docs/features/0003-durable-offline-player/checklists/implementation.md`
- [ ] T037 Complete the field edit-to-revision loop a second time on physical iOS and record final evidence in `docs/features/0003-durable-offline-player/evidence/physical-devices.md`
- [ ] T038 Complete the field edit-to-revision loop a second time on physical Android and record final evidence in `docs/features/0003-durable-offline-player/evidence/physical-devices.md`
- [x] T039 Reconcile Host API conformance, provider-free verification, both physical loops, and documentation without marking unmet evidence complete in `docs/features/0003-durable-offline-player/checklists/implementation.md`

---

## Dependencies And Execution Order

```text
Baseline -> Host API V1 -> US1 install -> US2 field play -> early iOS/Android smoke
                                      -> US3 durability -> US4 learning -> exit hardening
```

- Host API V1 requires two-game provider-free evidence before it is treated as reusable.
- US1 depends on Host API Core; US2 depends on installed offline releases.
- Early physical smoke loops inform US3 and US4 but are not final acceptance.
- Provider-free durability work may continue if device access is temporarily unavailable, but the
  missing smoke evidence remains an explicit external blocker rather than an architecture dependency.
- Final iOS and Android loops may run in parallel after provider-free verification passes.

## Parallel Execution Examples

```text
Host API: T006 contract cases can run alongside T008 manifest-derived support.
US1: T011 server tests can run alongside T012 installation tests.
US2: T017 location contract tests can run alongside T018 field-game tests.
US3: T024 transition faults can run alongside T025 recovery faults.
US4: T030 report contract tests can run alongside T031 database-backed report tests.
Exit: T037 iOS and T038 Android can run in parallel after T036.
```

## Implementation Strategy

1. **Reusable core**: prove one Host API with two releases before expanding internals.
2. **MVP**: install and launch both releases offline.
3. **Field evidence**: complete one imperfect loop per platform early and record blockers.
4. **Durability**: harden only the command, recovery, and report boundaries pulled by the loop.
5. **Learning**: use a real report to revise the game and start a fresh run.
6. **Exit**: finish the remaining matrix and second physical loop on each platform.

Keep one local aggregate, one registered native capability, trusted single-WebView execution, and no
hosted services, synchronization, generalized effects, active-run migration, or external creator code.
