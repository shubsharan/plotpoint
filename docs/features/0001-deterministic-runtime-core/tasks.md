# Tasks: Deterministic Runtime Core

**Input**: Design documents from `docs/features/0001-deterministic-runtime-core/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`
**Tests**: Required by the feature specification and Gate 1 exit evidence; write each phase's tests first and confirm they fail before implementing that phase.
**Implementation Gate**: [ADR 0001](../../adrs/0001-deterministic-runtime-contract.md) is Accepted, and the workflow check passed before implementation began.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel after its stated prerequisites because it changes different files.
- **[Story]**: Maps the task to the corresponding prioritized user story.
- Every checklist item includes the exact file or files it changes.

## Phase 1: Setup (Shared Test and Build Infrastructure)

**Purpose**: Establish the Vitest, TypeScript-test, and Turbo execution surface used by every story.

- [x] T001 Add root Vitest 4.1, add `fast-check` to the testkit development dependencies, add package-scoped Vitest scripts, and update the resolved lockfile in `package.json`, `packages/runtime/package.json`, `packages/testkit/package.json`, and `pnpm-lock.yaml`
- [x] T002 Create named `runtime` and `testkit` projects with shared deterministic defaults, package-specific include patterns, and isolated ambient-authority tests in `vitest.config.ts`
- [x] T003 [P] Add test-only compiler coverage for Vitest and type-contract fixtures while preserving production exclusions in `packages/runtime/tsconfig.test.json` and `packages/runtime/tsconfig.json`
- [x] T004 [P] Add test-only compiler coverage for Vitest, `fast-check`, and runtime workspace imports while preserving production exclusions in `packages/testkit/tsconfig.test.json` and `packages/testkit/tsconfig.json`
- [x] T005 Add the Turbo `test` task, root `test` and `test:watch` orchestration, and test execution to the provider-free verification gate in `turbo.json` and `package.json`

**Checkpoint**: `pnpm test` discovers empty or failing named projects consistently from the root and package filters.

---

## Phase 2: Foundational (Blocking Runtime Contracts)

**Purpose**: Implement the canonical, typed, diagnostic foundation required by every user story.

**Critical**: No user-story implementation starts until this phase is complete.

### Tests for the Foundation

- [x] T006 [P] Write failing Vitest tables for canonical ordering, negative-zero normalization, invalid descriptors and values, cycles, lone surrogates, depth/node limits, detached clones, and recursive freezing in `packages/runtime/test/canonical-json.test.ts`
- [x] T007 [P] Write failing Vitest contract tests for stable diagnostic codes, canonical detail objects, and prose-free durable diagnostics in `packages/runtime/test/diagnostics.test.ts`
- [x] T008 [P] Write failing compile-time fixtures for canonical values, aggregate/command generics, discriminated handler decisions, illegal field combinations, and readonly inputs in `packages/runtime/test/contracts.type-test.ts`

### Foundational Implementation

- [x] T009 Implement stable diagnostic codes, deterministic detail validation, and the `Diagnostic` contract in `packages/runtime/src/diagnostics.ts`
- [x] T010 Implement iterative descriptor-safe canonical validation, cloning, freezing, canonical text, default v1 limits, and JSON-pointer-like error paths in `packages/runtime/src/canonical-json.ts`
- [x] T011 [P] Define aggregate kinds, authority, identity/version primitives, and the generic aggregate envelope without transition behavior in `packages/runtime/src/aggregates.ts`
- [x] T012 [P] Define command envelopes, command definitions, accepted/rejected handler decisions, domain events, effect intents, and synchronous handler constraints in `packages/runtime/src/commands.ts`
- [x] T013 [P] Define observation entries, consumption trace entries, and explicit transition-context types without ambient providers in `packages/runtime/src/observations.ts`
- [x] T014 [P] Define progression lifecycle statuses and the aggregate-owned canonical progression-instance shape in `packages/runtime/src/progression/state.ts`
- [x] T015 [P] Define versioned execution-record inputs, terminal variants, resolved policies, traces, and committable versus attempted outputs in `packages/runtime/src/execution-record.ts`
- [x] T016 Export only the completed foundational named values and explicit type exports from `packages/runtime/src/index.ts`

