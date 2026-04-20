# Documentation Index

`docs/index.md` is the authoritative current-state document for this repository.
Use it as the one-page status rollup across epics and features.

## Current State

### Epic Status Rollup


| Epic      | Status      | Doc                                                                                                                                                      |
| --------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EPIC-0001 | Completed   | [epics/EPIC-0001-platform-and-planning-foundation.md](epics/EPIC-0001-platform-and-planning-foundation.md)                                               |
| EPIC-0002 | Completed   | [epics/EPIC-0002-story-package-contract-and-internal-publishing-pipeline.md](epics/EPIC-0002-story-package-contract-and-internal-publishing-pipeline.md) |
| EPIC-0003 | Completed   | [epics/EPIC-0003-headless-runtime-engine-and-condition-system.md](epics/EPIC-0003-headless-runtime-engine-and-condition-system.md)                       |
| EPIC-0004 | Planned     | [epics/EPIC-0004-session-lifecycle-persistence-and-multiplayer-state.md](epics/EPIC-0004-session-lifecycle-persistence-and-multiplayer-state.md)         |


### Feature Status Rollup


| Feature   | Epic      | Status    | Doc                                                                                                                                                                |
| --------- | --------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FEAT-0001 | EPIC-0001 | Completed | [features/FEAT-0001-monorepo-and-shared-config-finalization.md](features/FEAT-0001-monorepo-and-shared-config-finalization.md)                                     |
| FEAT-0002 | EPIC-0001 | Cancelled | [features/FEAT-0002-spec-driven-delivery-automation.md](features/FEAT-0002-spec-driven-delivery-automation.md)                                                     |
| FEAT-0003 | EPIC-0002 | Completed | [features/FEAT-0003-story-package-schema-and-validation-contract.md](features/FEAT-0003-story-package-schema-and-validation-contract.md)                             |
| FEAT-0004 | EPIC-0002 | Completed | [features/FEAT-0004-story-draft-storage-and-internal-story-crud-api.md](features/FEAT-0004-story-draft-storage-and-internal-story-crud-api.md)                     |
| FEAT-0005 | EPIC-0002 | Completed | [features/FEAT-0005-story-publish-pipeline-and-published-catalog-availability.md](features/FEAT-0005-story-publish-pipeline-and-published-catalog-availability.md) |
| FEAT-0006 | EPIC-0003 | Completed | [features/FEAT-0006-runtime-state-model-and-engine-public-surface.md](features/FEAT-0006-runtime-state-model-and-engine-public-surface.md)                       |
| FEAT-0007 | EPIC-0003 | Completed | [features/FEAT-0007-block-registry-and-action-executor.md](features/FEAT-0007-block-registry-and-action-executor.md)                                             |
| FEAT-0008 | EPIC-0003 | Completed | [features/FEAT-0008-condition-registry-and-graph-traversal-semantics.md](features/FEAT-0008-condition-registry-and-graph-traversal-semantics.md)                 |
| FEAT-0009 | EPIC-0004 | Not Started | [features/FEAT-0009-session-records-membership-and-pinned-resume-contract.md](features/FEAT-0009-session-records-membership-and-pinned-resume-contract.md)       |
| FEAT-0010 | EPIC-0004 | Not Started | [features/FEAT-0010-session-lifecycle-rejoin-and-completion-contract.md](features/FEAT-0010-session-lifecycle-rejoin-and-completion-contract.md)                 |
| FEAT-0011 | EPIC-0004 | Not Started | [features/FEAT-0011-checkpoint-shared-state-sync-and-notification-contract.md](features/FEAT-0011-checkpoint-shared-state-sync-and-notification-contract.md)     |
| FEAT-0012 | EPIC-0004 | Not Started | [features/FEAT-0012-session-package-upgrade-and-compatibility-contract.md](features/FEAT-0012-session-package-upgrade-and-compatibility-contract.md)             |


### Current Implementation Snapshot

- Foundation baseline is implemented: monorepo structure, shared config ownership, and package boundaries are in place.
- Story package contract and schema validation are implemented and enforced for internal story package authoring.
- Draft story storage and internal CRUD API flows are implemented for draft lifecycle work.
- Story publish pipeline and published catalog availability are implemented under FEAT-0005.
- Runtime implementation under EPIC-0003 now includes FEAT-0006 runtime contracts, FEAT-0007 block action execution, and FEAT-0008 fact-view traversal inside `packages/engine`. Persisted runtime state remains intentionally sparse (`playerState`/`sharedState` store only mutated block state), `RuntimeFrame.view.currentNode` exposes hydrated current-node block state for hosts, `RuntimeFrame.view.traversableEdges` is derived from block-exported traversal facts, and the engine contract now uses `sessionId` for runtime identity.
- EPIC-0004 planning now spans four feature slices: `FEAT-0009` locks the adapter-owned session aggregate and pinned resume contract, `FEAT-0010` owns lifecycle/rejoin/completion semantics, `FEAT-0011` owns explicit checkpoint sync plus notification requirements, and `FEAT-0012` owns explicit package upgrades with fail-closed compatibility rules.

