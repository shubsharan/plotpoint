# Tasks: Unified Game Composition

**Input**: Design documents from `docs/features/0005-unified-game-composition/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: The feature specification requires contract, type, replay, interruption, recovery,
redaction, external-consumer, and installed-player acceptance evidence. Within every phase, write the
listed tests first and confirm that they fail for the intended missing behavior before implementing the
corresponding production change.

**Organization**: Phase 1 establishes failing vertical acceptance fixtures before contract work. The
two P1 stories are then ordered by dependency: US2 establishes the coherent compiled composition
consumed by US1's runnable co-op game. Shared runtime/protocol prerequisites stay in the blocking
foundation. No task introduces a second schema generation, compatibility layer, or broader trusted
mechanic registry.

**Reconciled baseline**: These tasks are rebased on commit `e6b7010`, where `co-op-game/` and
`packages/protocol/test/shared-play.test.ts` already exist. Tasks extend, replace, or verify those
surfaces; they do not repeat completed renames. All tasks remain unchecked because the complete
contract behavior and required evidence are not yet implemented at this baseline.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: May run in parallel after the task's stated phase prerequisites because it changes different
  files and does not depend on another incomplete task in the same group.
- **[Story]**: Maps implementation and evidence to the user story in `spec.md`.
- Every task names the exact repository path or paths it owns.

## Phase 1: Setup and Failing Vertical Journeys

**Purpose**: Verify the merged co-op reference baseline and make the product journeys executable as
failing tests before building lower-level contracts.

- [x] T001 Verify the existing `examples/releases/co-op-game/` rename is complete and remove any remaining `team-session-hunt` references while preserving the current workspace, type-check, and Vitest project surfaces in `pnpm-workspace.yaml`, `vitest.config.ts`, `examples/releases/co-op-game/package.json`, and `examples/releases/co-op-game/tsconfig.json`
- [x] T002 [P] Add failing installed-player acceptance fixtures proving the field puzzle and co-op game each validate, compile, install, and mount through generated Game Composition in `apps/player/test/installed-game-acceptance.test.ts` and `packages/compiler/test/integration/game-composition.test.ts`
- [x] T003 [P] Add a failing field-puzzle vertical fixture that executes one observed local action through the compiled artifact, generated runtime adapter, production host handlers, SQLite commit, WebView recreation, recovery, and generic report export in `apps/player/test/field-puzzle-acceptance.test.ts` and `apps/player/test/offline-route.test.ts`
- [x] T004 [P] Add a failing co-op vertical fixture that joins three participants, discovers every configured target, interrupts and restarts shared play, exports only generic `rejected`/`expired` evidence, revises observation freshness, compiles a distinct release, creates a fresh session, and completes the revised game in `examples/releases/co-op-game/test/co-op-game.test.ts` and `apps/api/test/co-op-game.acceptance.test.ts`

**Checkpoint**: Both installed games have vertical tests, and each test fails at a named missing seam
rather than at fixture setup or an obsolete example path.

---

## Phase 2: Foundational Contracts (Blocking Prerequisites)

**Purpose**: Establish corrected serialized contracts with plain stable names and one typed runtime boundary
used by every story.

**CRITICAL**: No user-story implementation begins until this phase is complete and its contract tests
pass.

### Failing Contract Tests

- [x] T005 [P] Add failing type/behavior tests for plain unsuffixed runtime/schema names, digest-bound schema identity without per-schema generations, authority-kind constraints, safe command/model erasure, stable initializer failure diagnostics including `initializer-threw` with no partial aggregate, and exact `ExecutionResult<State, Outcome, Payload, Kind>` ordering in `packages/runtime/test/aggregate-contracts.type-test.ts`, `packages/runtime/test/contracts.type-test.ts`, and `packages/runtime/test/execute-command.test.ts`
- [x] T006 [P] Add failing closed-shape tests for plain Game Composition, Host API bootstrap/transition payloads without repeated version fields, plain Game Play Report, mandatory composition inspection, boundary-owned project/release/Host API compatibility constants with no exported universal catalog, plain public exports, and rejected superseded shapes in `packages/protocol/test/contracts.type-test.ts`, `packages/protocol/test/player-contracts.test.ts`, `packages/protocol/test/inspection.test.ts`, `packages/protocol/test/public-api.test.ts`, and `packages/protocol/test/release-format.test.ts`
- [x] T007 [P] Add failing strict Project Configuration fixtures for plain schema/progression/mechanic identities without per-entry generations, one-way model relationships, initializer-content schema agreement, authority-kind mismatch, duplicate derived command types, and rejected superseded configuration in `packages/compiler/test/unit/project.test.ts`, `packages/compiler/test/integration/invalid-projects.test.ts`, and `packages/compiler/test/fixtures/projects/invalid/configuration/`
- [x] T008 [P] Add failing clean-break and recovery tests proving incompatible local/shared schemas surface reset-or-reinstall guidance without migration or silent deletion and corrected snapshots retain exact aggregate/model/schema identity, progression, events/effects, complete records, and state versions in `apps/player/test/database-upgrade.test.ts`, `apps/player/test/database-observation-migration.test.ts`, `apps/player/test/commit-transition.test.ts`, and `apps/player/test/recovery.test.ts`

### Foundational Implementation

- [x] T009 [P] Define plain `RuntimeSchema`, `ResolvedCommandBinding`, `ResolvedAggregateModel`, `ExecutableAggregateModel`, aggregate, progression, and initialization result types; remove generation-suffixed aliases and per-schema/per-graph generation fields in `packages/runtime/src/aggregate-model.ts`, `packages/runtime/src/aggregates.ts`, `packages/runtime/src/commands.ts`, `packages/runtime/src/execution-record.ts`, and `packages/runtime/src/progression/graph.ts`
- [x] T010 Construct payload-narrowing command bindings and state-narrowing executable model wrappers, route model-owned initialization/execution through them, contain raw initializer exceptions as stable `initializer-threw` invalid results, and export the supported surface in `packages/runtime/src/aggregate-model.ts`, `packages/runtime/src/execute-command.ts`, and `packages/runtime/src/index.ts`
- [x] T011 [P] Define and parse plain mandatory Game Composition descriptors/resources at `composition/game.json` plus the composition-aware inspection result without per-catalog/per-schema generation fields or duplicated manifest Host API/capabilities in `packages/protocol/src/release/game-composition.ts`, `packages/protocol/src/release/paths.ts`, `packages/protocol/src/release/types.ts`, `packages/protocol/src/release/inspect.ts`, and `packages/protocol/src/index.ts`
- [x] T012 Remove the universal `CONTRACT_VERSIONS` catalog and its public types, move release-format and Host API constants beside their owning boundaries, remove unsupported install/body/per-observation/report counters, and update direct host/install consumers in `packages/protocol/src/contract-versions.ts`, `packages/protocol/src/index.ts`, `packages/protocol/src/player.ts`, `packages/protocol/src/release/types.ts`, `packages/protocol/src/release/create.ts`, `packages/protocol/src/release/manifest.ts`, `packages/protocol/src/player/bridge.ts`, `packages/protocol/src/player/install.ts`, `packages/protocol/src/player/report.ts`, `packages/compiler/src/serve/serve-release.ts`, `apps/player/src/runtime/host-support.ts`, `apps/player/src/bridge/host-bridge.ts`, `apps/player/src/runtime/bootstrap.ts`, and `apps/player/src/location/foreground-location.ts`
- [x] T013 Replace the compiler's old entry registries with strict Project Configuration application/model/command/progression/component/mechanic registrations using plain logical IDs, a project-format constant owned by the project-configuration boundary, and one-way validation in `packages/compiler/src/project/config.ts`, `packages/compiler/src/project/load-project.ts`, `packages/compiler/src/composition/registries.ts`, and `packages/compiler/src/composition/validate-references.ts`
- [x] T014 Generate fixed `application`, `components`, and local `aggregateModels` roots plus the mandatory canonical catalog and manifest capability-equality check in `packages/compiler/src/composition/generated-entries.ts`, `packages/compiler/src/composition/inspect-definitions.ts`, `packages/compiler/src/bundle/bundle-release.ts`, and `packages/compiler/src/release/assemble.ts`
- [x] T015 [P] Replace additive legacy database upgrades with an explicit corrected-schema gate and stable reset/reinstall failure while preserving same-schema restart recovery and validating exact model/schema/progression/record identities in `apps/player/src/model.ts`, `apps/player/src/persistence/database.ts`, `apps/player/src/persistence/validation.ts`, `apps/player/src/runtime/recovery.ts`, and `apps/player/src/shared/database.ts`
- [x] T016 Update reusable aggregate-model fixtures, runtime harness construction, replay helpers, and public exports to the plain runtime/schema names with no compatibility aliases in `packages/testkit/src/aggregate-fixtures.ts`, `packages/testkit/src/runtime-harness.ts`, `packages/testkit/src/replay.ts`, and `packages/testkit/src/index.ts`

**Checkpoint**: Runtime, protocol, compiler loading, clean database opening, and testkit compile against
one corrected contract set; superseded shapes fail rather than adapt.

---

## Phase 3: User Story 2 - Author One Coherent Game Definition (Priority: P1)

**Goal**: Compile and inspect four valid projects from data-only definitions with no duplicate author
registries or unresolved platform-visible dependencies.

**Independent Test**: Validate, compile, inspect, verify, reproduce, and serve the field puzzle,
minimal local puzzle, branching media tour, and co-op game; install and mount the field puzzle and
co-op game through generated composition; reject malformed, legacy, and unselected server contracts
before publication.

### Failing Tests for User Story 2

- [x] T017 [P] [US2] Add failing compiler contract tests for plain application/schema/logical names, single-owner command/progression/mechanic relationships, exact initialization schemas, component dependency scopes, and manifest capability equality in `packages/compiler/test/unit/game-composition.test.ts` and `packages/compiler/test/fixtures/projects/invalid/composition/`
- [x] T018 [P] [US2] Expand the failing four-example matrix across compile, inspect, verify, reproducibility, serving, CLI, external-project, and golden-output coverage in `packages/compiler/test/integration/compile-release.test.ts`, `packages/compiler/test/integration/inspect-release.test.ts`, `packages/compiler/test/integration/verify-release.test.ts`, `packages/compiler/test/integration/reproducibility.test.ts`, `packages/compiler/test/integration/serve-release.test.ts`, `packages/compiler/test/integration/cli.test.ts`, `packages/compiler/test/helpers/external-project.ts`, and `packages/compiler/test/fixtures/expected/`
- [x] T019 [P] [US2] Add failing WebView lifecycle tests for static application validation, runtime handle validation, reverse exactly-once mount cleanup, scoped dependency maps, and component-only state reads/subscriptions in `apps/player/test/runtime-composition.test.ts` and `apps/player/test/bootstrap.test.ts`
- [x] T020 [P] [US2] Add failing clean-break compiler fixtures proving discarded configuration roots and unselected server models, commands, or progressions are rejected deterministically in `packages/compiler/test/integration/invalid-projects.test.ts` and `packages/compiler/test/fixtures/projects/invalid/configuration/`

### Implementation for User Story 2

- [x] T021 [P] [US2] Implement application/model/component/mechanic definition inspection and stable missing/mismatch diagnostics in `packages/compiler/src/composition/inspect-definitions.ts`, `packages/compiler/src/composition/validate-references.ts`, and `packages/compiler/src/diagnostics/codes.ts`
- [x] T022 [US2] Build canonical Game Composition descriptors/resource bindings with stable plain names from validated registries and inventory paths in `packages/compiler/src/composition/game-composition.ts`, `packages/compiler/src/release/entry-paths.ts`, and `packages/compiler/src/release/assemble.ts`
- [x] T023 [US2] Replace author default roots with compiler-generated fixed registry maps and prove catalog-to-executable key agreement during bundling in `packages/compiler/src/composition/generated-entries.ts`, `packages/compiler/src/bundle/rolldown-plugin.ts`, and `packages/compiler/src/bundle/bundle-release.ts`
- [x] T024 [US2] Expose composition-aware `plotpoint inspect` JSON/human output while keeping low-level Release Format inspection game-agnostic in `packages/compiler/src/cli.ts`, `packages/compiler/src/index.ts`, and `packages/protocol/src/release/inspect.ts`
- [x] T025 [P] [US2] Implement the generated runtime adapter, player-owned mount scope, and component factories with scoped local/shared/resource/capability contexts in `apps/player/src/runtime/composition.ts`, `apps/player/src/runtime/local-model-adapter.ts`, `apps/player/src/runtime/mount-scope.ts`, and `apps/player/src/runtime/bootstrap.ts`
- [x] T026 [P] [US2] Rewrite the field puzzle as corrected Project Configuration with plain schema/command/progression/component IDs, a generated application, local model initializer, command, progression, and scoped component in `examples/releases/field-puzzle/plotpoint.project.json`, `examples/releases/field-puzzle/src/application.ts`, `examples/releases/field-puzzle/src/initial-state.ts`, `examples/releases/field-puzzle/src/components/puzzle.ts`, `examples/releases/field-puzzle/src/commands/advance.ts`, and `examples/releases/field-puzzle/src/progression/route.ts`
- [x] T027 [P] [US2] Rewrite the minimal local puzzle as corrected Project Configuration with plain schema/command/progression/component IDs, a generated application, local model initializer, command, progression, and scoped component in `examples/releases/minimal-local-puzzle/plotpoint.project.json`, `examples/releases/minimal-local-puzzle/src/application.ts`, `examples/releases/minimal-local-puzzle/src/initial-state.ts`, `examples/releases/minimal-local-puzzle/src/commands/solve.ts`, `examples/releases/minimal-local-puzzle/src/progression/main.ts`, and `examples/releases/minimal-local-puzzle/src/components/puzzle.ts`
- [x] T028 [P] [US2] Rewrite the branching media tour as corrected Project Configuration with plain schema/command/progression/component IDs, generated application/model initialization, commands, progression, and scoped components in `examples/releases/branching-media-tour/plotpoint.project.json`, `examples/releases/branching-media-tour/src/application.ts`, `examples/releases/branching-media-tour/src/initial-state.ts`, `examples/releases/branching-media-tour/src/commands/choose-scene.ts`, `examples/releases/branching-media-tour/src/commands/play-media.ts`, `examples/releases/branching-media-tour/src/progression/route.ts`, `examples/releases/branching-media-tour/src/components/media-panel.ts`, and `examples/releases/branching-media-tour/src/components/scene-navigator.ts`
- [x] T029 [P] [US2] Rewrite the co-op game as corrected Project Configuration with plain schema/command/component/mechanic IDs, selecting exactly one local/player shell model, one server/team target-discovery model, the target-discovery trusted command set, and no progression in `examples/releases/co-op-game/plotpoint.project.json`, `examples/releases/co-op-game/src/application.ts`, `examples/releases/co-op-game/src/initial-state.ts`, `examples/releases/co-op-game/src/components/clue-board.ts`, and `examples/releases/co-op-game/src/components/session-console.ts`
- [x] T030 [US2] Remove superseded `src/logic.ts` and `src/presentation.ts` roots from all four valid examples; remove the co-op game's unselected `src/commands/advance-round.ts`, `src/commands/solve-clue.ts`, `src/progression/session-rounds.ts`, `src/progression/team-route.ts`, their command schemas, and the unused round/session material from `examples/releases/co-op-game/`; retain discarded configurations only as explicit invalid clean-break fixtures in `packages/compiler/test/fixtures/projects/invalid/configuration/`
- [x] T031 [US2] Update every four-example compile, inspect, verify, reproducibility, serving, CLI, external-project, and golden-output fixture for corrected Project Configuration and plain logical IDs in `packages/compiler/test/integration/compile-release.test.ts`, `packages/compiler/test/integration/inspect-release.test.ts`, `packages/compiler/test/integration/verify-release.test.ts`, `packages/compiler/test/integration/reproducibility.test.ts`, `packages/compiler/test/integration/serve-release.test.ts`, `packages/compiler/test/integration/cli.test.ts`, `packages/compiler/test/helpers/external-project.ts`, and `packages/compiler/test/fixtures/expected/`
- [x] T032 [US2] Complete the field-puzzle installed-player acceptance through its compiled artifact, generated runtime adapter, production host handlers, SQLite commit, WebView recreation, recovery, and generic report export, and remove superseded `logic`/`presentation` imports from `apps/player/test/field-puzzle-acceptance.test.ts`, `apps/player/test/offline-route.test.ts`, and `examples/releases/field-puzzle/test/field-puzzle.test.ts`

**Checkpoint**: All four valid projects independently compile and inspect through one authoritative
composition; the two installed-player games mount through generated roots; unknown, duplicated,
legacy, and unselected server relationships fail deterministically.

---

## Phase 4: User Story 1 - Play the Co-op Game as One Release (Priority: P1)

**Goal**: Install, mount, join, and play the minimal target-discovery co-op game through the ordinary
release/player/shared-session lifecycle with no game-specific player routing, decorative progression,
or release-authored server execution.

**Independent Test**: Compile and install the co-op game, create a release-pinned generic shared
session, join three participants, render the confirmed team projection, and submit one
persisted-location target discovery from the mounted game UI. The complete two-release journey closes
after recovery, release pinning, and reporting land.

### Failing Tests for User Story 1

- [x] T033 [P] [US1] Add failing closed trusted-mechanic registry tests for binding/config/model/schema digest agreement, explicit validation/authorization/projection results, exact `{ code }` outcomes, and no server progression in `packages/modules/test/trusted-mechanics.test.ts` and `packages/modules/test/target-discovery.test.ts`
- [x] T034 [P] [US1] Add failing release registration and generic shared-session API tests for adapter resolution, configuration initialization, complete `/v1/...` routes without body-level API versions, command dispatch, projection validation, and stable safe errors in `apps/api/test/release-registration.test.ts`, `apps/api/test/shared-session.test.ts`, and `apps/api/test/server.test.ts`
- [x] T035 [P] [US1] Add failing player integration tests for composition-derived join visibility, scoped Shared Play contexts, generic command dispatch, mount failure rollback, and absence of shared UI for local-only releases in `apps/player/test/runtime-composition.test.ts`, `apps/player/test/shared-play.test.ts`, and `apps/player/test/production-handlers.test.ts`
- [x] T036 [P] [US1] Extend the co-op vertical fixture through compile, install, mount, three-player join, confirmed view, and one persisted-location target discovery in `examples/releases/co-op-game/test/co-op-game.test.ts`, `apps/player/test/installed-game-acceptance.test.ts`, and `apps/api/test/postgres.integration.test.ts`

### Implementation for User Story 1

- [x] T037 [US1] Implement the closed typed trusted-mechanic registry with plain adapter identities and an erased authority-kind-safe resolver, removing generation-suffixed adapter exports without aliases in `packages/modules/src/trusted-mechanics.ts` and `packages/modules/src/index.ts`
- [x] T038 [US1] Move target discovery behind the adapter's explicit binding, initialization, authorization, runtime-command, and complete projection results with digest-bound validators from `packages/modules/src/hunt/target-discovery.ts` to `packages/modules/src/mechanics/target-discovery.ts`
- [x] T039 [US1] Replace the game-specific service in `apps/api/src/hunt-service.ts` with release/composition registration and a generic shared-session service using the selected platform model in `apps/api/src/shared-session-service.ts` and `apps/api/src/index.ts`
- [x] T040 [US1] Replace public game-specific session routes/operator calls with complete `/v1/releases` and `/v1/shared-sessions/...` creation, invitation, join, revoke, command, and pull operations, using the route prefix as the sole HTTP compatibility boundary and no request/response body version, in `apps/api/src/server.ts` and `apps/api/src/operator-client.ts`
- [x] T041 [P] [US1] Mount verified generated applications and derive generic native join/shared/recovery surfaces only from Game Composition in `apps/player/App.tsx`, `apps/player/src/runtime/production-handlers.ts`, `apps/player/src/shared/host-bridge.ts`, and `apps/player/src/shared/http-client.ts`
- [x] T042 [US1] Wire the co-op application/components only to the declared target-discovery command, foreground capability, confirmed team projection, and cleanup scope in `examples/releases/co-op-game/src/application.ts`, `examples/releases/co-op-game/src/components/clue-board.ts`, and `examples/releases/co-op-game/src/components/session-console.ts`

**Checkpoint**: The co-op game completes its first shared action through generic compiled, player,
API, and platform-mechanic paths; the field puzzle still mounts without shared UI.

---

## Phase 5: User Story 3 - Express Durable Logic and Progression Consistently (Priority: P2)

**Goal**: Make local and authoritative commands share one deterministic model contract with explicit
semantic decisions, safe heterogeneous registries, optional progression, and exact replay.

**Independent Test**: Exercise accepted state/progression/event/effect changes, no-op, rejection,
preflight invalidity, recorded execution invalidity, heterogeneous progression triggers, replay, and a
game that omits progression.

### Failing Tests for User Story 3

- [ ] T043 [P] [US3] Add failing runtime and local-persistence tests for explicit no-op, state/progression/event/effect-only acceptance, stable initializer exceptions, outcome/event/effect validation, exact state-version changes, preflight versus recorded invalidity, complete commit/recovery records, and 100 mutation-free preflight repeats in `packages/runtime/test/execute-command.test.ts`, `packages/runtime/test/effect-boundary.test.ts`, `packages/runtime/test/observation-consumption.test.ts`, `apps/player/test/commit-transition.test.ts`, and `apps/player/test/recovery.test.ts`
- [ ] T044 [P] [US3] Add failing progression tests for named edges, canonical `initialProgression`, state/event/progression-only automatic facts, heterogeneous commands, deterministic conflicts/cycles/limits, and progression omission in `packages/runtime/test/progression/evaluate-progression.test.ts`, `packages/runtime/test/progression/progression-failures.test.ts`, and `packages/runtime/test/progression/validate-graph.test.ts`
- [ ] T045 [P] [US3] Add failing type/adversarial tests proving erased registries cannot call typed handlers before schema narrowing and replay compares complete canonical records in `packages/testkit/test/fixture-contracts.type-test.ts`, `packages/testkit/test/replay.test.ts`, and `packages/testkit/test/runtime-harness.test.ts`
- [ ] T046 [P] [US3] Add failing local/shared representative-model acceptance covering every terminal and optional progression in `packages/testkit/test/quickstart.integration.test.ts`, `examples/releases/field-puzzle/test/field-puzzle.test.ts`, and `packages/modules/test/target-discovery.test.ts`

### Implementation for User Story 3

- [ ] T047 [US3] Implement accepted/no-op/rejected decisions, event/effect-only commit classification, schema validation, and exact state-version recording in `packages/runtime/src/commands.ts`, `packages/runtime/src/execute-command.ts`, and `packages/runtime/src/execution-record.ts`
- [ ] T048 [US3] Replace payload/outcome-coupled progression rules with named transitions, canonical initial instances, aggregate/event/progression facts, and bounded deterministic stabilization in `packages/runtime/src/progression/graph.ts`, `packages/runtime/src/progression/state.ts`, `packages/runtime/src/progression/validate-graph.ts`, and `packages/runtime/src/progression/evaluate-progression.ts`
- [ ] T049 [US3] Update testkit model builders, scripted observations, strict assertions, and replay to use complete resolved models and execution records in `packages/testkit/src/aggregate-fixtures.ts`, `packages/testkit/src/scripted-observations.ts`, `packages/testkit/src/assertions.ts`, and `packages/testkit/src/replay.ts`
- [ ] T050 [US3] Update the field-puzzle command and progression to the plain runtime API without duplicate phase state, graph generations, or caller-built initial progression in `examples/releases/field-puzzle/src/commands/advance.ts` and `examples/releases/field-puzzle/src/progression/route.ts`
- [ ] T051 [P] [US3] Map complete runtime records to corrected Host API transitions and atomically persist/recover exact aggregate/model/schema identity, state, optional progression, events/effects, terminal, and prior/resulting state versions without game-specific protocol glue in `apps/player/src/model.ts`, `apps/player/src/runtime/local-model-adapter.ts`, `apps/player/src/runtime/production-handlers.ts`, `apps/player/src/persistence/database.ts`, `apps/player/src/persistence/validation.ts`, `apps/player/src/persistence/commit-transition.ts`, `apps/player/src/runtime/recovery.ts`, and `apps/player/src/runtime/transition-result.ts`

**Checkpoint**: Local and server models independently preserve every semantic terminal and exact state
version through execution, persistence, and replay; the co-op reference demonstrates intentional
progression omission.

---

## Phase 6: User Story 4 - Disconnect, Restart, and Converge Exactly Once (Priority: P2)

**Goal**: Drain a finite start-eligible batch, serialize foreground synchronization per session, and
apply normal/corrective/revoked snapshots atomically and idempotently across interruption.

**Independent Test**: Queue multiple commands, interrupt every claim/submit/pull/commit boundary,
overlap all trigger types, and repeatedly apply normal/corrective/revoked pulls while proving one exact
terminal per action and byte-equivalent final SQLite state.

### Failing Tests for User Story 4

- [ ] T052 [P] [US4] Add failing SQLite interruption tests for atomic finite batch claim/failure, stable ordering, later enqueue deferral, compare-or-insert terminals, duplicate collection rejection, and failure-atomic snapshot replacement in `apps/player/test/shared-recovery.test.ts`
- [ ] T053 [P] [US4] Add failing scheduler tests for one active pass per session, a stable per-session drain promise, a trigger after batch claim that awaits its coalesced trailing pass, further-trigger coalescing, different-session independence, pure reads, and restart recovery in `apps/player/test/shared-sync-coordinator.test.ts`
- [ ] T054 [P] [US4] Add failing revocation/correlation tests for authenticated errors and revoked snapshots, irreversible `active -> revoked` membership, stale active snapshot rejection, blocked outbox preservation, credential deletion after commit, malformed envelopes, semantic failures, and request-ID echo in `apps/player/test/shared-play.test.ts` and `apps/player/test/host-conformance.test.ts`
- [ ] T055 [P] [US4] Add a failing 100-iteration response-loss and repeated normal/corrective/revoked/stale-active pull acceptance matrix proving byte-equivalent idempotency and no reactivation in `apps/player/test/shared-recovery.acceptance.test.ts`

### Implementation for User Story 4

- [ ] T056 [US4] Implement `beginSubmissionBatch`/`failSubmissionBatch` as exclusive finite claims over `queued | submitting | blocked-revoked` rows with honest durable sync status in `apps/player/src/shared/database.ts`
- [ ] T057 [US4] Implement duplicate-free validated compare-or-insert results, full projection replacement, matched outbox removal, cursor/member/status commit, idempotent corrective/revoked application, and rejection of `revoked -> active` candidates in `apps/player/src/shared/database.ts`
- [ ] T058 [US4] Replace the unbounded loop with a long-lived keyed single-flight scheduler whose stable per-session drain promise submits each claimed command once, pulls once per pass, and includes the coalesced trailing pass covering any trigger after claim in `apps/player/src/shared/sync-coordinator.ts`
- [ ] T059 [US4] Route post-commit enqueue, foreground, offline-to-reachable reconnect, and explicit retry through the stable scheduler while keeping shared view reads pure in `apps/player/App.tsx`, `apps/player/src/shared/host-bridge.ts`, and `apps/player/src/shared/session-controller.ts`
- [ ] T060 [US4] Apply terminal error/snapshot revocation atomically before removing SecureStore credentials, reject stale active reactivation for the same credential key, and emit only redacted durable notifications after commit in `apps/player/src/shared/database.ts`, `apps/player/src/shared/sync-coordinator.ts`, and `apps/player/src/shared/credentials.ts`
- [ ] T061 [US4] Implement two-stage envelope-then-semantic parsing in the shared host bridge, preserve a valid request ID on every semantic error, and route all shared bridge failures through the same correlated response path in `apps/player/src/shared/host-bridge.ts` and `apps/player/App.tsx`

**Checkpoint**: Every finite sync pass terminates, concurrent triggers coalesce, restart recovers durable
work, repeated snapshots converge exactly once, and every parseable shared request receives a
correlated response.

---

## Phase 7: User Story 5 - Enforce Release-Pinned Shared Play (Priority: P3)

**Goal**: Reserve one exact pending-or-bound session per installed run and expose shared state only when
all run/release/session/participant/team/origin/credential identities and monotonic membership agree.

**Independent Test**: Exercise fresh, duplicate, response-lost, parallel changed, wrong-release,
wrong-session, wrong-team, changed-origin, changed-credential, changed-run, and revoked-to-active
joins/pulls; only exact retries persist and prior playable state remains unchanged on conflict.

### Failing Tests for User Story 5

- [ ] T062 [P] [US5] Extend the existing `packages/protocol/test/shared-play.test.ts` fixture and add failing protocol/API tests for plain request/response names without repeated body versions, complete `/v1/...` paths, `expectedReleaseId`, release check before invitation consumption, exact join digest retry, internally coherent join/snapshot identity, and safe mismatch errors in `apps/api/test/shared-session.test.ts` and `apps/api/test/postgres.integration.test.ts`
- [ ] T063 [P] [US5] Add failing SQLite tests for pending join states, one pending-or-bound row per run, immutable run/release/session/participant/team/origin/credential-key guards, exact pending reuse, parallel conflict before submission, irreversible revocation, stale active retries, and incompatible identity rollback in `apps/player/test/shared-join-recovery.test.ts`
- [ ] T064 [P] [US5] Add failing SecureStore/controller interruption tests for reserve-before-secret, secret-before-send, ready/submitting exact retry, response loss, invitation cleanup ordering, and retained mismatch attempts in `apps/player/test/shared-session-controller.test.ts`
- [ ] T065 [P] [US5] Add failing join/pull acceptance fixtures for every run/release/session/participant/team/origin/credential mismatch, revoked-to-active attempt, and fresh-release/fresh-session behavior in `apps/player/test/release-pinned-shared-play.test.ts`

### Implementation for User Story 5

- [ ] T066 [P] [US5] Add `expectedReleaseId` and exact release-pinned plain join request/response validation to Shared Session API, remove repeated request/response/Sync version fields while keeping `/v1` as the centralized route boundary, and reject mismatch before invitation mutation in `packages/protocol/src/shared/types.ts`, `packages/protocol/src/shared/validation.ts`, `apps/api/src/shared-session-service.ts`, and `apps/api/src/server.ts`
- [ ] T067 [P] [US5] Add pending-join storage, unique run reservation, pending-versus-binding guards, immutable run/release/session/participant/team/origin/credential-key triggers, and monotonic active-to-revoked membership guards in `apps/player/src/shared/database.ts`
- [ ] T068 [US5] Persist exact request provenance and SecureStore key references before send, resume the same ready/submitting request after restart, and clean invitation secrets only after atomic binding commit in `apps/player/src/shared/session-controller.ts`, `apps/player/src/shared/credentials.ts`, and `apps/player/src/shared/http-client.ts`
- [ ] T069 [US5] Enforce run/release/session/participant/team/origin/credential-key equality before fresh join commit and every pull, preserve immutable binding fields on exact retry, reject stale active candidates after revocation, and expose no projection on conflict in `apps/player/src/shared/database.ts` and `apps/player/src/shared/session-controller.ts`

**Checkpoint**: Shared play is release-pinned, exact retry is recoverable, and no changed identity can
rebind or partially mutate an installed run.

---

## Phase 8: Complete Journeys and Cross-Cutting Evidence

**Purpose**: Close the common report, privacy, architecture, full product-loop, and fresh native
verification gates after all player, WebView, SecureStore, and shared-UI changes are complete.

- [ ] T070 Add failing deterministic chronology, command-alias, local/shared evidence, generic `rejected`/`expired` evidence, plain report shape without a per-report version, report-safe diagnostic, constant-alias omission, rejected `SharedHuntReport`, and adversarial redaction tests in `apps/player/test/game-play-report.test.ts`, `packages/protocol/test/player-contracts.test.ts`, and `packages/protocol/test/shared-play.test.ts`
- [ ] T071 Replace local/game-specific report selection with one host-owned plain Game Play Report derived only from committed evidence; remove superseded report builders and the public shared report contract/exports/tests in `apps/player/src/reports/create-game-play-report.ts`, `apps/player/src/reports/create-play-report.ts`, `apps/player/src/reports/create-shared-hunt-report.ts`, `packages/protocol/src/player/report.ts`, `packages/protocol/src/shared/report.ts`, `packages/protocol/src/index.ts`, `packages/protocol/src/player.ts`, `packages/protocol/test/shared-play.test.ts`, and `apps/player/App.tsx`
- [ ] T072 [P] Add static architecture and clean-break tests preventing server release imports, game-specific player routing, duplicate author registries, composition-less playable releases, superseded shape readers, automatic database reset, unselected server contracts, a universal contract-version catalog, per-contract counters, and repository-owned generation suffixes outside the centralized `/v1` route in `apps/api/test/architecture.test.ts`, `packages/protocol/test/public-api.test.ts`, `packages/compiler/test/integration/invalid-projects.test.ts`, and `apps/player/test/runtime-lifecycle.test.ts`
- [ ] T073 Complete both installed-player vertical acceptances: the field puzzle executes, persists, recreates, recovers, and exports a generic report; the co-op game discovers every configured target with three participants across disconnect/restart, exports only safe generic evidence, revises freshness configuration, compiles a distinct release, starts a fresh session, and completes in `apps/player/test/field-puzzle-acceptance.test.ts`, `examples/releases/co-op-game/test/co-op-game.test.ts`, and `apps/api/test/co-op-game.acceptance.test.ts`
- [ ] T074 Prepare `docs/features/0005-unified-game-composition/evidence/implementation.md` to record the provider-free, four-example quickstart, PostgreSQL/recovery, and native results without pre-claiming them, including an explicit physical-device `NOT RUN` status
- [ ] T075 Run the focused PostgreSQL/Testcontainers suites, the 100-iteration shared-recovery suite, the four-example public validate/compile/inspect/verify/byte-reproduction quickstart, `pnpm verify`, and `git diff --check`, then record the exact commands and results in `docs/features/0005-unified-game-composition/evidence/implementation.md`
- [ ] T076 After T071-T075, run `pnpm --filter @plotpoint/player exec expo run:ios --device "iPhone 17 Pro" --no-bundler`, verify simulator build/install/launch, and record fresh iOS evidence in `docs/features/0005-unified-game-composition/evidence/implementation.md`
- [ ] T077 After T071-T076, run `ANDROID_HOME=/Users/shubhankarsharan/Library/Android/sdk pnpm --filter @plotpoint/player exec expo run:android --device Plotpoint_API_36 --no-bundler`, verify emulator build/install/launch, and record fresh Android evidence plus physical-device `NOT RUN` in `docs/features/0005-unified-game-composition/evidence/implementation.md`

---

## Dependencies and Execution Order

### Phase Dependencies

```text
Phase 1 Failing Vertical Journeys
  -> Phase 2 Foundational Contracts
      -> Phase 3 US2 Coherent Definition
          -> Phase 4 US1 Runnable Co-op Game
              -> Phase 6 US4 Shared Recovery
              -> Phase 7 US5 Release-Pinned Play
      -> Phase 5 US3 Durable Logic and Progression