**Checkpoint**: Canonical and diagnostic tests pass; type fixtures reject illegal contracts; runtime still has zero production dependencies.

---

## Phase 3: User Story 1 - Execute a Reproducible Command (Priority: P1) - MVP

**Goal**: Execute one command from explicit canonical inputs and observations, returning deterministic accepted, rejected, no-op, or invalid data without performing effects.

**Independent Test**: Run a representative command 100 times from the same aggregate, command, and observation script; every canonical record must match, rejection must preserve state, and effect intents must remain unexecuted data.

### Tests for User Story 1

- [x] T017 [P] [US1] Write failing Vitest contract cases for accepted, rejected, no-op, invalid, handler-throw, promise-shaped, and 100-repeat deterministic command results in `packages/runtime/test/execute-command.test.ts`
- [x] T018 [P] [US1] Write failing Vitest cases for ordered observation success, exhaustion, identity mismatch, canonical consumption traces, and zero ambient fallback in `packages/runtime/test/observation-consumption.test.ts`
- [x] T019 [P] [US1] Write failing Vitest cases proving effect intents and domain events retain order, are returned only after an accepted state change, and are never invoked by runtime code in `packages/runtime/test/effect-boundary.test.ts`

### Implementation for User Story 1

- [x] T020 [P] [US1] Implement the ordered observation cursor, exact `{kind,key}` matching, exhaustion/mismatch diagnostics, and deterministic consumption trace in `packages/runtime/src/observations.ts`
- [x] T021 [P] [US1] Implement `defineCommand` static validation and synchronous accepted/rejected decision validation in `packages/runtime/src/commands.ts`
- [x] T022 [US1] Implement the pre-progression `executeCommand` pipeline for policy resolution, canonical inputs, handler invocation, rejection, no-op checks, accepted state candidates, and stable exception diagnostics in `packages/runtime/src/execute-command.ts`
- [x] T023 [US1] Implement canonical execution-record construction without timestamps, durations, stacks, host prose, hashes, or generated record IDs in `packages/runtime/src/execution-record.ts`
- [x] T024 [US1] Export `defineCommand`, `executeCommand`, observation contracts, execution variants, outcomes, events, effects, policies, diagnostics, and record types from `packages/runtime/src/index.ts`

**Checkpoint**: User Story 1 passes independently through the `runtime` Vitest project and provides the minimum viable deterministic command kernel.

---

## Phase 4: User Story 2 - Protect Aggregate Boundaries (Priority: P2)

**Goal**: Enforce player, team, and session identities, versions, canonical state, caller isolation, and exactly-one-target mutation.

**Independent Test**: Run accepted, rejected, invalid, stale, target-mismatch, version-overflow, and shared-alias fixtures for all three aggregate kinds; only the accepted target advances once and all caller-owned/non-target values remain canonically unchanged.

### Tests for User Story 2

- [x] T025 [P] [US2] Write failing Vitest cases for all aggregate kinds, exact target matching, stale short-circuit before handler/observations, accepted version increment, no-op/rejection preservation, overflow, and shared-alias isolation in `packages/runtime/test/aggregate-isolation.test.ts`
- [x] T026 [P] [US2] Write failing Vitest cases for detached player, team, and session fixture defaults and nested-reference isolation in `packages/testkit/test/aggregate-fixtures.test.ts`
- [x] T027 [P] [US2] Write failing compile-time fixtures for wrong aggregate-kind command definitions, invalid versions, mutable fixture inputs, and cross-kind result misuse in `packages/runtime/test/aggregate-contracts.type-test.ts`

### Implementation for User Story 2

- [x] T028 [US2] Implement aggregate identity, kind, schema/state version, authority, canonical state, progression ownership, and overflow validation in `packages/runtime/src/aggregates.ts`
- [x] T029 [US2] Extend command execution with exact target checks, stale-version short-circuiting, detached target state, final canonical equality, and runtime-owned single version advancement in `packages/runtime/src/execute-command.ts`
- [x] T030 [US2] Implement detached player, team, and session aggregate fixture builders with explicit stable defaults in `packages/testkit/src/aggregate-fixtures.ts`
- [x] T031 [US2] Export aggregate validators and all three fixture builders through the package roots in `packages/runtime/src/index.ts` and `packages/testkit/src/index.ts`

