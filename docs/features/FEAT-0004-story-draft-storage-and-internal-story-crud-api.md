
| Field           | Value               |
| --------------- | ------------------- |
| **Type**        | PRD                 |
| **Feature ID**  | FEAT-0004           |
| **Status**      | In Progress         |
| **Epic**        | EPIC-0002           |
| **Owner**       | product-engineering |
| **Domains**     | API, Data Model     |
| **Last synced** | 2026-03-24          |


# FEAT-0004 - Story Draft Storage and Internal Story CRUD API

## Goal

Provide the internal storage model and CRUD API surfaces needed to create, update, inspect, list, and delete draft stories before they are published.

## Background and Context

Once FEAT-0003 defines the engine-owned bundle contract, Plotpoint needs a thin vertical slice that stores draft story content and makes it manageable through the API. The architecture already reserves story route slices for `list-stories`, `get-story`, `create-story`, `update-story`, and `delete-story`, with the `db` package owning story persistence and API routes owning request and response DTO schemas.

This feature stays on the draft side of the workflow. It gives internal creators and operators a stable content-management surface without taking on publish, runtime, or player-facing catalog behavior yet.

## Scope

### In scope

- Define the draft story persistence model and supporting metadata needed for internal content management.
- Define request and response contracts for `list-stories`, `get-story`, `create-story`, `update-story`, and `delete-story`.
- Implement the API route slices and db operations for draft story CRUD.
- Define how draft story records reference the canonical bundle contract from FEAT-0003.

### Out of scope

- Publish route behavior and published bundle artifact creation.
- Player-facing catalog behavior for published stories.
- Runtime loading, traversal, or engine execution.
- Session lifecycle, save state, and multiplayer behavior.

## Requirements

1. A story record must persist a draft bundle object-storage pointer (`draft_bundle_uri`) plus the minimum metadata needed for internal management, including stable story id, title/labeling metadata, status, and created/updated timestamps.
2. `create-story` must accept draft metadata plus a valid draft bundle object-storage pointer and return the persisted draft record in a route-local API contract defined beside the handler.
3. `update-story` must update draft metadata and draft bundle pointer without publishing or mutating any published artifact behavior reserved for FEAT-0005.
4. `list-stories` and `get-story` must return internal draft-management views that include status and metadata needed to inspect current draft state.
5. `delete-story` must remove draft-only story records explicitly and predictably; publish-history semantics are deferred to FEAT-0005.
6. API routes must remain independent feature slices that call db operations directly rather than importing logic from each other.
7. Validation errors and not-found cases must surface through explicit contract responses instead of silent fallbacks.

## Architecture and Technical Notes

- Primary reference: `docs/architecture/hexagonal-feature-slice-architecture.md`
- Expected ownership sits in `packages/db/src/schema/stories.ts`, `packages/db/src/stories.ts`, and `apps/api/src/routes/{list-stories,get-story,create-story,update-story,delete-story}.ts` with route-local schemas in those route modules.
- This feature must store object-storage pointers in DB rows; API and publish layers own bundle upload/download and FEAT-0003 validation against the retrieved payload.
- Keep the dependency flow intact: `api` and `db` may depend inward, but the engine should not gain CRUD concerns.
- Storage decision: [ADR-story-bundle-object-storage-links](../adrs/ADR-story-bundle-object-storage-links.md).

## Acceptance Criteria

- Draft story records can be created, updated, listed, fetched individually, and deleted through typed API contracts.
- Draft storage persists object-storage pointers for bundle payloads while preserving FEAT-0003 bundle validation ownership in API/engine layers.
- Story route handlers and db operations align to the feature-slice layout already named by the architecture doc.
- Delete behavior is explicit for draft-only records and does not pre-commit published-story lifecycle decisions.
- Validation failures and not-found responses are covered by request or route tests.

## Test Plan

- Add unit tests for story db operations covering create, update, list, get, and delete behavior.
- Add route tests for each CRUD endpoint using the route-local API schemas.
- Add validation tests proving invalid draft bundle pointers or invalid route payloads are rejected cleanly.
- Manually verify a draft story can be created, edited, fetched, listed, and removed without invoking publish behavior.

## Rollout and Observability

- Internal-only rollout for content-management flows.
- Log or surface CRUD validation failures clearly enough for internal tooling and debugging.
- Success is measured by draft stories becoming manageable through one stable API and persistence surface.

## Risks and Mitigations

- Risk: draft pointer rows drift from actual bundle objects. Mitigation: enforce pointer existence/validation in API publish workflows and add pointer health checks.
- Risk: CRUD route behavior leaks publish semantics early. Mitigation: keep publish transitions out of this feature and reserve them for FEAT-0005.
- Risk: delete behavior becomes ambiguous once published content exists. Mitigation: keep this feature scoped to draft-only deletion and define published lifecycle rules in the publish feature.

## Open Questions

- None. This feature only covers draft persistence and internal CRUD behavior.