## Update Rules

- Work-state changes update status on the affected epic or feature doc and sync this rollup.
- Scope, contracts, acceptance criteria, or test-plan changes update the affected epic or feature doc.
- Strategy and sequencing changes update `docs/product/`.
- Structural conventions and technical boundaries update `docs/architecture/`.
- Non-obvious trade-offs update `docs/adrs/`.

## Docs Inventory

### `product/`

- [product/product-roadmap.md](product/product-roadmap.md)
- [product/product-strategy.md](product/product-strategy.md)

### `runbooks/`

- [runbooks/deferred-followups.md](runbooks/deferred-followups.md)
- [runbooks/doc-authoring-quickstart.md](runbooks/doc-authoring-quickstart.md)
- [runbooks/spec-driven-delivery-workflow.md](runbooks/spec-driven-delivery-workflow.md)
- [runbooks/_template.md](runbooks/_template.md)

### `epics/`

- [epics/EPIC-0001-platform-and-planning-foundation.md](epics/EPIC-0001-platform-and-planning-foundation.md)
- [epics/EPIC-0002-story-package-contract-and-internal-publishing-pipeline.md](epics/EPIC-0002-story-package-contract-and-internal-publishing-pipeline.md)
- [epics/EPIC-0003-headless-runtime-engine-and-condition-system.md](epics/EPIC-0003-headless-runtime-engine-and-condition-system.md)
- [epics/EPIC-0004-session-lifecycle-persistence-and-multiplayer-state.md](epics/EPIC-0004-session-lifecycle-persistence-and-multiplayer-state.md)
- [epics/_template.md](epics/_template.md)

### `features/`

- [features/FEAT-0001-monorepo-and-shared-config-finalization.md](features/FEAT-0001-monorepo-and-shared-config-finalization.md)
- [features/FEAT-0002-spec-driven-delivery-automation.md](features/FEAT-0002-spec-driven-delivery-automation.md)
- [features/FEAT-0003-story-package-schema-and-validation-contract.md](features/FEAT-0003-story-package-schema-and-validation-contract.md)
- [features/FEAT-0004-story-draft-storage-and-internal-story-crud-api.md](features/FEAT-0004-story-draft-storage-and-internal-story-crud-api.md)
- [features/FEAT-0005-story-publish-pipeline-and-published-catalog-availability.md](features/FEAT-0005-story-publish-pipeline-and-published-catalog-availability.md)
- [features/FEAT-0006-runtime-state-model-and-engine-public-surface.md](features/FEAT-0006-runtime-state-model-and-engine-public-surface.md)
- [features/FEAT-0007-block-registry-and-action-executor.md](features/FEAT-0007-block-registry-and-action-executor.md)
- [features/FEAT-0008-condition-registry-and-graph-traversal-semantics.md](features/FEAT-0008-condition-registry-and-graph-traversal-semantics.md)
- [features/FEAT-0009-session-records-membership-and-pinned-resume-contract.md](features/FEAT-0009-session-records-membership-and-pinned-resume-contract.md)
- [features/FEAT-0010-session-lifecycle-rejoin-and-completion-contract.md](features/FEAT-0010-session-lifecycle-rejoin-and-completion-contract.md)
- [features/FEAT-0011-checkpoint-shared-state-sync-and-notification-contract.md](features/FEAT-0011-checkpoint-shared-state-sync-and-notification-contract.md)
- [features/FEAT-0012-session-package-upgrade-and-compatibility-contract.md](features/FEAT-0012-session-package-upgrade-and-compatibility-contract.md)
- [features/_template.md](features/_template.md)

### `architecture/`

- [architecture/hexagonal-feature-slice-architecture.md](architecture/hexagonal-feature-slice-architecture.md)

### `adrs/`

- [adrs/ADR-0001-story-package-object-storage-links.md](adrs/ADR-0001-story-package-object-storage-links.md)
- [adrs/ADR-0002-headless-engine-runtime-boundary.md](adrs/ADR-0002-headless-engine-runtime-boundary.md)
- [adrs/ADR-0003-traversal-facts-replace-named-condition-registry.md](adrs/ADR-0003-traversal-facts-replace-named-condition-registry.md)
- [adrs/_template.md](adrs/_template.md)
