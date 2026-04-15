| Field                | Value               |
| -------------------- | ------------------- |
| **Type**             | Epic                |
| **Epic ID**          | EPIC-0003           |
| **Status**           | Completed           |
| **Last synced**      | 2026-04-15          |

# EPIC-0003 - Headless Runtime Engine and Condition System

## Goal

Turn published `StoryPackage` artifacts into executable gameplay semantics inside `packages/engine`, including deterministic runtime state updates, block execution, condition evaluation, and graph traversal that later API and mobile work can build on.

## Context

The roadmap already sequences runtime execution immediately after the story package and publishing pipeline work: once internal creators can publish stable PublishedStoryPackageVersion records, Plotpoint needs a headless engine that can load those story packages and run story logic consistently. The product strategy defines stories as directed graphs of scenes connected by conditional paths, with local-first play and a split between player-scoped state and shared game-scoped state.

The architecture makes the boundary explicit. The engine owns runtime contracts and execution semantics, remains pure TypeScript with no UI or infrastructure dependencies, and must be host-agnostic so both mobile-local and API-hosted adapters can depend on the same gameplay authority. Published story package loading must enter through `StoryPackageRepo.getPublishedPackage`, while durable persistence, sync orchestration, and mobile rendering concerns stay outside this epic.

## Scope

### In scope

- Define the engine runtime state model needed to execute a published story package deterministically.
- Define the engine public surface for loading story packages, starting runtime state, submitting actions, and reading resulting progression data.
- Define the block registry and execution contract for the MVP block set, including per-block scope and config interpretation inside the engine.
- Define the fact-based traversal evaluation behavior used to determine which graph edges are currently traversable.
- Define graph traversal and progression semantics for scene entry, action handling, state updates, and next-step resolution.
- Keep runtime execution headless and testable so later API routes and mobile gameplay surfaces can consume the engine without reimplementing story logic.

### Out of scope

- Session lifecycle, persistence, resume behavior, multiplayer sync, or server-authoritative shared-state orchestration from `EPIC-0004`.
- Mobile shell, block renderer UI, or player-facing gameplay UX from `EPIC-0005`.
- Draft authoring, publish workflow state transitions, or catalog release behavior from `EPIC-0002`.
- Broad offline-sync policy, network retry orchestration, or realtime coordination details that belong to later session and infrastructure work.

## Success Criteria

- Published story packages can be loaded through the engine boundary and interpreted without API- or db-owned gameplay logic leaking inward.
- Runtime state semantics are defined clearly enough for later save-state, session, and mobile features to integrate without reopening core execution questions.
- Block execution behavior is deterministic, pure, and testable for the MVP block set.
- Condition evaluation and graph traversal semantics are explicit enough to support branching story progression and role-based paths.
- The engine public API is narrow and stable enough that later route handlers and mobile clients can depend on it as the single source of truth for gameplay execution.

## Dependencies

### Product and Architecture Docs

- [product-roadmap](../product/product-roadmap.md)
- [product-strategy](../product/product-strategy.md)
- [hexagonal-feature-slice-architecture](../architecture/hexagonal-feature-slice-architecture.md)

### Related Epics and Cross-PRD Dependencies

- [EPIC-0002-story-package-contract-and-internal-publishing-pipeline](../epics/EPIC-0002-story-package-contract-and-internal-publishing-pipeline.md)
- [FEAT-0005-story-publish-pipeline-and-published-catalog-availability](../features/FEAT-0005-story-publish-pipeline-and-published-catalog-availability.md)

### Related ADRs

- [ADR-0002-headless-engine-runtime-boundary](../adrs/ADR-0002-headless-engine-runtime-boundary.md)
- [ADR-0003-traversal-facts-replace-named-condition-registry](../adrs/ADR-0003-traversal-facts-replace-named-condition-registry.md)

## Risks and Mitigations

- Risk: runtime semantics blur with session persistence or multiplayer coordination concerns. Mitigation: keep this epic focused on headless execution contracts and defer save/sync orchestration to `EPIC-0004`.
- Risk: API or mobile layers reintroduce gameplay logic outside the engine. Mitigation: define the engine public surface and runtime semantics as the only execution authority for story progression.
- Risk: story package contract assumptions from `EPIC-0002` get reopened during runtime implementation. Mitigation: treat published `StoryPackage` artifacts as the fixed input boundary and evolve runtime behavior around that contract.
- Risk: runtime APIs overfit to one host or storage strategy. Mitigation: keep ports and runtime inputs infrastructure-neutral so the same engine surface can run in mobile or API hosts while durable persistence remains deferred to `EPIC-0004`.

## Feature Breakdown

- [FEAT-0006-runtime-state-model-and-engine-public-surface](../features/FEAT-0006-runtime-state-model-and-engine-public-surface.md)
- [FEAT-0007-block-registry-and-action-executor](../features/FEAT-0007-block-registry-and-action-executor.md)
- [FEAT-0008-condition-registry-and-graph-traversal-semantics](../features/FEAT-0008-condition-registry-and-graph-traversal-semantics.md)

## Milestones and Sequencing

1. Define the runtime state model and narrow engine entrypoints that consume published story packages.
2. Implement the block registry and pure action execution semantics for the MVP block set.
3. Implement condition evaluation and graph traversal so scene progression can be resolved deterministically.
4. Hand off the execution surface to later session, persistence, and mobile epics for save orchestration and gameplay UX.

## Open Questions

- Deferred follow-up [DF-0001]: finalize session-layer orchestration for explicit mid-game upgrades of pinned published package versions. Default policy is pin on game start, allow explicit upgrade actions, and reject upgrades that fail runtime compatibility checks so sessions remain on their prior pinned version. | Owner: EPIC-0003 | Trigger: Session orchestration implementation begins for persisted runtime resume and upgrade controls. | Exit criteria: Runtime/session docs and implementation ship an explicit upgrade action with reject-on-incompatibility behavior and pinned-version preservation.
