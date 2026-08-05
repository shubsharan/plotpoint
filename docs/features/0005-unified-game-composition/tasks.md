# Tasks: Unified Game Composition

**Input**: Design documents from `docs/features/0005-unified-game-composition/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: The feature specification requires contract, type, replay, interruption, recovery,
redaction, and external-consumer acceptance evidence. Within every phase, write the listed tests first
and confirm that they fail for the intended missing behavior before implementing the corresponding
production change.

**Organization**: The two P1 stories are ordered by dependency: US2 establishes the coherent compiled
composition consumed by US1's runnable co-op game. Shared runtime/protocol prerequisites stay in
the blocking foundation. No task introduces a second schema generation or compatibility layer.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: May run in parallel after the task's stated phase prerequisites because it changes different
  files and does not depend on another incomplete task in the same group.
- **[Story]**: Maps implementation and evidence to the user story in `spec.md`.
- Every task names the exact repository path or paths it owns.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Put the cooperative reference release into the normal workspace/type/test surface before
contract work begins.

- [ ] T001 Rename the existing co-op example from `examples/releases/team-session-hunt/` to `examples/releases/co-op-game/` and add the renamed package to the workspace, type-check, and Vitest project surfaces in `pnpm-workspace.yaml`, `vitest.config.ts`, `examples/releases/co-op-game/package.json`, and `examples/releases/co-op-game/tsconfig.json`

---

## Phase 2: Foundational Contracts (Blocking Prerequisites)

**Purpose**: Establish the corrected V1 serialized contracts and unversioned typed runtime boundary
used by every story.

**CRITICAL**: No user-story implementation begins until this phase is complete and its contract tests
pass.

### Failing Contract Tests

- [ ] T002 [P] Add failing type/behavior tests for model/schema identity, authority-kind constraints, safe command/model erasure, initialization results, and exact `ExecutionResult<State, Outcome, Payload, Kind>` ordering in `packages/runtime/test/aggregate-contracts.type-test.ts`, `packages/runtime/test/contracts.type-test.ts`, and `packages/runtime/test/execute-command.test.ts`
- [ ] T003 [P] Add failing closed-shape tests for Game Composition V1, corrected Host API V1 bootstrap/transition payloads, Game Play Report V1, mandatory composition inspection, and rejected superseded shapes in `packages/protocol/test/contracts.type-test.ts`, `packages/protocol/test/player-contracts.test.ts`, `packages/protocol/test/inspection.test.ts`, and `packages/protocol/test/release-format.test.ts`
- [ ] T004 [P] Add failing strict Project Configuration V1 fixtures for one-way model relationships, initializer-content schema agreement, authority-kind mismatch, duplicate derived command types, and rejected superseded configuration in `packages/compiler/test/unit/project.test.ts`, `packages/compiler/test/integration/invalid-projects.test.ts`, and `packages/compiler/test/fixtures/projects/invalid/configuration/`
- [ ] T005 [P] Add failing clean-break database tests proving incompatible local/shared schemas surface reset-or-reinstall guidance without migration or silent deletion in `apps/player/test/database-upgrade.test.ts` and `apps/player/test/database-observation-migration.test.ts`

### Foundational Implementation

- [ ] T006 [P] Add unversioned `RuntimeSchema`, `ResolvedCommandBinding`, `ResolvedAggregateModel`, `ExecutableAggregateModel`, and explicit initialization result types while adding model/schema identity to aggregates in `packages/runtime/src/aggregate-model.ts`, `packages/runtime/src/aggregates.ts`, `packages/runtime/src/commands.ts`, and `packages/runtime/src/execution-record.ts`
- [ ] T007 Construct payload-narrowing command bindings and state-narrowing executable model wrappers, route model-owned initialization/execution through them, and export the supported surface in `packages/runtime/src/aggregate-model.ts`, `packages/runtime/src/execute-command.ts`, and `packages/runtime/src/index.ts`
- [ ] T008 [P] Define and parse mandatory Game Composition V1 descriptors/resources plus the composition-aware inspection result without duplicating manifest Host API/capabilities in `packages/protocol/src/release/game-composition.ts`, `packages/protocol/src/release/paths.ts`, `packages/protocol/src/release/types.ts`, `packages/protocol/src/release/inspect.ts`, and `packages/protocol/src/index.ts`
- [ ] T009 Correct Runtime Bootstrap V1, Local Transition V1, scoped application/component contracts, and Game Play Report V1 in place while preserving existing bridge message names in `packages/protocol/src/player/bridge.ts`, `packages/protocol/src/player/report.ts`, `packages/protocol/src/player.ts`, and `packages/protocol/src/index.ts`
- [ ] T010 Replace the compiler's old entry registries with strict Project Configuration V1 application/model/command/progression/component/mechanic registrations and one-way validation in `packages/compiler/src/project/config.ts`, `packages/compiler/src/project/load-project.ts`, `packages/compiler/src/composition/registries.ts`, and `packages/compiler/src/composition/validate-references.ts`
- [ ] T011 Generate fixed `application`, `components`, and local `aggregateModels` roots plus the mandatory canonical catalog and manifest capability-equality check in `packages/compiler/src/composition/generated-entries.ts`, `packages/compiler/src/composition/inspect-definitions.ts`, `packages/compiler/src/bundle/bundle-release.ts`, and `packages/compiler/src/release/assemble.ts`
- [ ] T012 [P] Replace additive legacy database upgrades with an explicit corrected-schema gate and stable reset/reinstall failure while preserving same-schema restart recovery in `apps/player/src/persistence/database.ts`, `apps/player/src/persistence/validation.ts`, and `apps/player/src/shared/database.ts`
- [ ] T013 Update reusable aggregate-model fixtures, runtime harness construction, replay helpers, and public exports for the new unversioned runtime seam in `packages/testkit/src/aggregate-fixtures.ts`, `packages/testkit/src/runtime-harness.ts`, `packages/testkit/src/replay.ts`, and `packages/testkit/src/index.ts`

**Checkpoint**: Runtime, protocol, compiler loading, clean database opening, and testkit compile against
one corrected contract set; superseded shapes fail rather than adapt.

---

## Phase 3: User Story 2 - Author One Coherent Game Definition (Priority: P1)

**Goal**: Compile and inspect two materially different projects from one data-only definition with no
duplicate author registries or unresolved platform-visible dependencies.

**Independent Test**: Validate, compile, inspect, and load the field puzzle and co-op game;
every logical role resolves through the mandatory catalog and fixed generated registries, while
malformed references fail before publication.

### Failing Tests for User Story 2

- [ ] T014 [P] [US2] Add failing compiler contract tests for application shape, single-owner command/progression/mechanic relationships, exact initialization schemas, component dependency scopes, and manifest capability equality in `packages/compiler/test/unit/game-composition.test.ts` and `packages/compiler/test/fixtures/projects/invalid/composition-v1/`
- [ ] T015 [P] [US2] Add failing integration tests for fixed generated registry keys, mandatory catalog inventory agreement, composition-aware JSON/human inspection, reproducibility, and missing-catalog rejection in `packages/compiler/test/integration/game-composition.test.ts`, `packages/compiler/test/integration/inspect-release.test.ts`, and `packages/compiler/test/integration/reproducibility.test.ts`
- [ ] T016 [P] [US2] Add failing WebView lifecycle tests for static application validation, runtime handle validation, reverse exactly-once mount cleanup, scoped dependency maps, and component-only state reads/subscriptions in `apps/player/test/runtime-composition.test.ts` and `apps/player/test/bootstrap.test.ts`

### Implementation for User Story 2

- [ ] T017 [P] [US2] Implement application/model/component/mechanic definition inspection and stable missing/mismatch diagnostics in `packages/compiler/src/composition/inspect-definitions.ts`, `packages/compiler/src/composition/validate-references.ts`, and `packages/compiler/src/diagnostics/codes.ts`
- [ ] T018 [US2] Build canonical Game Composition V1 descriptors/resource bindings from validated registries and inventory paths in `packages/compiler/src/composition/game-composition.ts`, `packages/compiler/src/release/entry-paths.ts`, and `packages/compiler/src/release/assemble.ts`
- [ ] T019 [US2] Replace author default roots with compiler-generated fixed registry maps and prove catalog-to-executable key agreement during bundling in `packages/compiler/src/composition/generated-entries.ts`, `packages/compiler/src/bundle/rolldown-plugin.ts`, and `packages/compiler/src/bundle/bundle-release.ts`
- [ ] T020 [US2] Expose composition-aware `plotpoint inspect` JSON/human output while keeping low-level Release Format V1 inspection game-agnostic in `packages/compiler/src/cli.ts`, `packages/compiler/src/index.ts`, and `packages/protocol/src/release/inspect.ts`
- [ ] T021 [P] [US2] Implement the generated runtime adapter, player-owned mount scope, and component factories with scoped local/shared/resource/capability contexts in `apps/player/src/runtime/composition.ts`, `apps/player/src/runtime/local-model-adapter.ts`, `apps/player/src/runtime/mount-scope.ts`, and `apps/player/src/runtime/bootstrap.ts`
- [ ] T022 [P] [US2] Rewrite the field puzzle as corrected Project Configuration V1 with a generated application, local model initializer, command, progression, and scoped component in `examples/releases/field-puzzle/plotpoint.project.json`, `examples/releases/field-puzzle/src/application.ts`, `examples/releases/field-puzzle/src/initial-state.ts`, `examples/releases/field-puzzle/src/components/puzzle.ts`, and `examples/releases/field-puzzle/src/commands/advance.ts`
- [ ] T023 [P] [US2] Rewrite the co-op game's data-only application, local/server model contracts, command/progression registrations, components, content, schemas, capabilities, and trusted-mechanic binding in `examples/releases/co-op-game/plotpoint.project.json`, `examples/releases/co-op-game/src/application.ts`, `examples/releases/co-op-game/src/components/clue-board.ts`, and `examples/releases/co-op-game/src/components/session-console.ts`
- [ ] T024 [US2] Complete the two-release external-consumer compile/inspect/load acceptance and remove obsolete author `logic`/`presentation` registries in `packages/compiler/test/integration/game-composition.test.ts`, `examples/releases/field-puzzle/test/field-puzzle.test.ts`, `examples/releases/field-puzzle/src/logic.ts`, `examples/releases/field-puzzle/src/presentation.ts`, `examples/releases/co-op-game/src/logic.ts`, and `examples/releases/co-op-game/src/presentation.ts`

**Checkpoint**: Both projects independently compile and inspect through one authoritative composition;
unknown or duplicated relationships fail deterministically.

---

## Phase 4: User Story 1 - Play the Co-op Game as One Release (Priority: P1)

**Goal**: Install, mount, join, and play the co-op game through the ordinary release/player/shared
session lifecycle with no game-specific player routing or release-authored server execution.

**Independent Test**: Compile and install the co-op game, create a release-pinned generic shared session, join
three participants, render the confirmed team projection, and submit one persisted-location target
discovery from the mounted game UI.

### Failing Tests for User Story 1

- [ ] T025 [P] [US1] Add failing closed trusted-mechanic registry tests for binding/config/model/schema digest agreement, explicit validation/authorization/projection results, exact `{ code }` outcomes, and no server progression in `packages/modules/test/trusted-mechanics.test.ts` and `packages/modules/test/target-discovery.test.ts`
- [ ] T026 [P] [US1] Add failing release registration and generic shared-session API tests for adapter resolution, configuration initialization, generic routes, command dispatch, projection validation, and stable safe errors in `apps/api/test/release-registration.test.ts`, `apps/api/test/shared-session.test.ts`, and `apps/api/test/server.test.ts`
- [ ] T027 [P] [US1] Add failing player integration tests for composition-derived join visibility, scoped Shared Play V1 contexts, generic command dispatch, mount failure rollback, and absence of shared UI for local-only releases in `apps/player/test/runtime-composition.test.ts`, `apps/player/test/shared-play.test.ts`, and `apps/player/test/production-handlers.test.ts`
- [ ] T028 [P] [US1] Add a failing provider-free compile/install/mount/join/confirmed-view/location-discovery journey in `examples/releases/co-op-game/test/co-op-game.test.ts` and `apps/api/test/postgres.integration.test.ts`

### Implementation for User Story 1

- [ ] T029 [US1] Implement the closed typed trusted-mechanic registry and erased authority-kind-safe adapter resolver in `packages/modules/src/trusted-mechanics.ts` and `packages/modules/src/index.ts`
- [ ] T030 [US1] Move target discovery behind the adapter's explicit binding, initialization, authorization, runtime-command, and complete projection results with digest-bound validators from `packages/modules/src/hunt/target-discovery.ts` to `packages/modules/src/mechanics/target-discovery.ts`
- [ ] T031 [US1] Replace the game-specific service in `apps/api/src/hunt-service.ts` with release/composition registration and a generic shared-session service using the selected platform model in `apps/api/src/shared-session-service.ts` and `apps/api/src/index.ts`
- [ ] T032 [US1] Replace public game-specific session routes/operator calls with `/v1/shared-sessions` release, creation, invitation, join, revoke, command, and pull operations in `apps/api/src/server.ts` and `apps/api/src/operator-client.ts`
- [ ] T033 [P] [US1] Mount verified generated applications and derive generic native join/shared/recovery surfaces only from Game Composition V1 in `apps/player/App.tsx`, `apps/player/src/runtime/production-handlers.ts`, `apps/player/src/shared/host-bridge.ts`, and `apps/player/src/shared/http-client.ts`
- [ ] T034 [US1] Wire the co-op application/components to the declared target-discovery command, foreground capability, confirmed team projection, and cleanup scope in `examples/releases/co-op-game/src/application.ts`, `examples/releases/co-op-game/src/components/clue-board.ts`, and `examples/releases/co-op-game/src/components/session-console.ts`

**Checkpoint**: The co-op game independently completes its first shared action through generic
compiled, player, API, and platform-mechanic paths; the field puzzle still mounts without shared UI.

---

## Phase 5: User Story 3 - Express Durable Logic and Progression Consistently (Priority: P2)

**Goal**: Make local and authoritative commands share one deterministic model contract with explicit
semantic decisions, safe heterogeneous registries, optional progression, and exact replay.

**Independent Test**: Exercise accepted state/progression/event/effect changes, no-op, rejection,
preflight invalidity, recorded execution invalidity, heterogeneous progression triggers, replay, and a
game that omits progression.

### Failing Tests for User Story 3

- [ ] T035 [P] [US3] Add failing runtime tests for explicit no-op, event-only/effect-only acceptance, outcome/event/effect validation, exact state-version changes, preflight versus recorded invalidity, and 100 mutation-free preflight repeats in `packages/runtime/test/execute-command.test.ts`, `packages/runtime/test/effect-boundary.test.ts`, and `packages/runtime/test/observation-consumption.test.ts`
- [ ] T036 [P] [US3] Add failing progression tests for named edges, canonical `initialProgression`, state/event/progression-only automatic facts, heterogeneous commands, deterministic conflicts/cycles/limits, and progression omission in `packages/runtime/test/progression/evaluate-progression.test.ts`, `packages/runtime/test/progression/progression-failures.test.ts`, and `packages/runtime/test/progression/validate-graph.test.ts`
- [ ] T037 [P] [US3] Add failing type/adversarial tests proving erased registries cannot call typed handlers before schema narrowing and replay compares complete canonical records in `packages/testkit/test/fixture-contracts.type-test.ts`, `packages/testkit/test/replay.test.ts`, and `packages/testkit/test/runtime-harness.test.ts`
- [ ] T038 [P] [US3] Add failing local/shared representative-model acceptance covering every terminal and optional progression in `packages/testkit/test/quickstart.integration.test.ts`, `examples/releases/field-puzzle/test/field-puzzle.test.ts`, and `packages/modules/test/target-discovery.test.ts`

### Implementation for User Story 3

- [ ] T039 [US3] Implement accepted/no-op/rejected decisions, event/effect-only commit classification, schema validation, and exact state-version recording in `packages/runtime/src/commands.ts`, `packages/runtime/src/execute-command.ts`, and `packages/runtime/src/execution-record.ts`
- [ ] T040 [US3] Replace payload/outcome-coupled progression rules with named transitions, canonical initial instances, aggregate/event/progression facts, and bounded deterministic stabilization in `packages/runtime/src/progression/graph.ts`, `packages/runtime/src/progression/state.ts`, `packages/runtime/src/progression/validate-graph.ts`, and `packages/runtime/src/progression/evaluate-progression.ts`
- [ ] T041 [US3] Update testkit model builders, scripted observations, strict assertions, and replay to use complete resolved models and execution records in `packages/testkit/src/aggregate-fixtures.ts`, `packages/testkit/src/scripted-observations.ts`, `packages/testkit/src/assertions.ts`, and `packages/testkit/src/replay.ts`
- [ ] T042 [US3] Update field-puzzle and co-op-game commands/progressions to the unversioned runtime API without duplicate phase state or caller-built initial progression in `examples/releases/field-puzzle/src/commands/advance.ts`, `examples/releases/field-puzzle/src/progression/route.ts`, `examples/releases/co-op-game/src/commands/advance-round.ts`, `examples/releases/co-op-game/src/commands/solve-clue.ts`, `examples/releases/co-op-game/src/progression/session-rounds.ts`, and `examples/releases/co-op-game/src/progression/team-route.ts`
- [ ] T043 [P] [US3] Map complete runtime records to corrected Host API V1 transitions and atomic local persistence without game-specific protocol glue in `apps/player/src/runtime/local-model-adapter.ts`, `apps/player/src/runtime/production-handlers.ts`, `apps/player/src/persistence/commit-transition.ts`, and `apps/player/src/runtime/transition-result.ts`

**Checkpoint**: Local and server models independently preserve every semantic terminal and exact state
version through execution, persistence, and replay.

---

## Phase 6: User Story 4 - Disconnect, Restart, and Converge Exactly Once (Priority: P2)

**Goal**: Drain a finite start-eligible batch, serialize foreground synchronization per session, and
apply normal/corrective/revoked snapshots atomically and idempotently across interruption.

**Independent Test**: Queue multiple commands, interrupt every claim/submit/pull/commit boundary,
overlap all trigger types, and repeatedly apply normal/corrective/revoked pulls while proving one exact
terminal per action and byte-equivalent final SQLite state.

### Failing Tests for User Story 4

- [ ] T044 [P] [US4] Add failing SQLite interruption tests for atomic finite batch claim/failure, stable ordering, later enqueue deferral, compare-or-insert terminals, duplicate collection rejection, and failure-atomic snapshot replacement in `apps/player/test/shared-recovery.test.ts`
- [ ] T045 [P] [US4] Add failing scheduler tests for one active pass per session, caller promise sharing, at most one trailing pass, different-session independence, pure reads, and restart recovery in `apps/player/test/shared-sync-coordinator.test.ts`
- [ ] T046 [P] [US4] Add failing revocation/correlation tests for authenticated errors and revoked snapshots, blocked outbox preservation, credential deletion after commit, and request-ID echo on semantic bridge errors in `apps/player/test/shared-play.test.ts` and `apps/player/test/host-conformance.test.ts`
- [ ] T047 [P] [US4] Add a failing 100-iteration response-loss and repeated normal/corrective/revoked pull acceptance matrix in `apps/player/test/shared-recovery.acceptance.test.ts`

### Implementation for User Story 4

- [ ] T048 [US4] Implement `beginSubmissionBatch`/`failSubmissionBatch` as exclusive finite claims over `queued | submitting | blocked-revoked` rows with honest durable sync status in `apps/player/src/shared/database.ts`
- [ ] T049 [US4] Implement duplicate-free validated compare-or-insert results, full projection replacement, matched outbox removal, cursor/member/status commit, and idempotent corrective/revoked application in `apps/player/src/shared/database.ts`
- [ ] T050 [US4] Replace the unbounded loop with a long-lived keyed single-flight scheduler that submits each claimed command once and pulls once per pass in `apps/player/src/shared/sync-coordinator.ts`
- [ ] T051 [US4] Route post-commit enqueue, foreground, offline-to-reachable reconnect, and explicit retry through the stable scheduler while keeping shared view reads pure in `apps/player/App.tsx`, `apps/player/src/shared/host-bridge.ts`, and `apps/player/src/shared/session-controller.ts`
- [ ] T052 [US4] Apply error/snapshot revocation atomically before removing SecureStore credentials and emit only redacted durable notifications after commit in `apps/player/src/shared/database.ts`, `apps/player/src/shared/sync-coordinator.ts`, and `apps/player/src/shared/credentials.ts`

**Checkpoint**: Every finite sync pass terminates, concurrent triggers coalesce, restart recovers durable
work, and repeated snapshots converge exactly once.

---

## Phase 7: User Story 5 - Enforce Release-Pinned Shared Play (Priority: P3)

**Goal**: Reserve one exact pending-or-bound session per installed run and expose shared state only when
all run/release/session/participant/team/origin identities agree.

**Independent Test**: Exercise fresh, duplicate, response-lost, parallel changed, wrong-release,
wrong-session, wrong-team, changed-origin, and changed-run joins/pulls; only exact retries persist and
prior playable state remains unchanged on conflict.

### Failing Tests for User Story 5

- [ ] T053 [P] [US5] Add failing protocol/API tests for `expectedReleaseId`, release check before invitation consumption, exact join digest retry, internally coherent join/snapshot identity, and safe mismatch errors in `packages/protocol/test/shared-play-v1.test.ts`, `apps/api/test/shared-session.test.ts`, and `apps/api/test/postgres.integration.test.ts`
- [ ] T054 [P] [US5] Add failing SQLite tests for pending join states, one pending-or-bound row per run, immutable binding guards, exact pending reuse, parallel conflict before submission, and incompatible identity rollback in `apps/player/test/shared-join-recovery.test.ts`
- [ ] T055 [P] [US5] Add failing SecureStore/controller interruption tests for reserve-before-secret, secret-before-send, ready/submitting exact retry, response loss, invitation cleanup ordering, and retained mismatch attempts in `apps/player/test/shared-session-controller.test.ts`
- [ ] T056 [P] [US5] Add failing join/pull acceptance fixtures for every run/release/session/participant/team/origin mismatch and fresh-release/fresh-session behavior in `apps/player/test/release-pinned-shared-play.test.ts`

### Implementation for User Story 5

- [ ] T057 [P] [US5] Add `expectedReleaseId` and exact release-pinned join request/response validation to Shared Session API V1 and reject mismatch before invitation mutation in `packages/protocol/src/shared/types.ts`, `packages/protocol/src/shared/validation.ts`, `apps/api/src/shared-session-service.ts`, and `apps/api/src/server.ts`
- [ ] T058 [P] [US5] Add pending-join storage, unique run reservation, pending-versus-binding guards, and immutable run/release/session/participant/team/origin triggers in `apps/player/src/shared/database.ts`
- [ ] T059 [US5] Persist exact request provenance and SecureStore key references before send, resume the same ready/submitting request after restart, and clean invitation secrets only after atomic binding commit in `apps/player/src/shared/session-controller.ts`, `apps/player/src/shared/credentials.ts`, and `apps/player/src/shared/http-client.ts`
- [ ] T060 [US5] Enforce identity equality before fresh join commit and every pull, preserve immutable binding fields on exact retry, and expose no projection on conflict in `apps/player/src/shared/database.ts` and `apps/player/src/shared/session-controller.ts`

**Checkpoint**: Shared play is release-pinned, exact retry is recoverable, and no changed identity can
rebind or partially mutate an installed run.

---

## Phase 8: Polish and Cross-Cutting Evidence

**Purpose**: Close the common report, privacy, architecture, and provider-free verification gates after
all selected stories are complete.

- [ ] T061 Add failing deterministic chronology, command-alias, local/shared evidence, report-safe diagnostic, constant-alias omission, and adversarial redaction tests in `apps/player/test/game-play-report.test.ts` and `packages/protocol/test/player-contracts.test.ts`
- [ ] T062 Replace local/game-specific report selection with one host-owned Game Play Report V1 derived only from committed evidence, then remove superseded report builders in `apps/player/src/reports/create-game-play-report.ts`, `apps/player/src/reports/create-play-report.ts`, `apps/player/src/reports/create-shared-hunt-report.ts`, `packages/protocol/src/player/report.ts`, and `apps/player/App.tsx`
- [ ] T063 [P] Add static architecture and clean-break tests preventing server release imports, game-specific player routing, duplicate author registries, composition-less playable releases, superseded shape readers, and automatic database reset in `apps/api/test/architecture.test.ts`, `packages/compiler/test/integration/invalid-projects.test.ts`, and `apps/player/test/runtime-lifecycle.test.ts`
- [ ] T064 Record provider-free results and the separate simulator/emulator and physical-device evidence status in `docs/features/0005-unified-game-composition/evidence/implementation.md` and reconcile any command drift in `docs/features/0005-unified-game-composition/quickstart.md`
- [ ] T065 Run `pnpm verify`, the focused PostgreSQL/Testcontainers and 100-iteration recovery suites, both public compile/inspect quickstarts, and `git diff --check`, then record exact commands/results in `docs/features/0005-unified-game-composition/evidence/implementation.md`

---

## Dependencies and Execution Order

### Phase Dependencies

```text
Phase 1 Setup
  -> Phase 2 Foundational Contracts
      -> Phase 3 US2 Coherent Definition
          -> Phase 4 US1 Runnable Co-op Game
              -> Phase 6 US4 Shared Recovery
              -> Phase 7 US5 Release-Pinned Play
      -> Phase 5 US3 Durable Logic and Progression

