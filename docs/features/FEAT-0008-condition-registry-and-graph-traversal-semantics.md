| Field           | Value       |
| --------------- | ----------- |
| **Type**        | PRD         |
| **Feature ID**  | FEAT-0008   |
| **Status**      | In Progress |
| **Epic**        | EPIC-0003   |
| **Domains**     | Engine      |
| **Last synced** | 2026-04-02  |

# FEAT-0008 - Condition Registry and Graph Traversal Semantics

## Goal

Ship the engine-owned condition system and traversal semantics that determine available edges after runtime state changes, replacing FEAT-0007's unconditional-edge-only placeholder behavior.

## Background and Context

FEAT-0006 locked runtime contracts and FEAT-0007 locked block execution. FEAT-0008 completes EPIC-0003 progression semantics by making conditioned authored edges executable and deterministic.

This feature owns condition evaluation, traversable-edge derivation, and `traverseEdge` eligibility. Session orchestration, persistence timing, and UX remain out of scope.

## Scope

### In scope

- Condition registry contract used by both compatibility validation and runtime traversal.
- Condition-aware traversable-edge derivation for `startGame`, `loadRuntime`, `performBlockAction`, and `traverseEdge`.
- Deterministic `traverseEdge` validation against the derived traversable set at command time.
- Typed failure contracts for blocked traversal vs condition-evaluation failures.

### Out of scope

- Session completion/checkpoint orchestration/resume orchestration policy.
- Mobile/API transport or presentation concerns.
- Role-aware traversal semantics (no implicit `roleId` conditions in this feature).
- Async or I/O-backed condition functions.
- Nested field-path condition params (top-level block-state fields only).

## Decision Lock

### Condition Registry Contract

- `graph/conditions.ts` is a typed registry of condition definitions, not a name-only map.
- Each condition definition exposes:
  - `paramsSchema` for compatibility/runtime validation.
  - `evaluate` function with pure, synchronous semantics.
- Built-ins remain: `field-equals`, `field-compare`, `array-includes`, `array-length`, `time-elapsed`, `within-radius`.
- Condition params remain JSON-serializable only.
- Runtime evaluators receive value context only and never access ports directly.

### Condition Param and Operator Semantics

