| Field                         | Value |
| ----------------------------- | ----- |
| **Status**                    | Completed |
| **Parent Epic**               | [EPIC-0003-headless-runtime-engine-and-condition-system](../epics/EPIC-0003-headless-runtime-engine-and-condition-system.md) |
| **Related Feature PRDs**      | [FEAT-0006-runtime-state-model-and-engine-public-surface](../features/FEAT-0006-runtime-state-model-and-engine-public-surface.md)<br>[FEAT-0008-condition-registry-and-graph-traversal-semantics](../features/FEAT-0008-condition-registry-and-graph-traversal-semantics.md) |
| **Related ADRs**              | [ADR-0002-headless-engine-runtime-boundary](../adrs/ADR-0002-headless-engine-runtime-boundary.md) |
| **Related Architecture Docs** | [hexagonal-feature-slice-architecture](../architecture/hexagonal-feature-slice-architecture.md) |

# FEAT-0007 - Block Registry and Action Executor

## Goal

Define and implement the engine-owned block registry plus deterministic block execution contracts for the MVP block catalog, including strict action/state/error semantics and explicit execution ordering.

## Background and Context

FEAT-0006 established runtime state shape and engine entrypoints (`startSession`, `loadSession`, `submitAction`, `traverse`) but intentionally did not define concrete block execution semantics. FEAT-0007 now owns the block-interaction half of that runtime surface.

The architecture baseline remains: block definitions own pure per-block logic, while the executor owns orchestration (block resolution, validation sequence, state bucket selection, and runtime error mapping). Execution remains engine-only and host-agnostic.

## Scope

### In scope

- Define and enforce one block definition contract used by the registry, including `configSchema`, `stateSchema`, `actionSchema`, `initialState(config)`, and pure `onAction(state, action, context, config)`.
- Define the block registry ownership model for the MVP block set in `packages/engine`.
- Define deterministic `submitAction` orchestration and validation/error order.
- Define state-bucket routing behavior for `playerState.blockStates` vs `sharedState.blockStates`.
- Define interactive vs non-interactive block execution policy (`text` is non-interactive and resolves its unlocked state through the hydrated current-node snapshot).
- Define typed runtime error surface for all block execution failures.
- Define ordered implementation and test sequence for this feature.

### Out of scope

- Condition evaluation and graph traversal decisions after block state changes.
- Session checkpointing, persistence retry policy, or multiplayer coordination behavior.
- API route contracts, mobile renderer integration, or transport serialization details.
- Adding non-MVP block types beyond the baseline catalog already established by FEAT-0003.
- Runtime-state migration/repair helpers (including orphan-state cleanup policy).
- External place-to-coordinate resolution infrastructure.

## Requirements

1. The engine must define one block-definition contract that every executable MVP block conforms to, including runtime state-bucket policy, `stateSchema`, `actionSchema`, `initialState(config)`, and pure `onAction`.
2. The registry must remain engine-owned and resolve authored block `type` values to definitions.
3. `submitAction` must target exactly one block in the current node and reject non-current-node targets.
4. `submitAction` must apply a fixed validation/execution order and return the first failure deterministically.
5. `submitAction` must select exactly one runtime state bucket by block policy and only mutate the targeted block key.
6. Execution must stay pure at reducer level: reducers receive plain values and return next state only for the target block; no I/O and no cross-block writes.
7. Unknown block types, unregistered runtime block types, invalid configs, invalid persisted block state, invalid action payloads, non-actionable targets, already-unlocked targets, unsupported location targets, and reducer crashes must fail with explicit typed runtime errors.
8. Canonical condition-facing terminal state field is `unlocked: boolean` (not `solved`), monotonic (`false -> true`).
9. Runtime block state must remain JSON-serializable only.
10. The MVP catalog stays `text`, `location`, `code`, `single-choice`, `multi-choice`; `text` is non-interactive in FEAT-0007.

## Architecture and Technical Notes

