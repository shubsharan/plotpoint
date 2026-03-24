
| Field           | Value                         |
| --------------- | ----------------------------- |
| **Type**        | PRD                           |
| **Feature ID**  | FEAT-0003                     |
| **Status**      | In Progress                   |
| **Epic**        | EPIC-0002                     |
| **Owner**       | product-engineering           |
| **Domains**     | Engine, Contracts, Data Model |
| **Last synced** | 2026-03-23                    |


# FEAT-0003 - Story Bundle Schema and Validation Contract

## Goal

Define the canonical story bundle contract and the pure validation layers that make authored story content safe to publish and safe for the engine to load.

## Background and Context

EPIC-0002 starts with the bundle contract because everything downstream depends on it. Plotpoint's Phase 1 creator workflow is internal and JSON-based, and the MVP roadmap requires curated stories to publish without custom code per release.

The product strategy defines stories as directed graphs of scenes, blocks, and conditional edges. The architecture already places runtime ownership in `packages/engine` and shared wire contracts in `packages/contracts`. This feature turns that target shape into one canonical serialized contract that authoring, publishing, persistence, and later runtime loading all share without duplicating runtime authority inside authored JSON.

## Scope

### In scope

- Define the canonical serializable story bundle shape for story metadata, supported roles, graph nodes, edges, block instances, condition trees, and version fields.
- Define pure validation layers for schema parsing, structural graph integrity, and engine compatibility checks.
- Define the engine-version compatibility fields that are stamped onto published bundles.
- Define example valid and invalid bundle fixtures that later features can reuse for publish and runtime tests.

### Out of scope

- Story draft persistence and CRUD routes.
- Publish workflow orchestration and catalog availability.
- Runtime traversal behavior or block reducer implementations beyond the contract they consume.
- Session lifecycle, player assignment, save state, or multiplayer synchronization.

## Requirements

1. The bundle contract must describe a full story as serializable JSON, including story metadata, supported roles, graph structure, block instances, condition trees, and version metadata.
2. The contract must support the architecture's block model by requiring each block instance to declare a block type name and config payload. Block scope remains registry-owned engine metadata and is not duplicated in authored bundle JSON.
3. The contract must support the architecture's condition model by representing conditions as structured trees of `check`, `and`, `or`, and `always` nodes with named condition references and params.
4. Validation must be split into three explicit pure layers: schema parsing, structural graph validation, and compatibility validation.
5. Schema parsing must reject malformed bundle JSON shapes before semantic validation runs.
6. Structural graph validation must reject invalid authored content, including duplicate ids, missing node or edge targets, and invalid entrypoints.
7. Compatibility validation must reject bundles that reference unknown block types, unknown condition names, or incompatible engine major-version metadata.
8. The bundle schema must be authored once and reused across implementation surfaces without duplicated hand-written type definitions.
9. Validation logic that the engine relies on must remain pure and framework-free, with no API, db, or mobile dependencies.
10. Validation failures must be structured and deterministic so later authoring and publish tooling can surface issues directly.

## Architecture and Technical Notes

- Primary reference: `docs/architecture/hexagonal-feature-slice-architecture.md`
- `packages/contracts` owns the serialized bundle schema and inferred TypeScript types for transport and persistence surfaces.
- `packages/engine` owns semantic interpretation of the bundle, including block registry metadata, condition registry metadata, structural validation, compatibility validation, and later runtime loading behavior.
- The bundle contract must align with the engine port `StoryRepo.getBundle(storyId)` so later runtime work can load published bundles directly.
- Use Zod-backed schemas as the source of truth for serialized bundle shapes and infer TypeScript types from them instead of maintaining parallel hand-written contract types.
- Treat block scope as engine registry metadata rather than authored content. Bundle instances stay data-only: `type` plus author-configured `config`.
- Expected validation composition for later features is: parse schema -> validate structure -> validate compatibility.
- No new ADR is required unless schema ownership across `engine`, `contracts`, and `db` reveals a non-obvious boundary trade-off.

## Acceptance Criteria

- A canonical story bundle schema is defined for metadata, roles, graph structure, block instances, condition trees, and version fields.
- Block instances in authored bundle JSON contain `type` and `config` only; scope is not duplicated outside engine registry metadata.
- Invalid bundles are rejected with deterministic validation failures categorized by schema, structure, or compatibility layer before publish.
- Version metadata is defined clearly enough to support publish-time engine major-version stamping and later migration handling.
- Example valid and invalid bundle fixtures exist for later publish and runtime tests.
- The feature introduces no duplicated contract definitions across engine, API, and persistence layers.

## Test Plan

- Add unit tests for bundle schema parsing success and malformed-shape failures.
- Add unit tests for structural validation failures, including duplicate ids, broken references, and invalid entrypoints.
- Add unit tests for compatibility validation failures, including unknown block types, unknown condition names, and unsupported engine major versions.
- Add targeted tests proving validation failures are structured deterministically enough for publish tooling to surface.
- Manually verify that a representative authored JSON bundle can be parsed, validated, and rejected or accepted deterministically.

## Rollout and Observability

- Internal-only rollout; no player-facing release surface.
- Validation failures should return structured errors tagged by validation layer so later authoring and publish tooling can surface them directly.
- Success is measured by later features consuming one stable bundle contract instead of redefining story shapes per layer.

## Risks and Mitigations

- Risk: the schema grows around speculative future creator needs. Mitigation: optimize for Phase 1 internal JSON authoring and curated MVP stories only.
- Risk: bundle types drift between engine, API, and persistence layers. Mitigation: define one schema source of truth and infer types from it.
- Risk: validation rules blur authoring errors, graph integrity errors, and runtime compatibility concerns into one opaque failure surface. Mitigation: keep schema, structure, and compatibility validation separate but composable.
- Risk: authored content duplicates engine-owned behavior such as block scope. Mitigation: keep runtime metadata in engine registries and keep the bundle contract data-only.

## Open Questions

- None. This feature resolves the main contract-boundary questions needed before storage and publish work begin.
