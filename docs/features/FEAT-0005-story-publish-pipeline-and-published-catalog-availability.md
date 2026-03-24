| Field | Value |
|---|---|
| **Type** | PRD |
| **Feature ID** | FEAT-0005 |
| **Status** | Backlog |
| **Epic** | EPIC-0002 |
| **Owner** | product-engineering |
| **Domains** | API, Data Model, Engine, Contracts |
| **Last synced** | 2026-03-23 |

# FEAT-0005 - Story Publish Pipeline and Published Catalog Availability

## Goal
Turn validated draft stories into immutable published bundles and make the current published catalog available to later player-facing and runtime surfaces.

## Background and Context
The product strategy defines publishing as the step that validates structure, optimizes bundles, and makes stories available to players inside the single Plotpoint app. The architecture already reserves `publish-story` as a route slice and states that published bundles are stamped with the engine's major version for migration compatibility.

This feature closes EPIC-0002 by making publish a real transition instead of an implied future step. Draft content stays mutable for internal authors, while published content becomes a stable artifact that later runtime and mobile features can browse and load.

## Scope

### In scope
- Define the `publish-story` request and response contract.
- Validate the current draft bundle against FEAT-0003 before publish succeeds.
- Create and persist a distinct published bundle artifact separate from mutable draft storage.
- Stamp published bundles with engine-compatible version metadata and publish timestamps.
- Define the published-catalog behavior needed for later consumers of `list-stories`, `get-story`, and `StoryRepo.getBundle`.

### Out of scope
- Session start, runtime action execution, or gameplay progression.
- Mobile rendering and player-facing UX beyond the catalog data contract.
- Public creator moderation, review queues, or marketplace workflows.
- Playtest operations and launch observability work from later epics.

## Requirements
1. `publish-story` must reject drafts that fail the FEAT-0003 schema and validation rules, with structured errors that explain why publish was blocked.
2. A successful publish must create a distinct published snapshot that stores the publish-ready bundle, engine major-version stamp, and publish metadata separately from the mutable draft record.
3. Story records must track current publish status and the current published snapshot needed for later catalog and runtime lookup.
4. Re-publishing must create a new current published snapshot from the latest valid draft rather than mutating the previous published artifact in place.
5. `list-stories` and `get-story` must support a published-catalog view that exposes only published stories and excludes draft-only fields from player-facing consumers.
6. `StoryRepo.getBundle(storyId)` must read published bundle data, not mutable draft content.
7. Publish orchestration must stay in API/db/contracts ownership; the engine consumes published bundles but does not own publish workflow state transitions.

## Architecture and Technical Notes
- Primary reference: `docs/architecture/hexagonal-feature-slice-architecture.md`
- The architecture explicitly allows `publish-story` to update story status directly through the database without importing from `update-story`.
- Publish behavior must respect the engine semver rules described in the architecture doc: engine major versions stamp published bundles, and later migrations operate on published bundle data.
- Expected implementation surfaces include `apps/api/src/routes/publish-story.ts`, `packages/contracts/src/publish-story.ts`, published-story storage in `packages/db`, and `packages/db/src/repos/story-repo.ts` returning the current published bundle.
- Distinct published snapshots are the default for this repo because publish is defined as validation plus optimization plus making a stable bundle available for runtime consumption.

## Acceptance Criteria
- [ ] Invalid drafts cannot be published and return structured publish-time validation failures.
- [ ] Successful publish creates a distinct published snapshot with version and publish metadata separate from the draft record.
- [ ] Re-publishing replaces the current published snapshot by creating a new one, not by mutating the existing artifact in place.
- [ ] Published-catalog list/get behavior is defined and tested without leaking draft-only fields.
- [ ] `StoryRepo.getBundle` returns published bundle data suitable for later runtime loading.

## Test Plan
- Add route tests for publish success, publish validation failure, and re-publish behavior.
- Add db tests covering published snapshot persistence and current-published lookup behavior.
- Add integration tests showing `StoryRepo.getBundle` resolves published content only.
- Manually verify the flow `create draft -> update draft -> publish -> list published story -> fetch published story`.

## Rollout and Observability
- Internal rollout only; this is the content-release path for curated MVP stories.
- Surface publish failures and validation reasons clearly enough for internal release tooling.
- Track publish success/failure events and publish timestamps so later operational work can inspect release cadence and blocked publishes.

## Risks and Mitigations
- Risk: runtime reads mutable draft content instead of stable published snapshots. Mitigation: make `StoryRepo.getBundle` resolve published artifacts only.
- Risk: published catalog responses leak draft-only fields. Mitigation: define explicit published response shapes and test them.
- Risk: publish compatibility drifts from engine versioning rules. Mitigation: stamp published bundles at publish time and treat version metadata as part of the persisted artifact.

## Open Questions
- None. This feature resolves the epic-level publish-artifact decision by persisting a distinct published snapshot.
