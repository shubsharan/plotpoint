| Field           | Value       |
| --------------- | ----------- |
| **Type**        | PRD         |
| **Feature ID**  | FEAT-0008   |
| **Status**      | Completed   |
| **Epic**        | EPIC-0003   |
| **Domains**     | Engine      |
| **Last synced** | 2026-04-15  |

# FEAT-0008 - Traversal Fact View and Graph Traversal Semantics

## Goal

Ship the engine-owned traversal fact view and conditioned-edge traversal semantics that determine available edges after runtime state changes, replacing FEAT-0007's unconditional-edge-only placeholder behavior.

## Background and Context

FEAT-0006 locked runtime contracts and FEAT-0007 locked block execution. FEAT-0008 completes EPIC-0003 progression semantics by making conditioned authored edges executable and deterministic.

This feature owns condition evaluation, traversable-edge derivation, and `traverse` eligibility. Session orchestration, persistence timing, and UX remain out of scope.

## Scope

### In scope

- Fact-based condition contract used by both compatibility validation and runtime traversal.
- Condition-aware traversable-edge derivation for `startSession`, `loadSession`, `submitAction`, and `traverse`.
- Deterministic `traverse` validation against the derived traversable set at command time.
- Typed failure contracts for blocked traversal vs condition-evaluation failures.
- Block-exported traversal fact contracts and bucket-hidden fact resolution.

### Out of scope

- Session completion/checkpoint orchestration/resume orchestration policy.
- Mobile/API transport or presentation concerns.
- Role-aware traversal semantics (no implicit `roleId` conditions in this feature).
- Global/system fact providers outside authored blocks.
- Array/object/timestamp/geocoordinate fact values.

## Decision Lock

### Authored Condition Contract

- Authored leaves use `{ type: 'fact', blockId, fact }` or `{ type: 'fact', blockId, fact, operator, value }`.
- `always`, `and`, and `or` remain unchanged.
- Omitted `operator` means the referenced fact must be boolean and must equal `true`.
- `eq` and `neq` support `boolean`, `number`, and `string` facts.
- `gt`, `gte`, `lt`, and `lte` support `number` facts only.
- Legacy `check.condition + params` leaves are removed with no translation layer.

### Block Traversal Fact Contract

- Each block registry entry exports `traversal.facts`, a map of stable semantic fact names.
- Each fact declares a primitive `kind` (`boolean`, `number`, `string`) plus a pure `derive({ state, config })` projector.
- Traversal facts are derived from effective block `state + config` only.
- Fact projectors never access ports, clocks, locations, or other blocks directly.
- Buckets (`playerState`, `sharedState`) remain persistence concerns; authored conditions never reference them.

### Runtime State Resolution

- Conditions may reference any block id in the story package (not only current-node blocks).
- Referenced block state bucket is derived from block registry policy (`playerState` vs `sharedState`), not authored condition data.
- Condition evaluation runs against effective block state (persisted value when present, otherwise deterministic `initialState(config)`).
- Resolver work is command-scoped and memoized by block runtime and `(blockId, fact)` pairs.
- Runtime state remains pinned to `storyPackageVersionId`; mid-game upgrades remain explicit session orchestration work (DF-0001).

### Traversal Evaluation Semantics

- A single fact-aware evaluator is used by all runtime entrypoints:
  - `startSession`
  - `loadSession`
  - `submitAction`
  - `traverse` (including next-node snapshot derivation)
- Unconditional edges (`condition` omitted) remain always traversable fast-path.
- Authored `condition: { type: 'always' }` is semantically equivalent to omitted condition.
- `and` and `or` use short-circuit evaluation.
- Condition trees are evaluated in authored order; first failure is deterministic by authored edge/condition order.
- `traverse` re-validates edge traversability at call time against current state, even if caller used an older frame.
- `RuntimeFrame` envelope stays unchanged (`{ state, view }`); `traversableEdges` remains an available-edges list under `view`.