**Checkpoint**: User Story 2 passes independently for every aggregate kind without progression, replay, player, database, or network infrastructure.

---

## Phase 5: User Story 3 - Model Bounded Progression (Priority: P3)

**Goal**: Validate and run aggregate-owned progression with branching, parallel availability, lifecycle rules, simultaneous rounds, explicit conflicts, cycle detection, and atomic transition limits.

**Independent Test**: Evaluate representative and generated graphs covering every lifecycle movement, branching, parallel batches, conflicts, exact/zero/overrun limits, cycles, completion, and skipping; each result must stabilize canonically or return the expected non-committable diagnostic.

### Tests for User Story 3

- [x] T032 [P] [US3] Write failing Vitest tables for duplicate/unknown IDs, graph-version mismatch, missing/extra node state, illegal lifecycle movement, terminal reopening, invalid priorities, same-state rules, and malformed command intents in `packages/runtime/test/progression/validate-graph.test.ts`
- [x] T033 [P] [US3] Write failing Vitest examples for branching, multiple available/active nodes, same-snapshot rule visibility, per-node priority, equal-priority conflicts, canonical batch ordering, completion, skipping, and stable-state detection in `packages/runtime/test/progression/evaluate-progression.test.ts`
- [x] T034 [P] [US3] Write failing Vitest cases for zero, exact, one-over, oversized parallel-batch limits and full-state cycle diagnostics with original-aggregate rollback in `packages/runtime/test/progression/progression-failures.test.ts`
- [x] T035 [P] [US3] Write failing `fast-check` model tests and exhaustive two-to-four-node comparisons against a structurally simpler reference model in `packages/testkit/test/progression.model.test.ts`

### Implementation for User Story 3

- [x] T036 [P] [US3] Define immutable graph, node, automatic-rule, rule-input, and progression-definition contracts in `packages/runtime/src/progression/graph.ts`
- [x] T037 [P] [US3] Extend progression state with direct intents, round/batch transitions, canonical trace records, and terminal lifecycle guards in `packages/runtime/src/progression/state.ts`
- [x] T038 [US3] Implement graph-definition, progression-instance, reachability, rule, lifecycle, priority, and direct-intent validation in `packages/runtime/src/progression/validate-graph.ts`
- [x] T039 [US3] Implement simultaneous immutable rounds, per-node winner/conflict selection, canonical batch application, stable-state detection, batch-aware limits, complete-state cycle comparison, and attempted traces in `packages/runtime/src/progression/evaluate-progression.ts`
- [x] T040 [US3] Integrate direct intents and automatic progression into the atomic command candidate so any graph/rule/conflict/cycle/limit failure restores the original aggregate and suppresses committable candidate events/effects in `packages/runtime/src/execute-command.ts`
- [x] T041 [US3] Export graph validation/evaluation, lifecycle, intents, rule, trace, and progression diagnostic contracts from `packages/runtime/src/index.ts`

**Checkpoint**: User Story 3 passes independently from explicit command/aggregate fixtures and never returns a partially stabilized commit candidate.

---

## Phase 6: User Story 4 - Test Game Logic Without Platform Infrastructure (Priority: P4)

**Goal**: Give game authors scripted external values, strict scenario execution, mutation/ambient audits, canonical replay, and readable assertions without a player or service.

**Independent Test**: Run and replay the quickstart scenario using scripted clock, identifier, random, observation, and capability values; changing one fixture affects only its consumer, missing/order/unused values diagnose exactly, and replay reproduces the complete canonical result.

### Tests for User Story 4

