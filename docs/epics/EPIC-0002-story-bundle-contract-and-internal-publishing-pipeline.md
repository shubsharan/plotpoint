| Field | Value |
|---|---|
| **Type** | Epic |
| **Epic ID** | EPIC-0002 |
| **Status** | In Progress |
| **Owner** | product-engineering |
| **Target milestone** | MVP-P1 |
| **Last synced** | 2026-03-23 |

# EPIC-0002 - Story Bundle Contract and Internal Publishing Pipeline

## Goal
Define the canonical story bundle contract and the internal publishing flow that lets Plotpoint ship curated story releases without custom code per release.

## Context
The product strategy makes Phase 1 explicitly internal and JSON-driven: Plotpoint works directly with game designers using JSON-based tooling before investing in a visual builder or broader creator ecosystem. The roadmap makes that concrete for MVP by requiring internal creators to publish and update curated story bundles repeatably, while keeping the engine headless, pure, and testable.

The architecture already establishes the main delivery boundaries for this epic. Story CRUD and publishing surfaces belong in the API and contracts packages, persistence lives in the db package, and the engine consumes published story bundles through the `StoryRepo.getBundle` port. Published bundles also need version stamping that stays compatible with the engine's semver and migration model.

## Scope

### In scope
- Define the canonical authored story bundle shape for scenes, graph edges, blocks, conditions, metadata, and version information.
- Define validation rules that reject structurally invalid bundles before publish.
- Define the internal draft-to-published workflow for curated stories, including story CRUD and publish surfaces.
- Define how published bundles are stored and retrieved so later runtime work can load them through `StoryRepo.getBundle`.
- Define the minimum published catalog surface needed for players to browse and start curated stories in later epics.

### Out of scope
- Public creator marketplace, moderation workflows, or third-party self-serve publishing.
- Visual story builder or AI-assisted authoring flows.
- Full runtime execution semantics, condition evaluation behavior, or block implementations beyond the contract this epic must encode.
- Session lifecycle, multiplayer sync, resume flows, or player save behavior from later epics.
- Advertising marketplace resolution or business bidding logic.

## Success Criteria
- A single story bundle contract is defined clearly enough to serve as the shared source of truth for authoring, API validation, persistence, and engine loading.
- Internal creators can publish and update curated bundles without custom code per release.
- Published bundles are version-stamped in a way that matches the engine's major-version compatibility and migration model.
- The story CRUD and publish surfaces are clear enough to support downstream feature PRDs and implementation without reopening core contract questions.
- One curated story can move through the intended internal publish flow and become available to later MVP browse and play surfaces.

## Dependencies
- `docs/product/product-roadmap.md`
- `docs/product/product-strategy.md`
- `docs/architecture/hexagonal-feature-slice-architecture.md`
- `docs/features/FEAT-0001-monorepo-and-shared-config-finalization.md`

## Risks and Mitigations
- Risk: the bundle contract over-optimizes for a future open creator ecosystem instead of the current internal workflow. Mitigation: scope this epic to internal JSON authoring and curated releases only.
- Risk: publishing concerns leak into engine or mobile ownership boundaries. Mitigation: keep publishing orchestration in API/db/contracts and preserve the architecture dependency flow `mobile -> contracts <- api -> engine <- db`.
- Risk: published bundle compatibility drifts from engine versioning. Mitigation: treat engine major version stamping and migration compatibility as part of the publish contract, not an afterthought.
- Risk: docs claim implementation details that are not yet present in the scaffold repo. Mitigation: describe this epic as the target contract and pipeline to implement next, grounded only in routes and boundaries already established by the architecture doc.

## Feature Breakdown
- [FEAT-0003-story-bundle-schema-and-validation-contract](../features/FEAT-0003-story-bundle-schema-and-validation-contract.md)
- [FEAT-0004-story-draft-storage-and-internal-story-crud-api](../features/FEAT-0004-story-draft-storage-and-internal-story-crud-api.md)
- [FEAT-0005-story-publish-pipeline-and-published-catalog-availability](../features/FEAT-0005-story-publish-pipeline-and-published-catalog-availability.md)

## Milestones and Sequencing
1. Define the bundle schema, metadata, versioning rules, and validation boundaries.
2. Define draft storage and internal story CRUD surfaces around that contract.
3. Define the publish transition from draft story content to a version-stamped published bundle and catalog entry.
4. Hand off the published bundle contract to later runtime, session, and mobile epics for actual gameplay execution.

## Open Questions
- None. `FEAT-0005` persists a distinct published bundle artifact so draft content stays mutable while runtime consumers load stable published snapshots.
