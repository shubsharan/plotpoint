| Field           | Value       |
| --------------- | ----------- |
| **Type**        | PRD         |
| **Feature ID**  | FEAT-0007   |
| **Status**      | In Progress |
| **Epic**        | EPIC-0003   |
| **Domains**     | Engine      |
| **Last synced** | 2026-03-31  |

# FEAT-0007 - Block Registry and Action Executor

## Goal

Define the engine-owned block registry and pure action execution flow that update story state deterministically for the MVP block catalog.

## Background and Context

Once FEAT-0006 defines the runtime state model and public engine surface, Plotpoint needs the execution machinery that actually processes player actions. The architecture already establishes the core building block pattern: each block type contributes scope, initial state, and a pure `update()` reducer, while the executor locates the relevant block instance in the current story node, selects the right state bucket, and applies the reducer without embedding adapter logic.

This feature turns that pattern into the concrete PRD for block execution. It owns the MVP block catalog behavior inside the engine and keeps action handling deterministic, testable, and independent from API or mobile layers.

## Scope

### In scope

- Define the block definition contract used by the engine registry, including scope, initial-state behavior, action handling, and config interpretation.
- Define the block registry ownership model for the MVP block set in `packages/engine`.
- Define how the action executor resolves the targeted block instance from the current story state and published story package.
- Define how the executor chooses player-scoped versus shared game-scoped state when applying block updates.
- Define how action execution updates and returns the `RuntimeSnapshot` contract introduced by FEAT-0006 before later traversal semantics populate next-step availability.

### Out of scope

- Condition evaluation and graph traversal decisions after block state changes.
- Session checkpointing, persistence retry policy, or multiplayer coordination behavior.
- API route contracts, mobile renderer integration, or transport serialization details.
- Adding non-MVP block types beyond the baseline catalog already established by FEAT-0003.

## Requirements

1. The engine must define one block-definition contract that every MVP block implementation conforms to, including scope, initial-state behavior, and pure action update semantics.
2. The block registry must remain engine-owned and resolve block implementations by authored block type name from the published story package.
3. The action executor must locate the targeted block instance from the current runtime location and published story package data before attempting to execute a state transition.
4. The executor must choose the correct state container based on block scope, updating player-scoped state separately from shared game-scoped state inside the FEAT-0006 `RuntimeSnapshot`.
5. Block execution must remain pure at the block-definition level: block reducers cannot perform I/O or depend on API, db, or mobile code.
6. Unknown block types, invalid action shapes for a block, or invalid execution targets must fail explicitly rather than silently succeeding.
7. The MVP block catalog for this feature remains the engine-owned baseline from FEAT-0003: `text`, `location`, `code`, `single-choice`, and `multi-choice`.

## Architecture and Technical Notes

- Primary reference: `docs/architecture/hexagonal-feature-slice-architecture.md`
- The registry should live in the engine package and map authored block `type` values to engine-owned definitions.
- Block config schemas remain engine-owned metadata from FEAT-0003; this feature defines how those configs are consumed during runtime execution.
- The action executor is responsible for orchestration around block resolution and state-bucket selection, while per-block update logic stays in the block definitions themselves.
- This feature updates the FEAT-0006 `RuntimeSnapshot`; FEAT-0008 later decides how the reserved progression fields are populated from that updated runtime state.
- Keep test fixtures internal to the engine package under `__tests__` and avoid creating public test-only exports.

## Acceptance Criteria

- A single engine-owned block definition contract exists for the MVP block set.
- The registry resolves authored block types to block implementations without involving API or db layers.
- The action executor updates the correct runtime state bucket based on block scope and returns the FEAT-0006 `RuntimeSnapshot` contract.
- Block execution behavior is deterministic and explicit for known blocks, invalid actions, and unknown targets.
- The feature leaves traversal decisions to FEAT-0008 instead of mixing progression semantics into block execution.

## Test Plan

- Add unit tests for registry lookup success and failure cases.
- Add unit tests for each MVP block definition covering initial state and representative action transitions.
- Add executor tests that prove user-scoped and game-scoped blocks update the correct state container inside `RuntimeSnapshot`.
- Add failure-path tests for unknown block types, invalid block targets, and invalid block action payloads.

## Rollout and Observability

- Internal engine rollout only; later route handlers and mobile surfaces consume the execution results rather than duplicating block logic.
- Surface execution failures through explicit engine errors so adapters can expose or log them consistently later.
- Success is measured by the MVP block catalog becoming executable through one pure engine-owned registry and executor path.

## Risks and Mitigations

- Risk: block implementations accumulate orchestration logic that belongs in the executor. Mitigation: keep block definitions pure and centralize orchestration in the executor.
- Risk: scope handling becomes inconsistent across blocks. Mitigation: make scope a first-class contract on every block definition and test both state buckets directly.
- Risk: block catalog behavior drifts from the FEAT-0003 contract. Mitigation: treat authored `type` plus `config` as the only serialized input and keep runtime metadata engine-owned.

## Open Questions

- None. This feature is limited to engine-owned block execution behavior for the MVP block catalog.