US4 + US5 + US3 -> Phase 8 Complete Journeys and Evidence
```

- **Setup (Phase 1)** has no dependency; T002-T004 begin only after the rename in T001.
- **Foundational (Phase 2)** depends on Phase 1 and blocks all story implementation.
- **US2 (Phase 3)** starts after Phase 2 and establishes the composition consumed by US1.
- **US1 (Phase 4)** depends on US2 and the foundation.
- **US3 (Phase 5)** depends only on the foundation and may run in parallel with US2/US1.
- **US4 (Phase 6)** depends on the US1 shared path; it does not depend on US3.
- **US5 (Phase 7)** depends on the US1 shared path and may run in parallel with US4.
- **Complete journeys and evidence (Phase 8)** depend on every selected story; T076-T077 occur only
  after all `App.tsx`, WebView bootstrap, SecureStore, report, and shared-UI work.

### Within Each Phase

- Run all listed tests first and confirm the expected failure.
- Implement types/models before adapters, adapters before hosts/routes, and hosts/routes before journey
  completion.
- Tasks sharing a file are sequential even when their surrounding test groups are parallel.
- A checkpoint must pass before relying on it from a dependent phase.
- Preserve the vertical fixtures from Phase 1 and advance them at T032, T036, and T073 rather than
  replacing them with disconnected lower-level tests.

## Parallel Execution Examples

### Phase 1 and Foundation

```text
T002 installed composition || T003 local lifecycle || T004 co-op learning loop
T005 runtime contracts || T006 protocol contracts || T007 compiler contracts || T008 database gate
```

### User Story 2

```text
T017 composition contracts || T018 four-example matrix || T019 player lifecycle || T020 invalid shapes
T021 compiler definition inspection || T025 player runtime adapter
T026 field puzzle || T027 minimal puzzle || T028 media tour || T029 co-op game
```

### User Story 1

```text
T033 mechanic tests || T034 API tests || T035 player tests || T036 first-action journey
T037-T040 mechanic/API lane || T041 player lane
```

### User Story 3

```text
T043 execution tests || T044 progression tests || T045 testkit tests || T046 representative models
T050 field model rewrite || T051 Host API/persistence adapter after runtime contracts settle
```

### User Story 4

```text
T052 database interruption tests || T053 scheduler tests || T054 bridge/revocation tests || T055 stress matrix
```

### User Story 5

```text
T062 protocol/API tests || T063 SQLite tests || T064 SecureStore/controller tests || T065 mismatch matrix
T066 protocol/API release checks || T067 SQLite pending/binding guards
```

## Implementation Strategy

### MVP Scope

The smallest runnable product increment is not US1 in isolation. Complete:

1. Phase 1 failing vertical journeys.
2. Phase 2 foundational contracts.
3. Phase 3 US2 coherent composition and all four compiler examples.
4. Phase 4 US1 runnable target-discovery co-op game.
5. Stop and execute the two installed-player first-action checkpoints before adding recovery hardening.

### Incremental Delivery

1. **Vertical fixtures**: product journeys fail at named missing seams.
2. **Foundation**: one corrected contract set with no compatibility code.
3. **Composition**: four releases compile and inspect; two install and mount through generated roots.
4. **Runnable co-op game**: target discovery crosses the generic trusted/shared seam.
5. **Runtime semantics**: every terminal/progression/replay path is exact.
6. **Recovery**: finite synchronization converges across interruption and revocation.
7. **Release pinning**: pending joins and immutable bindings reject every identity conflict.
8. **Learning loop and evidence**: generic reporting drives a distinct release and fresh session; provider-free
   and native gates close the feature.

## Completeness Map

| Requirement                                                | Implementation tasks                                                      | Acceptance/evidence tasks                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------- |
| FR-009 model initialization and typed narrowing            | T009-T010, T013-T014, T021-T023                                           | T005-T007, T017, T043, T045-T046                   |
| FR-011/FR-015 exact local commit and recovery              | T015, T025, T047-T051                                                     | T003, T008, T032, T043, T046, T073                 |
| FR-017/FR-018 per-trigger finite synchronization           | T056, T058-T059                                                           | T052-T053, T055, T073                              |
| FR-020 irreversible atomic revocation                      | T057, T060, T067, T069                                                    | T054-T055, T063, T065                              |
| FR-023 immutable credential-inclusive binding              | T067-T069                                                                 | T063-T065                                          |
| FR-026 minimal complete co-op journey                      | T029, T037-T042                                                           | T004, T036, T073                                   |
| FR-027 integrated installed-player path per game           | T025-T032, T041-T042                                                      | T002-T004, T032, T036, T073                        |
| FR-029 sole generic Game Play Report                       | T071                                                                      | T004, T070, T073                                   |
| FR-030 fresh simulator/emulator evidence                   | T041, T059-T061, T068, T071                                               | T074, T076-T077                                    |
| FR-031 every valid compiler fixture migrated               | T026-T031                                                                 | T018, T020, T031, T075                             |
| FR-032 plain names and centralized compatibility           | T009, T011-T013, T016, T026-T031, T037, T040, T050, T062, T066, T070-T071 | T005-T007, T017-T018, T062, T070, T072, T075       |
| SC-001 integrated field and two-release co-op paths        | T025-T032, T037-T071                                                      | T002-T004, T032, T036, T073                        |
| SC-003 four-example composition and compiler matrix        | T021-T031                                                                 | T017-T020, T031, T075                              |
| SC-008 configuration revision without duplicate registries | T026-T031, T037-T042, T070-T071                                           | T004, T018, T031, T073, T075                       |
| SC-009 complete co-op lifecycle plus fresh native evidence | T029, T037-T042, T056-T071                                                | T004, T036, T055, T062-T065, T070, T073, T076-T077 |
| SC-011 zero distributed generation suffixes                | T009, T011-T013, T016, T026-T031, T037, T050, T062, T066, T070-T071       | T005-T007, T017-T018, T062, T070, T072, T075       |

| Story | Contract/data-model coverage                                                 | Independent evidence tasks |
| ----- | ---------------------------------------------------------------------------- | -------------------------- |
| US1   | Game Composition, Host Application, Trusted Mechanic, Shared Session API     | T033-T036, T073            |
| US2   | Project Configuration, Game Composition, Game Application, Component Context | T017-T020, T031-T032       |
| US3   | Aggregate Runtime, Aggregate, Execution Record, Progression                  | T043-T046                  |
| US4   | Shared Recovery, Shared Action, Authorized Snapshot, Scheduler               | T052-T055                  |
| US5   | Shared Session API, Pending Join, Immutable Session Binding                  | T062-T065                  |

## Notes

- `[P]` never overrides a dependency or permits concurrent edits to the same file.
- Repository-owned public interfaces, schemas, logical IDs, catalog paths, and contract filenames use
  plain stable names. Do not add generation-suffixed aliases.
- Recompile all four reference releases; do not add readers, migrations, aliases, or automatic resets
  for discarded pre-release shapes.
- Keep existing project/release-format, Host API/capability, state-version, and `/v1` route metadata with
  their owning compatibility or concurrency boundaries. Remove the universal catalog and redundant
  per-interface/per-schema generations; do not build the future centralized evolution system in this
  feature.
- Keep provider-free, simulator/emulator, and physical-device evidence as separate claims; physical
  device behavior remains `NOT RUN` until separately executed.