- `field-equals` and `array-includes` use strict equality semantics (no type coercion).
- `field-equals` value comparisons are limited to JSON primitives (`string`, `number`, `boolean`, `null`).
- `field-compare`, `array-length`, and `time-elapsed` share one canonical operator set: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`.
- Unknown operators are evaluation failures.
- `array-includes` and `array-length` require referenced state fields to be arrays; non-array values are evaluation failures.
- Condition params reference top-level block-state fields only (no nested path DSL).
- `time-elapsed` and `within-radius` use dedicated params contracts tied to canonical state semantics.
- `within-radius` is evaluated from persisted/effective block state only; traversal evaluation does not call `locationReader`.
- `time-elapsed` requires a command-scoped `now` and valid ISO timestamp input; missing/invalid time inputs are evaluation failures.

### Runtime State Resolution

- Conditions may reference any block id in the story package (not only current-node blocks).
- Referenced block state bucket is derived from block registry policy (`playerState` vs `sharedState`), not authored params.
- Condition evaluation runs against effective block state (persisted value when present, otherwise deterministic `initialState(config)`).
- Missing referenced block ids, missing required fields, or invalid field shapes are evaluation failures.
- Runtime state remains pinned to `storyPackageVersionId`; mid-game upgrades remain explicit session orchestration work (DF-0001).

### Traversal Evaluation Semantics

- A single condition-aware evaluator is used by all runtime entrypoints:
  - `startGame`
  - `loadRuntime`
  - `performBlockAction`
  - `traverseEdge` (including next-node snapshot derivation)
- Unconditional edges (`condition` omitted) remain always traversable fast-path.
- Authored `condition: { type: 'always' }` is semantically equivalent to omitted condition.
- `and` and `or` use short-circuit evaluation.
- Condition trees are evaluated in authored order; first failure is deterministic by authored edge/condition order.
- Command evaluation uses a single command-scoped timestamp snapshot (`clock.now()` resolved at most once).
- `traverseEdge` re-validates edge traversability at call time against current state, even if caller used an older snapshot.
- `RuntimeSnapshot` shape stays unchanged; `traversableEdges` remains an available-edges list only.

### Error Contract

- Keep `runtime_edge_not_found` for unknown edge ids.
- Keep `runtime_edge_not_traversable` for known edges that are currently blocked (for example `reason: 'condition_false'`).
- Remove FEAT-0007 placeholder reason usage (`conditioned_edge_deferred`) from runtime behavior.
- Add dedicated `runtime_condition_evaluation_failed` for:
  - unknown condition name at runtime,
  - malformed condition params,
  - missing/invalid referenced block or field,
  - invalid operators or incompatible state shape,
  - missing clock/invalid time inputs for time-based conditions,
  - incompatible block state for condition type (for example `within-radius` on non-location state).
- If any edge evaluation in the current node fails with condition-evaluation error, the whole runtime command fails; no partial `traversableEdges` snapshot is returned.

### Compatibility Validation Contract

- Compatibility validation checks both unknown condition names and invalid condition params in a single pass.
- Validation issues are reported with precise paths under `graph.nodes[*].edges[*].condition...`, including nested combinator child indexes.
- Runtime keeps defensive validation and can still fail with `runtime_condition_evaluation_failed` if invalid data reaches execution.

## Architecture and Technical Notes

- Primary reference: `docs/architecture/hexagonal-feature-slice-architecture.md`
- FEAT-0003 remains the fixed authored condition-tree schema boundary.
- FEAT-0006 remains the outer runtime contract boundary; FEAT-0008 changes traversal semantics only.
- Traversal logic stays pure and engine-owned; block reducers remain independent.
- No new cross-package boundary is introduced; no ADR required.

## Acceptance Criteria

- Conditioned and unconditional authored edges are derived correctly into `RuntimeSnapshot.traversableEdges` across all runtime entrypoints using one evaluator.
- `traverseEdge` enforces current eligibility deterministically and updates `currentNodeId` only on valid traversals.
- Runtime distinguishes blocked-edge outcomes from condition-evaluation failures via typed error codes.
- Compatibility validation catches unknown condition names and invalid params with precise paths.
- Runtime state sparsity semantics remain intact via effective-state resolution.
- `RuntimeSnapshot` contract shape remains unchanged.
- FEAT-0007 deferred traversal placeholder behavior is fully removed from runtime semantics.

## Test Plan

- Add cross-entrypoint parity tests proving identical `traversableEdges` for equivalent effective state across `startGame`, `loadRuntime`, `performBlockAction`, and `traverseEdge`.
- Add traversal tests for:
  - successful conditioned-edge traversal,
  - blocked edges (`runtime_edge_not_traversable`),
  - unknown edge ids (`runtime_edge_not_found`),
  - evaluation failures (`runtime_condition_evaluation_failed`).
- Add mixed-bucket condition-tree tests combining player-scoped and shared-scoped block state references.
- Add condition-operator and param-shape tests (strict equality, canonical operators, array-only checks, time/location contracts).
- Add deterministic ordering tests for authored edge order and first-failure behavior.
- Add regression tests proving unconditional-only stories behave identically after FEAT-0008.
- Add one integrated fixture covering all built-in condition types in one graph.

## Rollout and Observability

- Internal engine rollout only; later API/mobile surfaces consume available-edge results rather than re-evaluating conditions themselves.
- Surface typed traversal and condition-evaluation errors with structured details for adapter logging/serialization.
- Close deferred follow-up `DF-0002` when implementation/tests/docs land and FEAT-0007 placeholder assertions are removed.

## Risks and Mitigations

- Risk: evaluator drift between runtime entrypoints. Mitigation: single shared evaluator and parity tests.
- Risk: hidden traversal faults from partial edge filtering. Mitigation: fail whole command on evaluation errors.
- Risk: condition contracts drift between compatibility/runtime. Mitigation: typed registry shared by both layers.

## Open Questions

- None. Design decisions are locked and implementation-ready.