- Primary reference: `docs/architecture/hexagonal-feature-slice-architecture.md`
- Durable decision record: [ADR-0002-headless-engine-runtime-boundary](../adrs/ADR-0002-headless-engine-runtime-boundary.md)
- Keep engine boundaries strict (`mobile -> api -> engine <- db`): no adapter logic in block definitions or executor.
- Registry lives in `packages/engine` and maps authored `type` to engine-owned definition objects.
- Config/state/action validation is schema-owned at block-definition level, orchestrated by executor.
- Action context is value-only (`now`, `playerLocation`) resolved at executor boundary; block behaviors never receive ports.
- `loadSession` remains non-mutating rehydration and resolves effective current-node block state from sparse persisted runtime data.
- Shell owns navigation UX from `traversableEdges`; blocks do not own graph navigation controls.
- FEAT-0007 originally shipped unconditional edges only in `traversableEdges`; FEAT-0008 defines full condition-aware traversable-edge derivation and `traverse` eligibility (see FEAT-0008).
- Keep test fixtures internal to engine `__tests__`; no public test-only exports.
- The durable runtime-boundary record for executor ownership, block purity, bucket routing, and generic submit-envelope semantics lives in [ADR-0002-headless-engine-runtime-boundary](../adrs/ADR-0002-headless-engine-runtime-boundary.md).

## Locked Contracts

### Block definition contract

- Executable blocks (`code`, `single-choice`, `multi-choice`, `location`) define:
- `configSchema`
- `stateSchema`
- `actionSchema` (strict)
- `initialState(config)`
- `onAction(state, action, context, config)`
- Runtime state-bucket policy remains engine-owned registry metadata rather than authored content.
- Non-interactive blocks may still define config metadata but are rejected by `submitAction`.

### Interactive policy

- `text` is non-interactive for FEAT-0007.
- `text` block state resolves deterministically as unlocked in the hydrated current-node snapshot and does not require persisted state.
- `submitAction` on `text` fails explicitly as non-actionable.

### Canonical state semantics

- Condition-facing terminal field is `unlocked`.
- `unlocked` is monotonic.
- Already-unlocked interactive blocks reject new actions with a typed error.
- `single-choice` and `multi-choice` lock on first valid submission.
- `code` can lock terminally via `maxAttempts`; without `maxAttempts`, retries remain unlimited.
- `location` unlock remains terminal once true.

### Action vocabulary (MVP)

- Interactive block actions use a generic `type: 'submit'` envelope.
- `code`: `{ type: 'submit', value: string }`
- `single-choice`: `{ type: 'submit', optionId: string }`
- `multi-choice`: `{ type: 'submit', optionIds: string[] }`
- `location`: `{ type: 'submit' }`
- `text`: no `submitAction` path

### Deterministic execution order

1. Resolve runtime context and ensure target block exists in current node.
2. Resolve registry definition for block type.
3. Parse block config with block `configSchema`.
4. Resolve existing block state from scoped bucket; if missing, lazy-init from `initialState(config)`.
5. If existing state is present, parse with block `stateSchema`.
6. If state is already unlocked, reject with typed `already_unlocked`.
7. Parse incoming action with block `actionSchema`.
8. Execute block action behavior with value-only context.
9. Parse reducer output with block `stateSchema`.
10. Persist to exactly one scoped bucket key and return updated `RuntimeFrame`.

### Error contract expectations

- Keep `runtime_snapshot_invalid` for entrypoint payload-shape failures only.
- Introduce typed block-execution errors for:
- block type unregistered at runtime
- block action invalid for type
- block state invalid
- block already unlocked
- unsupported location target kind (`place`)
- reducer execution failure (wrapped with `cause`)
- Errors carry structured `details` (`blockId`, `blockType`, `nodeId`, `actionType`, etc.) in addition to code/message.

### State integrity and compatibility rules

- Preserve orphan block-state entries for now (ignore, do not prune).
- `submitAction` mutates only the targeted key in one bucket.
- Use copy-on-write semantics and keep untouched paths reference-stable.
- Persist timestamps as ISO strings only when clock port is present; no `Date` objects and no fallback wall-clock source.
- Normalize multi-choice selections (dedupe + deterministic sort) before compare/persist.
- Wrong-but-valid answers are state outcomes; malformed action payloads are typed errors.
- At FEAT-0007 ship, `traversableEdges` was a fail-safe projection of authored unconditional edges only and `traverse` rejected conditioned edges; FEAT-0008 removes that placeholder behavior.