US4 + US5 + US3 -> Phase 8 Cross-Cutting Evidence
```

- **Setup (Phase 1)** has no dependency.
- **Foundational (Phase 2)** depends on T001 and blocks all stories.
- **US2 (Phase 3)** starts after Phase 2 and establishes the composition consumed by US1.
- **US1 (Phase 4)** depends on US2 and the foundation.
- **US3 (Phase 5)** depends only on the foundation and may run in parallel with US2/US1.
- **US4 (Phase 6)** depends on the US1 shared path; it does not depend on US3.
- **US5 (Phase 7)** depends on the US1 shared path and may run in parallel with US4.
- **Polish (Phase 8)** depends on every story selected for the release.

### Within Each Phase

- Run all listed tests first and confirm the expected failure.
- Implement types/models before adapters, adapters before hosts/routes, and hosts/routes before journey
  completion.
- Tasks sharing a file are sequential even when their surrounding test groups are parallel.
- A story checkpoint must pass independently before relying on it from a dependent story.

## Parallel Execution Examples

### User Story 2

```text
T014 compiler reference tests || T015 catalog/inspection tests || T016 player lifecycle tests
T017 compiler definition inspection || T021 player runtime adapter
T022 field-puzzle rewrite || T023 co-op-game declaration rewrite
```

### User Story 1

```text
T025 mechanic tests || T026 API tests || T027 player tests || T028 end-to-end journey test
T029-T032 mechanic/API lane || T033 player lane
```

### User Story 3

```text
T035 execution tests || T036 progression tests || T037 testkit tests || T038 representative models
T042 example-model rewrite || T043 Host API/persistence adapter after runtime contracts settle
```

### User Story 4

```text
T044 database interruption tests || T045 scheduler tests || T046 revocation tests || T047 stress matrix
```

### User Story 5

```text
T053 protocol/API tests || T054 SQLite tests || T055 SecureStore/controller tests || T056 mismatch matrix
T057 protocol/API release checks || T058 SQLite pending/binding guards
```

## Implementation Strategy

### MVP Scope

The smallest runnable product increment is not US1 in isolation. Complete:

1. Phase 1 setup.
2. Phase 2 foundational contracts.
3. Phase 3 US2 coherent composition.
4. Phase 4 US1 runnable co-op game.
5. Stop and execute both P1 independent tests before adding advanced semantics/recovery hardening.

### Incremental Delivery

1. **Foundation**: one corrected contract set with no compatibility code.
2. **Composition**: two releases compile, inspect, and mount through generated roots.
3. **Runnable Co-op Game**: target discovery crosses the generic trusted/shared seam.
4. **Runtime Semantics**: every terminal/progression/replay path is exact.
5. **Recovery**: finite synchronization converges across interruption and revocation.
6. **Release Pinning**: pending joins and immutable bindings reject every identity conflict.
7. **Evidence**: one generic report and provider-free gate close the feature.

## Completeness Map

| Story | Contract/data-model coverage                                                         | Independent evidence tasks |
| ----- | ------------------------------------------------------------------------------------ | -------------------------- |
| US1   | Game Composition V1, Host Application V1, Trusted Mechanic V1, Shared Session API V1 | T025-T028                  |
| US2   | Project Configuration V1, Game Composition V1, Game Application, Component Context   | T014-T016, T024            |
| US3   | Aggregate Runtime V1, Aggregate, Execution Record, Progression                       | T035-T038                  |
| US4   | Shared Recovery V1, Shared Action, Authorized Snapshot, Scheduler                    | T044-T047                  |
| US5   | Shared Session API V1, Pending Join, Immutable Session Binding                       | T053-T056                  |

## Notes

- `[P]` never overrides a dependency or permits concurrent edits to the same file.
- Public/persisted contracts stay on V1; repository-owned runtime APIs stay unversioned.
- Recompile reference releases; do not add readers, migrations, aliases, or automatic resets for
  discarded pre-release shapes.
- Keep provider-free, simulator/emulator, and physical-device evidence as separate claims.
