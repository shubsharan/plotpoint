| Field           | Value       |
| --------------- | ----------- |
| **Type**        | PRD         |
| **Feature ID**  | FEAT-0008   |
| **Status**      | Not Started |
| **Epic**        | EPIC-0003   |
| **Domains**     | Engine      |
| **Last synced** | 2026-03-30  |

# FEAT-0008 - Condition Registry and Graph Traversal Semantics

## Goal

Define the engine-owned condition evaluation and graph traversal semantics that determine which story paths become available after runtime state changes.

## Background and Context

With FEAT-0006 defining the runtime surface and FEAT-0007 defining action execution, the remaining core runtime behavior is story progression. Plotpoint stories are directed graphs with conditional edges, and the architecture already describes a condition tree model backed by a named condition registry and a pure traversal evaluator. This feature turns that architectural direction into the PRD for determining what a player can do next.

This is the feature that makes branching narrative semantics concrete without taking on broader session orchestration. It owns condition evaluation, traversal results, and progression rules after runtime state changes, while leaving persistence, sync, and UI consequences to later layers.

## Scope

### In scope

- Define the condition registry contract and evaluation behavior for the built-in condition set.
- Define the evaluation context available to conditions during traversal, including runtime state and contextual inputs the engine is allowed to read.
- Define graph traversal semantics for determining available edges from the current node after state changes.
- Define the traversal payload that populates FEAT-0006 progression fields such as `RuntimeSnapshot.availableEdges`.
- Define failure behavior for invalid traversal targets, unknown condition names, and malformed condition trees that survive earlier validation boundaries.

### Out of scope

- Block reducer behavior or registry ownership beyond the execution outputs this feature consumes.
- Session completion, checkpoint orchestration, resume policy, or multiplayer coordination logic.
- Mobile presentation of available choices or API request/response serialization.
- New story package-schema authoring rules beyond the FEAT-0003 condition tree contract.

## Requirements

1. The engine must define one condition registry that resolves authored condition names to engine-owned evaluation functions.
2. Condition evaluation must support the serialized tree forms already established by FEAT-0003: `check`, `and`, `or`, and `always`.
3. Traversal evaluation must operate against the current runtime state view after block execution, including both player-scoped and shared state where relevant.
4. The evaluation context must be explicit and limited to engine-approved inputs such as current time or location-reader data exposed through engine ports.
5. The traversal layer must return deterministic available-edge results for the current node without redefining the outer runtime result envelope owned by FEAT-0006.
6. Unknown condition names, invalid current-node references, and malformed traversal inputs must fail explicitly.
7. This feature must define progression semantics only; it must not decide session persistence timing, realtime broadcast behavior, or mobile UX flow.

## Architecture and Technical Notes

- Primary reference: `docs/architecture/hexagonal-feature-slice-architecture.md`
- FEAT-0003 already fixes the serialized condition tree contract; this feature owns the runtime interpretation of those trees.
- The condition registry lives in the engine package and should be extensible through engine-owned additions, not adapter configuration.
- Traversal operates on the merged runtime state view produced after action execution, but must not own block update logic itself.
- FEAT-0006 owns the outer `RuntimeSnapshot` contract. This feature defines only the traversal semantics and payload data that populate progression fields such as `availableEdges`.
- Evaluation context should remain narrow and explicit so future geolocation or time-based conditions do not leak infrastructure concerns into unrelated engine surfaces.
- No new ADR is required unless condition evaluation needs a new cross-package boundary beyond the current engine-port model.

## Acceptance Criteria

- The engine defines one condition registry for the built-in condition set and resolves authored condition names deterministically.
- Traversal produces explicit available-edge results from the current node using the current runtime state view and populates the FEAT-0006 progression fields without replacing the outer runtime contract.
- Condition evaluation supports compound trees and uses a documented evaluation context rather than hidden globals.
- Unknown conditions, invalid traversal targets, and malformed runtime inputs fail explicitly.
- The feature leaves session/save orchestration and mobile presentation to later work.

## Test Plan

- Add unit tests for each built-in condition and representative parameter combinations.
- Add unit tests for compound `and` / `or` / `always` trees and mixed-condition scenarios.
- Add traversal tests that verify available-edge resolution for current-node success, blocked edges, and invalid node references.
- Add tests that prove player-scoped and shared-state values are both available to traversal after execution updates.

## Rollout and Observability

- Internal engine rollout only; later API/mobile surfaces consume available-edge results rather than re-evaluating conditions themselves.
- Surface traversal failures explicitly so adapters can log or serialize them later without guessing root cause.
- Success is measured by story progression decisions becoming deterministic, testable, and engine-owned.

## Risks and Mitigations

- Risk: traversal starts owning block execution or session orchestration concerns. Mitigation: keep this feature focused on post-update evaluation and edge availability only.
- Risk: condition context grows into an implicit adapter dependency surface. Mitigation: keep evaluation inputs explicit and port-backed where external data is needed.
- Risk: runtime interpretation diverges from the FEAT-0003 serialized contract. Mitigation: treat the existing condition tree schema as fixed input and only define execution semantics here.

## Open Questions

- None. This feature defines runtime condition and traversal semantics only.