## Acceptance Criteria

- A single engine-owned executable block-definition contract exists and is applied consistently.
- Registry resolves authored block types to engine definitions with no API/db coupling.
- `submitAction` enforces current-node-only, single-target, strict action contracts, and deterministic validation/error order.
- Executor updates exactly one scoped bucket key and returns FEAT-0006 `RuntimeFrame`.
- Canonical terminal field across executable blocks is `unlocked`.
- `text` behavior is non-interactive and resolves its state from deterministic defaults in the current-node snapshot.
- Error surface is explicit and typed for all execution failure classes in this PRD.
- Traversal/navigation semantics beyond the FEAT-0007 placeholder are defined in FEAT-0008.

## Test Plan

- Add registry tests for lookup success/failure and unregistered runtime type failures.
- Add block-definition tests per interactive block for:
- strict action parsing
- lazy initialization
- unlock transitions
- already-unlocked rejection
- invalid-state rejection
- Add executor tests for:
- current-node-only targeting
- single-target mutation
- bucket routing (including shared-bucket via scoped harness)
- deterministic validation/error order
- copy-on-write reference stability
- Add deterministic replay tests (same initial state + action sequence => identical snapshot output).
- Add location tests for:
- coordinates target success/failure paths
- unsupported `place` target typed failure
- null location vs location-read failure distinction
- Add contract tests ensuring `unlocked` is the only condition-facing terminal field and fixtures no longer rely on `solved`.
- Add runtime error contract tests for structured `details` payloads.

## Rollout and Observability

- Internal engine rollout only; later route handlers and mobile surfaces consume the execution results rather than duplicating block logic.
- Surface execution failures through explicit typed engine errors with structured details so adapters can map consistently.
- Success is measured by MVP executable blocks running through one deterministic registry/executor path with stable `unlocked` semantics.

## Risks and Mitigations

- Risk: block implementations absorb orchestration concerns. Mitigation: enforce reducer-local responsibilities and executor-owned sequencing.
- Risk: terminal state semantics drift (`solved` vs `unlocked`). Mitigation: hard-standardize on `unlocked` and update fixtures/conditions accordingly.
- Risk: hydration and execution boundaries blur. Mitigation: keep persisted runtime state sparse and make current-node hydration a read-side projection rather than a persistence mutation.
- Risk: adapters parse messages instead of contracts. Mitigation: include structured error details in runtime errors.
- Risk: traversal follow-on could depend on unstable execution contracts. Mitigation: lock the generic `submit` action envelope and deterministic executor behavior in this feature (FEAT-0008 built on that contract).

## Implementation Order (Do In This Sequence)

1. Extend runtime error model
- Add new typed execution codes and structured `details` support in `EngineRuntimeError`.
- Keep backward-compatible handling for existing FEAT-0006 error paths.

2. Introduce executable block-definition contract
- Add `stateSchema`, `actionSchema`, `initialState`, and `onAction` contract primitives.
- Implement interactive block definitions (`code`, `single-choice`, `multi-choice`, `location`) against this contract.

3. Implement non-interactive text policy
- Mark `text` non-actionable for executor.
- Resolve text unlocked state through sparse effective-state hydration instead of writing default block state into persistence.

4. Implement executor orchestration
- Enforce fixed validation/execution order.
- Enforce current-node-only and single-target behavior.
- Route to one scoped state bucket and apply copy-on-write mutation.
- Reject already-unlocked and non-actionable targets.

5. Finalize deterministic block semantics
- Code retries/lock behavior and attempt metadata.
- Choice lock-on-first-valid behavior.
- Multi-choice normalization.
- Location coordinates execution behavior and unsupported `place` failure.
- ISO timestamp policy with explicit clock-port dependence.

6. Update condition-facing contracts and fixtures
- Replace condition/state references of `solved` with `unlocked`.
- Ensure fixtures and tests reflect the canonical field.

7. Complete test matrix
- Registry, block, executor, deterministic replay, error details, and shared-bucket harness tests.
- Keep traversal condition semantics out of FEAT-0007 assertions (covered in FEAT-0008).

## Open Questions

- None. This PRD now locks FEAT-0007 execution contracts and ordering for implementation.
