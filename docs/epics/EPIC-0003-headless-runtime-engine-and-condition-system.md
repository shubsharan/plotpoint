| Field                | Value               |
| -------------------- | ------------------- |
| **Type**             | Epic                |
| **Epic ID**          | EPIC-0003           |
| **Status**           | Planned             |
| **Last synced**      | 2026-03-30          |

# EPIC-0003 - Headless Runtime Engine and Condition System

## Goal

Turn published `StoryBundle` artifacts into executable gameplay semantics inside `packages/engine`, including deterministic runtime state updates, block execution, condition evaluation, and graph traversal that later API and mobile work can build on.

## Context

The roadmap already sequences runtime execution immediately after the story bundle and publishing pipeline work: once internal creators can publish stable bundle snapshots, Plotpoint needs a headless engine that can load those bundles and run story logic consistently. The product strategy defines stories as directed graphs of scenes connected by conditional paths, with local-first play and a split between player-scoped state and shared game-scoped state.

The architecture makes the boundary explicit. The engine owns runtime contracts and execution semantics, remains pure TypeScript with no UI or infrastructure dependencies, and sits behind the dependency flow `mobile -> api -> engine <- db`. Published bundle loading must enter through `StoryRepo.getBundle`, while transport, persistence, and mobile rendering concerns stay outside this epic.

## Scope

### In scope

- Define the engine runtime state model needed to execute a published story bundle deterministically.
- Define the engine public surface for loading bundles, starting runtime state, submitting actions, and reading resulting progression data.
- Define the block registry and execution contract for the MVP block set, including per-block scope and config interpretation inside the engine.
- Define the condition registry and evaluation behavior used to determine which graph edges are currently traversable.
- Define graph traversal and progression semantics for scene entry, action handling, state updates, and next-step resolution.
- Keep runtime execution headless and testable so later API routes and mobile gameplay surfaces can consume the engine without reimplementing story logic.

### Out of scope

- Session lifecycle, persistence, resume behavior, multiplayer sync, or server-authoritative shared-state orchestration from `EPIC-0004`.
- Mobile shell, block renderer UI, or player-facing gameplay UX from `EPIC-0005`.
- Draft authoring, publish workflow state transitions, or catalog release behavior from `EPIC-0002`.
- Broad offline-sync policy, network retry orchestration, or realtime coordination details that belong to later session and infrastructure work.

## Success Criteria

- Published bundles can be loaded through the engine boundary and interpreted without API- or db-owned gameplay logic leaking inward.
- Runtime state semantics are defined clearly enough for later save-state, session, and mobile features to integrate without reopening core execution questions.
- Block execution behavior is deterministic, pure, and testable for the MVP block set.
- Condition evaluation and graph traversal semantics are explicit enough to support branching story progression and role-based paths.
- The engine public API is narrow and stable enough that later route handlers and mobile clients can depend on it as the single source of truth for gameplay execution.

## Dependencies

- `docs/product/product-roadmap.md`
- `docs/product/product-strategy.md`
- `docs/architecture/hexagonal-feature-slice-architecture.md`
- `docs/epics/EPIC-0002-story-bundle-contract-and-internal-publishing-pipeline.md`

## Risks and Mitigations

- Risk: runtime semantics blur with session persistence or multiplayer coordination concerns. Mitigation: keep this epic focused on headless execution contracts and defer save/sync orchestration to `EPIC-0004`.
- Risk: API or mobile layers reintroduce gameplay logic outside the engine. Mitigation: define the engine public surface and runtime semantics as the only execution authority for story progression.
- Risk: bundle contract assumptions from `EPIC-0002` get reopened during runtime implementation. Mitigation: treat published `StoryBundle` artifacts as the fixed input boundary and evolve runtime behavior around that contract.
- Risk: runtime APIs overfit to current transport or storage decisions. Mitigation: keep ports and runtime inputs infrastructure-neutral and preserve the dependency flow `mobile -> api -> engine <- db`.

## Feature Breakdown

- [FEAT-0006-runtime-state-model-and-engine-public-surface](../features/FEAT-0006-runtime-state-model-and-engine-public-surface.md)
- [FEAT-0007-block-registry-and-action-executor](../features/FEAT-0007-block-registry-and-action-executor.md)
- [FEAT-0008-condition-registry-and-graph-traversal-semantics](../features/FEAT-0008-condition-registry-and-graph-traversal-semantics.md)

## Milestones and Sequencing

1. Define the runtime state model and narrow engine entrypoints that consume published bundles.
2. Implement the block registry and pure action execution semantics for the MVP block set.
3. Implement condition evaluation and graph traversal so scene progression can be resolved deterministically.
4. Hand off the execution surface to later session, persistence, and mobile epics for save orchestration and gameplay UX.

## Open Questions

- None. This epic intentionally stops at runtime semantics and leaves save orchestration, sync authority, and player-facing rendering to later epics.