- [x] T042 [P] [US4] Write failing Vitest cases for clock, identifier, random, generic observation, and capability helpers plus missing, exhausted, out-of-order, unused, and non-canonical scripts in `packages/testkit/test/scripted-observations.test.ts`
- [x] T043 [P] [US4] Write failing Vitest cases for strict scenarios, 100-repeat comparison, first-path mismatch reporting, caller mutation detection, non-target isolation, and exact-consumption enforcement in `packages/testkit/test/runtime-harness.test.ts`
- [x] T044 [P] [US4] Write failing Vitest cases for matching and divergent record replay using the same command/progression definitions and resolved policy in `packages/testkit/test/replay.test.ts`
- [x] T045 [P] [US4] Write failing serial Vitest cases that audit clock, randomness, identifier, network, storage, and common capability globals and restore every patched global after success or failure in `packages/testkit/test/ambient-authority.test.ts`
- [x] T046 [P] [US4] Turn the documented parallel-unlock scenario into a failing external-consumer-style Vitest acceptance test using only package-root imports in `packages/testkit/test/quickstart.integration.test.ts`

### Implementation for User Story 4

- [x] T047 [P] [US4] Implement canonical clock, identifier, random, generic observation, and capability script helpers without ambient fallbacks in `packages/testkit/src/scripted-observations.ts`
- [x] T048 [P] [US4] Implement framework-neutral result, canonical-equality, mutation/isolation, observation, effect-as-data, progression, and diagnostic assertions in `packages/testkit/src/assertions.ts`
- [x] T049 [US4] Implement strict scenario execution, repeat comparison, snapshot preservation, unused-input enforcement, ambient audit scoping, and deterministic mismatch details in `packages/testkit/src/runtime-harness.ts`
- [x] T050 [US4] Implement record replay from canonical recorded inputs, resolved policy, stable definition identities, and first-material-path comparison in `packages/testkit/src/replay.ts`
- [x] T051 [US4] Export fixture, scripted-observation, harness, assertion, scenario, and replay contracts as explicit named package-root exports in `packages/testkit/src/index.ts`

**Checkpoint**: User Story 4 reproduces and explains complete runtime scenarios with no player, database, network service, clock source, random source, or physical device.

---

## Phase 7: Polish & Cross-Cutting Evidence

**Purpose**: Close public-surface, performance-baseline, documentation, dependency, and complete Gate 1 evidence gaps.

- [x] T052 [P] Add package-root import and type-surface contract tests that reject unsupported deep-import assumptions in `packages/runtime/test/public-api.test.ts` and `packages/testkit/test/public-api.test.ts`
- [x] T053 [P] Add representative command and progression benchmark fixtures without pass/fail latency thresholds in `packages/runtime/test/runtime.bench.ts` and add the corresponding script in `packages/runtime/package.json`
- [x] T054 Audit and remove Gate 1-unneeded testkit dependencies while preserving zero runtime dependencies and root-only exports in `packages/runtime/package.json`, `packages/testkit/package.json`, and `pnpm-lock.yaml`
- [x] T055 Reconcile implemented API names and runnable Vitest commands with the external-consumer walkthrough in `docs/features/0001-deterministic-runtime-core/quickstart.md`
- [x] T056 Run formatting, lint, type checks, Vitest, builds, Spec Kit tests, documentation sync, and workflow validation after ADR acceptance, then record every success criterion and Gate 1 exit-evidence result in `docs/features/0001-deterministic-runtime-core/checklists/implementation.md`

**Checkpoint**: All feature success criteria and roadmap Gate 1 exit evidence are recorded; provider-free verification and the accepted-ADR workflow gate pass.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependency; complete before tests or production files are added.
- **Foundational (Phase 2)**: Depends on Setup and blocks every user story.
- **User Story 1 (Phase 3)**: Depends on Foundational and is the MVP command kernel.
- **User Story 2 (Phase 4)**: Depends on Foundational and User Story 1's executor.
- **User Story 3 (Phase 5)**: Depends on Foundational and User Story 1; it can proceed alongside User Story 2 until shared executor/root-export integration in T040-T041.
- **User Story 4 (Phase 6)**: Depends on User Stories 1-3 because replay evidence covers commands, aggregate boundaries, and progression.
- **Polish (Phase 7)**: Depends on every selected user story and explicit acceptance of ADR 0001 before T056 workflow validation.

