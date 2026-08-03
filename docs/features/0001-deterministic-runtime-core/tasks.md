# Tasks: Deterministic Runtime Core Redesign

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`
**Governance**: [ADR 0001](../../adrs/0001-deterministic-runtime-contract.md) is Accepted and records the corrected pre-release contract directly.

## Phase 1: Contract and Planning

- [x] T001 [US1] Rewrite ADR 0001 in `docs/adrs/0001-deterministic-runtime-contract.md` with preflight invalidity, kind generics, defined progression, ordinal ordering, and atomic execution semantics
- [x] T002 [US1] Reconcile requirements and architecture in `spec.md`, `plan.md`, `research.md`, and `data-model.md`
- [x] T003 [US4] Reconcile author-facing contracts and examples in `contracts/runtime-api.md`, `contracts/progression-api.md`, `contracts/testkit-api.md`, and `quickstart.md`

## Phase 2: Runtime Foundations

- [x] T004 [US1] Replace generic-cast canonicalization with `unknown -> JsonValue`, ordinary frozen objects, reserved-key-safe construction, and ordinal keys in `packages/runtime/src/canonical-json.ts`
- [x] T005 [US2] Tie aggregates, commands, command definitions, execution, progression, and results to one aggregate-kind generic in `packages/runtime/src/aggregates.ts`, `commands.ts`, and `execution-record.ts`
- [x] T006 [US3] Add one-time static graph validation, normalization, ordinal ordering, and freezing through `defineProgression` in `packages/runtime/src/progression/graph.ts`
- [x] T007 [US3] Restrict runtime graph checks to dynamic instances/intents and correct automatic cycle indexes in `packages/runtime/src/progression/validate-graph.ts` and `evaluate-progression.ts`

## Phase 3: Execution Pipeline

- [x] T008 [US1] Return total preflight invalid results for non-canonical policies, aggregates, commands, and observations in `packages/runtime/src/execute-command.ts`
- [x] T009 [US1] Build replayable terminal records only from canonical components with independent boundary limits in `packages/runtime/src/execute-command.ts`
- [x] T010 [US3] Reject unchanged candidates containing events, effects, or progression trace as `no-op-output-invalid` in `packages/runtime/src/execute-command.ts`
- [x] T011 [US1] Reduce `@plotpoint/runtime` root exports to constructors, execution, durable/result types, and diagnostics in `packages/runtime/src/index.ts`

## Phase 4: Testkit

- [x] T012 [US4] Propagate exact aggregate kinds through fixtures, scenarios, harness results, and replay in `packages/testkit/src/aggregate-fixtures.ts`, `runtime-harness.ts`, and `replay.ts`
- [x] T013 [US4] Make the harness own mutation, isolation, observation, repeat, and known-ambient checks with an exact ambient sentinel error in `packages/testkit/src/runtime-harness.ts`
- [x] T014 [US4] Limit replay to recorded executions and make preflight invalidity non-replayable in `packages/testkit/src/replay.ts`
- [x] T015 [US4] Remove assertions that cannot prove isolation, effect non-execution, or progression stability in `packages/testkit/src/assertions.ts` and `index.ts`

## Phase 5: Regression and Acceptance Evidence

- [x] T016 [US1] Add no-throw cyclic input, preflight, independent record-budget, ordinary-object, freezing, reserved-key, getter, and deterministic-text regressions in `packages/runtime/test/`
- [x] T017 [US2] Add compile-time mismatches for aggregate, command, definition, fixture, progression, and result kinds in `packages/runtime/test/aggregate-contracts.type-test.ts`
- [x] T018 [US3] Separate `defineProgression` construction failures from dynamic failures and cover reverted progression, ordinal punctuation/case, cycles, conflicts, limits, generated models, and exhaustive models in progression tests
- [x] T019 [US4] Preserve exact observation consumption, mutation isolation, effect non-execution, deterministic repeats, replay, and external-consumer quickstart coverage in `packages/runtime/test/` and `packages/testkit/test/`
- [x] T020 Run formatting, lint, all type checks/builds/tests, benchmark, Spec Kit workflow checks, documentation synchronization, and `pnpm verify`; record results in `checklists/implementation.md`

## Dependency Order

`T001-T003 -> T004-T007 -> T008-T011 -> T012-T015 -> T016-T020`

The generic workspace scaffold remains a logically separate foundation concern. This redesign does not rewrite or force-push the existing remote feature branch; any later history separation requires explicit repository-history authorization.