### Error Contract

- Keep `runtime_edge_not_found` for unknown edge ids.
- Keep `runtime_edge_not_traversable` for known edges that are currently blocked (for example `reason: 'condition_false'`).
- Add dedicated `runtime_condition_evaluation_failed` for:
  - missing/invalid referenced blocks or facts,
  - invalid operator or value usage that reaches runtime defensively,
  - fact projectors that throw,
  - fact projectors that return values incompatible with their declared kind.
- If any edge evaluation in the current node fails with condition-evaluation error, the whole runtime command fails; no partial `traversableEdges` snapshot is returned.

### Compatibility Validation Contract

- Compatibility validation checks referenced block existence, exported fact existence, operator legality, and authored value type in a single pass.
- Validation issues are reported with precise paths under `graph.nodes[*].edges[*].condition...`, including nested combinator child indexes.
- Runtime keeps defensive validation and can still fail with `runtime_condition_evaluation_failed` if invalid data reaches execution.

## Architecture and Technical Notes

- Primary reference: `docs/architecture/hexagonal-feature-slice-architecture.md`
- FEAT-0003 remains the authored condition-tree schema boundary, with FEAT-0008 intentionally breaking the leaf shape.
- FEAT-0006 remains the outer runtime contract boundary; FEAT-0008 changes traversal semantics only.
- Traversal logic stays pure and engine-owned; block reducers remain independent and block-specific semantics stay inside block-owned fact projectors.
- No new cross-package boundary is introduced; no ADR required.
- `currentEngineMajor` is bumped to `1` so published packages authored against the old `check` leaf shape fail explicitly instead of drifting under the old compatibility number.

## Acceptance Criteria

- Conditioned and unconditional authored edges are derived correctly into `RuntimeFrame.view.traversableEdges` across all runtime entrypoints using one evaluator.
- `traverse` enforces current eligibility deterministically and updates `currentNodeId` only on valid traversals.
- Runtime distinguishes blocked-edge outcomes from condition-evaluation failures via typed error codes.
- Compatibility validation catches unknown blocks, unknown facts, missing operators, and invalid values with precise paths.
- Runtime state sparsity semantics remain intact via effective-state resolution.
- `RuntimeFrame` contract envelope remains `{ state, view }`.
- FEAT-0007 deferred traversal placeholder behavior is fully removed from runtime semantics.

## Test Plan

- Add cross-entrypoint parity tests proving identical `view.traversableEdges` for equivalent effective state across `startSession`, `loadSession`, `submitAction`, and `traverse`.
- Add traversal tests for:
  - successful conditioned-edge traversal,
  - blocked edges (`runtime_edge_not_traversable`),
  - unknown edge ids (`runtime_edge_not_found`),
  - evaluation failures (`runtime_condition_evaluation_failed`).
- Add mixed-bucket tests proving the same authored fact condition resolves through either persistence bucket based on block policy.
- Add condition-operator and value-shape tests for boolean/number/string facts.
- Add deterministic ordering tests for authored edge order and first-failure behavior.
- Add regression tests proving unconditional-only stories behave identically after FEAT-0008.

## Rollout and Observability

- Internal engine rollout only; later API/mobile surfaces consume available-edge results rather than re-evaluating conditions themselves.
- Surface typed traversal and condition-evaluation errors with structured details for adapter logging/serialization.
- Close deferred follow-up [DF-0002](../runbooks/deferred-followups.md) now that implementation/tests/docs have removed the FEAT-0007 placeholder behavior.

## Risks and Mitigations

- Risk: evaluator drift between runtime entrypoints. Mitigation: single shared evaluator and parity tests.
- Risk: hidden traversal faults from partial edge filtering. Mitigation: fail whole command on evaluation errors.
- Risk: condition contracts drift between compatibility/runtime. Mitigation: block-exported fact metadata is shared by both layers.

## Open Questions

- None. Design decisions are locked and implementation-ready.