### User Story Completion Graph

```text
Setup -> Foundation -> US1 (MVP) -> US2 ----\
                              \-> US3 -----+-> US4 -> Polish/Evidence
```

### Within Each Phase

- Write the phase's Vitest/type/model tests first and verify they fail for the intended missing behavior.
- Implement data contracts before algorithms that consume them.
- Validate canonical inputs before invoking game logic.
- Complete internal behavior before adding package-root exports.
- Run the phase's named Vitest project at each checkpoint before advancing.

### Parallel Opportunities

- T003 and T004 configure distinct package test type-check surfaces in parallel.
- T006-T008 cover independent foundation contracts in parallel.
- After T009-T010, T011-T015 define different foundational modules in parallel.
- T017-T019 can be authored in parallel before User Story 1 implementation; T020 and T021 then modify separate modules in parallel.
- T025-T027 cover separate runtime, testkit, and type surfaces in parallel.
- T032-T035 cover graph validation, behavior, failure, and model evidence in parallel; T036 and T037 then define separate progression modules in parallel.
- T042-T046 cover independent testkit acceptance surfaces in parallel; T047 and T048 then implement separate helper modules in parallel.
- T052 and T053 close independent API and benchmark evidence in parallel.

---

## Parallel Example: User Story 1

```text
Task T017: Author command result and repeatability cases in execute-command.test.ts
Task T018: Author observation ledger cases in observation-consumption.test.ts
Task T019: Author event/effect boundary cases in effect-boundary.test.ts

After the tests fail:
Task T020: Implement the observation cursor in observations.ts
Task T021: Implement command-definition validation in commands.ts
```

## Parallel Example: User Story 2

```text
Task T025: Author runtime aggregate isolation/version cases
Task T026: Author testkit aggregate fixture cases
Task T027: Author compile-time aggregate pairing cases
```

## Parallel Example: User Story 3

```text
Task T032: Author graph validation tables
Task T033: Author branching and parallel-round examples
Task T034: Author cycle and transition-limit failures
Task T035: Author fast-check/reference-model comparisons
```

## Parallel Example: User Story 4

```text
Task T042: Author scripted-observation cases
Task T043: Author strict harness and repeat cases
Task T044: Author replay cases
Task T045: Author serial ambient-authority audit cases
Task T046: Author the external-consumer quickstart acceptance case
```

---

## Implementation Strategy

### MVP First: User Story 1

1. Explicitly accept ADR 0001 and confirm the workflow check passes.
2. Complete Setup and Foundational phases.
3. Complete User Story 1 tests and implementation.
4. Stop and run the `runtime` Vitest project independently.
5. Demonstrate identical canonical records across 100 executions and effects returned only as data.

### Incremental Delivery

1. **US1**: Deliver deterministic command execution and semantic results.
2. **US2**: Add aggregate kinds, versions, stale rejection, and mutation isolation without changing US1 behavior.
3. **US3**: Add atomic progression stabilization, parallel rounds, and bounded failure behavior.
4. **US4**: Add the author harness, replay, ambient audit, and external-consumer evidence.
5. **Polish**: Close public API, dependency, benchmark, documentation, and complete Gate 1 evidence.

### Parallel Team Strategy

After Foundation and US1 are complete:

- One lane can complete US2 aggregate validation and fixtures.
- A second lane can complete US3 graph validation/evaluation until executor integration.
- US4 begins after both lanes stabilize their public contracts.
- Shared `execute-command.ts` and package-root export edits are serialized to avoid conflicting integration work.

---

## Notes

- `[P]` means the task changes different files and may start only after its listed prerequisites are satisfied.
- `[US1]` through `[US4]` map directly to the specification's four prioritized stories.
- Test tasks are mandatory because deterministic, isolation, progression-model, and replay evidence are explicit success criteria.
- Testkit assertions remain framework-neutral even though Plotpoint's contributor workflow uses Vitest.
- No task adds persistence, release compilation, synchronization, player integration, backend authority, physical capability implementation, or effect delivery.
- Do not mark the feature Done without a merged PR link and preserved Gate 1 evidence.
