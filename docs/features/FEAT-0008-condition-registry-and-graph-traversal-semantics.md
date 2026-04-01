| Field           | Value       |
| --------------- | ----------- |
| **Type**        | PRD         |
| **Feature ID**  | FEAT-0008   |
| **Status**      | Not Started |
| **Epic**        | EPIC-0003   |
| **Domains**     | Engine      |
| **Last synced** | 2026-04-01  |

# FEAT-0008 - Condition Registry and Graph Traversal Semantics

## Goal

Define the engine-owned graph traversal semantics that determine which story paths become available after runtime state changes, replacing FEAT-0007's fail-safe unconditional-edge-only behavior.

## Background and Context

With FEAT-0006 defining the runtime surface and FEAT-0007 defining action execution, the remaining core runtime behavior is story progression. FEAT-0007 intentionally exposes only unconditional edges in `traversableEdges` and rejects conditioned authored edges as not yet traversable so the branch stays fail-safe. FEAT-0008 owns replacing that placeholder behavior with real traversal semantics for conditioned authored edges.

This is the feature that makes branching narrative semantics concrete without taking on broader session orchestration. It owns condition evaluation, traversal results, and progression rules after runtime state changes, while leaving persistence, sync, and UI consequences to later layers. The shell renders traversal choices, but the engine remains the authority for traversal state changes through `traverseEdge`.

## Scope

### In scope

- Define graph traversal semantics for determining available edges from the current node after state changes.
- Define the `traverseEdge` runtime command that validates a selected traversable edge and advances the runtime to the target node.
- Define the traversal payload that populates FEAT-0006 progression fields such as `RuntimeSnapshot.traversableEdges`.
- Define failure behavior for invalid traversal targets and blocked authored edges once real traversal semantics exist.

### Out of scope

- Block reducer behavior or registry ownership beyond the execution outputs this feature consumes.
- Session completion, checkpoint orchestration, resume policy, or multiplayer coordination logic.
- Mobile presentation of available choices or API request/response serialization.
- New story package-schema authoring rules beyond the FEAT-0003 condition tree contract.

## Requirements

1. Traversal evaluation must operate against the current runtime state view after block execution, including both player-scoped and shared state where relevant.
2. The traversal layer must return deterministic available-edge results for the current node without redefining the outer runtime result envelope owned by FEAT-0006.
3. FEAT-0008 must replace FEAT-0007's unconditional-edge-only placeholder semantics with real conditioned-edge derivation.
4. Invalid current-node references, blocked authored edges, and malformed traversal inputs must fail explicitly.
5. This feature must define progression semantics only; it must not decide session persistence timing, realtime broadcast behavior, or mobile UX flow.

## Architecture and Technical Notes

- Primary reference: `docs/architecture/hexagonal-feature-slice-architecture.md`
- FEAT-0003 already fixes the serialized edge condition contract; this feature owns the runtime interpretation of those authored conditions.
- Traversal operates on the merged runtime state view produced after block action execution, but must not own block update logic itself.
- `traverseEdge` is the only runtime command that changes `currentNodeId`; shell/UI layers choose when to invoke it.
- FEAT-0006 owns the outer `RuntimeSnapshot` contract. This feature defines only the traversal semantics and payload data that populate progression fields such as `traversableEdges`.
- No new ADR is required unless condition evaluation needs a new cross-package boundary beyond the current engine-port model.

## Acceptance Criteria

- Traversal produces explicit edge results from the current node using the current runtime state view, populates `RuntimeSnapshot.traversableEdges`, and validates `traverseEdge` selections without replacing the outer runtime contract.
- FEAT-0008 replaces FEAT-0007's unconditional-edge-only placeholder behavior with correct conditioned-edge derivation.
- Invalid traversal targets, blocked authored edges, and malformed runtime inputs fail explicitly.
- The feature leaves session/save orchestration and mobile presentation to later work.

## Test Plan

- Add traversal tests that verify traversable-edge resolution, successful `traverseEdge` transitions, blocked edges, and invalid node or edge references.
- Add tests that prove player-scoped and shared-state values are both available to traversal after execution updates.

## Rollout and Observability

- Internal engine rollout only; later API/mobile surfaces consume available-edge results rather than re-evaluating conditions themselves.
- Surface traversal failures explicitly so adapters can log or serialize them later without guessing root cause.
- Success is measured by story progression decisions becoming deterministic, testable, and engine-owned after replacing FEAT-0007's temporary fail-safe traversal behavior.

## Risks and Mitigations

- Risk: traversal starts owning block execution or session orchestration concerns. Mitigation: keep this feature focused on post-update evaluation and edge availability only.
- Risk: runtime interpretation diverges from the FEAT-0003 serialized contract. Mitigation: treat the existing authored edge condition schema as fixed input and only define execution semantics here.
- Deferred follow-up [DF-0002]: conditioned-edge derivation and `traverseEdge` validation against effective block state remain deferred to FEAT-0008. FEAT-0007 intentionally exposes only unconditional edges in `traversableEdges` and rejects conditioned-edge traversal with a typed runtime error. | Owner: FEAT-0008 | Trigger: FEAT-0008 implementation begins for real traversal semantics. | Exit criteria: Engine derives `traversableEdges` from effective runtime state and validates `traverseEdge` against that derived set.

## Open Questions

- None. This feature defines runtime condition and traversal semantics only.
