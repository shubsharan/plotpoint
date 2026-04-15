| Field           | Value               |
| --------------- | ------------------- |
| **Type**        | PRD                 |
| **Feature ID**  | FEAT-0004           |
| **Status**      | Completed           |
| **Epic**        | EPIC-0002           |
| **Domains**     | API, Data Model     |
| **Last synced** | 2026-03-25          |

# FEAT-0004 - Story Draft Storage and Internal Story CRUD API

## Goal

Provide the internal storage model and CRUD API surfaces needed to create, update, inspect, list, and delete draft stories before they are published.

## Background and Context

Once FEAT-0003 defines the engine-owned story package contract, Plotpoint needs a thin vertical slice that stores draft story content and makes it manageable through the API. The architecture already reserves story route slices for `list-stories`, `get-story`, `create-story`, `replace-story`, `patch-story`, and `delete-story`, with the `db` package owning story persistence plus intentional CRUD read/write shapes, while API routes stay focused on HTTP request validation and error contracts.

This feature stays on the draft side of the workflow. It gives internal creators and operators a stable content-management surface without taking on publish, runtime, or player-facing catalog behavior yet.

## Related Docs

### Parent Epic

- [EPIC-0002-story-package-contract-and-internal-publishing-pipeline](../epics/EPIC-0002-story-package-contract-and-internal-publishing-pipeline.md)

### Related Feature PRDs

- [FEAT-0003-story-package-schema-and-validation-contract](../features/FEAT-0003-story-package-schema-and-validation-contract.md)
- [FEAT-0005-story-publish-pipeline-and-published-catalog-availability](../features/FEAT-0005-story-publish-pipeline-and-published-catalog-availability.md)

### Related ADRs

- [ADR-0001-story-package-object-storage-links](../adrs/ADR-0001-story-package-object-storage-links.md)

### Related Architecture Docs

- [hexagonal-feature-slice-architecture](../architecture/hexagonal-feature-slice-architecture.md)

## Scope

### In scope

- Define the draft story persistence model and supporting metadata needed for internal content management.
- Define request contracts and error response contracts for `list-stories`, `get-story`, `create-story`, `replace-story` (`PUT`), `patch-story` (`PATCH`), and `delete-story`.
- Implement the API route slices and db operations for draft story CRUD.
- Define how draft story records reference the canonical story package contract from FEAT-0003.

### Out of scope

- Publish route behavior and published story package artifact creation.
- Player-facing catalog behavior for published stories.
- Runtime loading, traversal, or engine execution.
- Session lifecycle, save state, and multiplayer behavior.

## Requirements

1. A story record must persist a draft story package object-storage pointer (`draft_package_uri`) plus the minimum metadata needed for internal management, including stable story id, title/labeling metadata, status, and created/updated timestamps.
2. `create-story` must accept draft metadata plus a valid draft story package object-storage pointer and return the persisted draft record from the db CRUD read model via normal JSON serialization.
3. `replace-story` (`PUT /stories/:id`) must update draft metadata and draft story package pointer using full-update semantics without publishing or mutating any published artifact behavior reserved for FEAT-0005.
4. `patch-story` (`PATCH /stories/:id`) must support partial updates where omitted fields remain unchanged and `summary: null` explicitly clears summary.
5. `list-stories` and `get-story` must return internal draft-management views that include status and metadata needed to inspect current draft state.
6. `delete-story` must remove draft-only story records explicitly and predictably; publish-history semantics are deferred to FEAT-0005.
7. API routes must remain independent feature slices that call db operations directly rather than importing logic from each other.
8. Validation errors and not-found cases must surface through explicit contract responses instead of silent fallbacks.

## Architecture and Technical Notes

- Primary reference: `docs/architecture/hexagonal-feature-slice-architecture.md`
- Expected ownership sits in `packages/db/src/schema/stories.ts`, `packages/db/src/queries/stories.ts`, and `apps/api/src/routes/stories/route.ts` plus `contracts.ts`. Route contracts stay HTTP-focused (requests and error responses), while success payload shape comes from db CRUD read models serialized by the API.
- This feature must store object-storage pointers in DB rows; API and publish layers own story package upload/download and FEAT-0003 validation against the retrieved payload.
- Keep the dependency flow intact: `api` and `db` may depend inward, but the engine should not gain CRUD concerns.
- Storage decision: [ADR-0001-story-package-object-storage-links](../adrs/ADR-0001-story-package-object-storage-links.md).

## Acceptance Criteria

- Draft story records can be created, updated, listed, fetched individually, and deleted through typed db CRUD contracts with thin API adapters.
- `PUT /stories/:id` and `PATCH /stories/:id` semantics are explicit and tested: `PUT` performs full replacement of writable draft fields, while `PATCH` performs partial updates with omitted fields unchanged and `summary: null` clearing summary.
- Draft storage persists object-storage pointers for story package payloads while preserving FEAT-0003 story package validation ownership in API/engine layers.
- Story route handlers and db operations align to the feature-slice layout already named by the architecture doc.
- Delete behavior is explicit for draft-only records and does not pre-commit published-story lifecycle decisions.
- Validation failures and not-found responses are covered by request or route tests.

## Test Plan

- Add unit tests for story db operations covering create, put-update, patch-update, list, get, and delete behavior.
- Add route tests for each CRUD endpoint (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) using route-local request/error contracts and JSON-serialized db CRUD read model responses.
- Add validation tests proving invalid draft story package pointers or invalid route payloads are rejected cleanly.
- Manually verify a draft story can be created, edited, fetched, listed, and removed without invoking publish behavior.

## Rollout and Observability

- Internal-only rollout for content-management flows.
- Log or surface CRUD validation failures clearly enough for internal tooling and debugging.
- Success is measured by draft stories becoming manageable through one stable API and persistence surface.

## Risks and Mitigations

- Risk: draft pointer rows drift from actual story package objects. Mitigation: enforce pointer existence/validation in API publish workflows and add pointer health checks.
- Risk: CRUD route behavior leaks publish semantics early. Mitigation: keep publish transitions out of this feature and reserve them for FEAT-0005.
- Risk: delete behavior becomes ambiguous once published content exists. Mitigation: keep this feature scoped to draft-only deletion and define published lifecycle rules in the publish feature.

## Open Questions

- None. This feature only covers draft persistence and internal CRUD behavior.
