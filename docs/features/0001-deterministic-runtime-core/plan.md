# Implementation Plan: Deterministic Runtime Core

**Branch**: `feature/0001-deterministic-runtime-core` | **Date**: 2026-08-03 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `docs/features/0001-deterministic-runtime-core/spec.md`

## Summary

Build Plotpoint's first author-facing runtime kernel in `@plotpoint/runtime`: a dependency-free, portable library for canonical durable values, one-aggregate command evaluation, explicit observations, semantic outcomes, domain events, post-commit effect intents, replayable execution records, and bounded progression. Build `@plotpoint/testkit` on that public root API with scripted external values, aggregate fixtures, replay, mutation/isolation assertions, and reference-model graph tests. Command evaluation and progression stabilization form one atomic proposal; later player, storage, network, compiler, and effect-delivery work remains outside this feature.

## Technical Context

**Language/Version**: TypeScript 7.0.2 with strict checking, ESM, and an ES2022 output target
**Primary Dependencies**: Zero runtime dependencies for `@plotpoint/runtime`; `@plotpoint/testkit` depends on `@plotpoint/runtime`; test-only Vitest 4.1 and `fast-check` for generated model cases
**Storage**: N/A; this feature computes canonical values and records but does not persist them
**Testing**: Vitest named projects for runtime and testkit unit, contract, integration, and type-facing tests; deterministic tables; `fast-check` seeded property/model tests; an independent progression reference model; type-error fixtures; and repeated canonical replay checks
**Target Platform**: Portable ES2022 library for the future browser web runtime; Node.js 25 or newer for builds and author tests
**Project Type**: Monorepo library feature spanning the existing runtime and testkit packages
**Performance Goals**: Correctness and bounded termination are the Gate 1 goals; record benchmark baselines for representative graphs but establish no speculative latency or throughput gate
**Constraints**: No ambient I/O, no effect execution, canonical JSON-compatible durable values, one aggregate per command, exact state-version checks, deterministic output ordering, no platform or protocol dependency, and no partial result after progression failure
**Scale/Scope**: Player, team, and session aggregates; representative branching and parallel graphs; configurable validation and automatic-transition limits; no player, compiler, persistence, synchronization, backend, or physical capability integration

## Constitution Check

_GATE: Evaluated before research and again after design._

The repository constitution is still an unratified placeholder, so it provides no enforceable project principles. The plan therefore applies the active product invariants and feature requirements as its gates.

### Pre-Research Gate

- **PASS - Deterministic boundary**: Every external value is explicit; runtime code performs no I/O or effect execution.
- **PASS - Durable command boundary**: One typed command evaluates one versioned aggregate and returns data for later commit.
- **PASS - Aggregate isolation**: Player, team, and session state remain separately identified and cannot share mutable transition state.
- **PASS - Effects after commit**: The runtime emits effect intents only and has no effect adapter dependency.
- **PASS - Minimal proven packages**: Existing `runtime` and `testkit` packages are sufficient; no new package or service is introduced.
- **PASS - Scope**: Persistence, protocol encoding, compiler validation, player integration, synchronization, and authoritative execution remain later gates.

### Post-Design Gate

- **PASS - Public contract ownership**: Runtime types and behavior stay in `@plotpoint/runtime`; later wire formats remain in `@plotpoint/protocol`.
- **PASS - Atomic proposal**: Command output and progression stabilize or fail together before anything is presented as committable.
- **PASS - Replayability**: Canonical inputs, resolved limits, observation consumption, ordered outputs, traversal, and stable diagnostics are captured without ambient metadata.
- **PASS - Parallel progression**: Simultaneous rounds support multiple available or active nodes without a global current node or iteration-order dependence.
- **PASS - Honest authority boundary**: Gate 1 verifies the runtime and representative handlers but does not claim a hostile-code sandbox; stronger enforcement remains with compiler/player gates.

No gate violation requires a complexity exception.

## Architecture Decisions

**Impact**: Major

- [Deterministic Runtime Contract](../../adrs/0001-deterministic-runtime-contract.md) - **Accepted**. It governs the public aggregate and execution contract, canonical durable values, package ownership, explicit observations, command/progression atomicity, and the Gate 1 ambient-authority boundary.

## Project Structure

### Documentation (this feature)

```text
docs/features/0001-deterministic-runtime-core/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── runtime-api.md
│   ├── progression-api.md
│   └── testkit-api.md
├── checklists/
│   └── requirements.md
└── tasks.md                 # Created by /speckit-tasks after plan approval
```

### Source Code (repository root)

```text
packages/runtime/
├── package.json
├── tsconfig.json
├── tsconfig.test.json
├── src/
    ├── index.ts
    ├── canonical-json.ts
    ├── aggregates.ts
    ├── commands.ts
    ├── diagnostics.ts
    ├── observations.ts
    ├── execution-record.ts
    ├── execute-command.ts
    └── progression/
        ├── graph.ts
        ├── state.ts
        ├── validate-graph.ts
        └── evaluate-progression.ts
└── test/
    ├── *.test.ts
    ├── *.type-test.ts
    ├── runtime.bench.ts
    └── progression/
        └── *.test.ts

packages/testkit/
├── package.json
├── tsconfig.json
├── tsconfig.test.json
├── src/
    ├── index.ts
    ├── scripted-observations.ts
    ├── aggregate-fixtures.ts
    ├── runtime-harness.ts
    ├── replay.ts
    └── assertions.ts
└── test/
    └── *.test.ts

package.json                     # Root test and verify commands
turbo.json                       # Test task orchestration
vitest.config.ts                 # Named runtime and testkit projects
```

**Structure Decision**: Extend only the existing `@plotpoint/runtime` and `@plotpoint/testkit` boundaries. Runtime owns the production contract and pure evaluators with root-only named exports. Testkit consumes the public runtime API and, for Gate 1, removes premature dependencies on compiler, database, modules, and protocol packages. Tests live in each package's dedicated `test/` directory, are excluded from production emission through test-specific TypeScript configurations, and run as named projects from one root Vitest configuration. Package scripts select their named project so filtered and root Turbo runs exercise the same setup.

## Phase 0: Research

Research is complete in [research.md](research.md). All technical-context decisions are resolved: canonical value rules, immutable boundaries, observation consumption, result discrimination, graph-round semantics, atomicity, package ownership, testing tools, and the limits of in-process ambient-authority enforcement.

## Phase 1: Design & Contracts

- [data-model.md](data-model.md) defines durable entities, relationships, validation, and lifecycle transitions.
- [runtime-api.md](contracts/runtime-api.md) fixes the Gate 1 root API, command result union, canonical boundary, execution order, and diagnostic categories.
- [progression-api.md](contracts/progression-api.md) fixes graph validity, simultaneous-round behavior, conflicts, cycles, and exact transition-limit semantics.
- [testkit-api.md](contracts/testkit-api.md) fixes scripted observation, scenario, replay, and evidence behavior.
- [quickstart.md](quickstart.md) exercises the designed API as an external game author would.
- The active Spec Kit block in `AGENTS.md` points to this plan and requires generated design artifacts to be read with the spec, plan, and tasks.

## Phase 2: Implementation Planning

Implementation tasks will be generated separately by `/speckit-tasks` after this plan is reviewed and ADR 0001 is explicitly accepted. Task generation must preserve dependency order: canonical values and diagnostics; aggregate/command contracts; execution and observation ledger; progression validation/evaluation; testkit and replay; public exports and Vitest/Turbo workspace wiring; then complete exit-evidence verification.
