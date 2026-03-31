| Field           | Value               |
| --------------- | ------------------- |
| **Type**        | PRD                 |
| **Feature ID**  | FEAT-0003           |
| **Status**      | Completed           |
| **Epic**        | EPIC-0002           |
| **Domains**     | Engine, Data Model  |
| **Last synced** | 2026-03-24          |

# FEAT-0003 - Story Package Schema and Validation Contract

## Goal

Define the canonical story package contract and the pure validation layers that make authored story content safe to publish and safe for the engine to load.

## Background and Context

EPIC-0002 starts with the story package contract because everything downstream depends on it. Plotpoint's Phase 1 creator workflow is internal and JSON-based, and the MVP roadmap requires curated stories to publish without custom code per release.

The product strategy defines stories as directed graphs of scenes, blocks, and conditional edges. The architecture places story package boundary ownership in `packages/engine`, with adapters mapping to route-local DTOs as needed. This feature turns that target shape into one canonical serialized contract that authoring, publishing, persistence, and later runtime loading all share without duplicating runtime authority inside authored JSON.

## Scope

### In scope

- Define the canonical serializable story package shape for story metadata, supported roles, graph nodes, edges, block instances, condition trees, and version fields.
- Define pure validation layers for schema parsing, structural graph integrity, and engine compatibility checks.
- Define the engine-version compatibility fields that are stamped onto published story packages.
- Define example valid and invalid story package fixtures that later features can reuse for publish and runtime tests.

### Out of scope

- Story draft persistence and CRUD routes.
- Publish workflow orchestration and catalog availability.
- Runtime traversal behavior or block reducer implementations beyond the contract they consume.
- Session lifecycle, player assignment, save state, or multiplayer synchronization.

## Requirements

1. The story package contract must describe a full story as serializable JSON, including story metadata, supported roles, graph structure, block instances, condition trees, and version metadata.
2. The contract must support the architecture's block model by requiring each block instance to declare a block type name and config payload. Block scope and per-block config validation remain engine-owned metadata and are not duplicated as separate authored fields in story package JSON.
3. The contract must support the architecture's condition model by representing conditions as structured trees of `check`, `and`, `or`, and `always` nodes with named condition references and params.
4. Validation must be split into three explicit pure layers: schema parsing, structural graph validation, and compatibility validation.
5. Schema parsing must reject malformed story package JSON shapes before semantic validation runs.
6. Structural graph validation must reject invalid authored content, including duplicate ids, missing node or edge targets, invalid entrypoints, unreachable nodes, and directed cycles.
7. Compatibility validation must reject story packages that reference unknown block types, invalid config for known block types, unknown condition names, or incompatible engine major-version metadata.
8. The story package schema must be authored once and reused across implementation surfaces without duplicated hand-written type definitions.
9. Validation logic that the engine relies on must remain pure and framework-free, with no API, db, or mobile dependencies.
10. Validation failures must be structured and deterministic so later authoring and publish tooling can surface issues directly.

## Architecture and Technical Notes

- Primary reference: `docs/architecture/hexagonal-feature-slice-architecture.md`
- `packages/engine` owns the serialized story package schema, inferred TypeScript types, and semantic interpretation of the story package, including block registry metadata, condition registry metadata, structural validation, compatibility validation, and later runtime loading behavior.
- API route request/response schemas remain adapter-owned DTOs that live beside handlers in `apps/api/src/routes/*`.
- The story package contract must align with the engine port `StoryPackageRepo.getPublishedPackage(storyId)` so later runtime work can load published story packages directly.
- Use Zod-backed schemas as the source of truth for serialized story package shapes and infer TypeScript types from them instead of maintaining parallel hand-written contract types.
- Treat block scope and block-specific config schemas as engine registry metadata rather than authored content. StoryPackage instances stay data-only: `type` plus author-configured `config`.
- The initial foundational block catalog is `text`, `location`, `code`, `single-choice`, `multi-choice`.
- `location` UI variants such as `compass`, `map`, and `hint` stay inside `config.ui.variant` rather than becoming separate block types.
- `code` modes such as `password` and `passcode` stay inside block config; `single-choice` and `multi-choice` remain separate block types because their selection rules differ materially.
- `text` uses a structured rich-text document in block config rather than raw Markdown so embedded image, audio, and video nodes can be validated explicitly inside the engine contract.
- Roles are declared as story metadata in this feature only. No role-targeted graph semantics are introduced yet.
- Expected validation composition for later features is: parse schema -> validate structure -> validate compatibility.
- No new ADR is required unless schema ownership across `engine` and `db` reveals a non-obvious boundary trade-off.

## Acceptance Criteria

- A canonical story package schema is defined for metadata, roles, graph structure, block instances, condition trees, and version fields.
- Block instances in authored story package JSON contain `type` and `config` only; scope and per-block config schemas are not duplicated outside engine registry metadata.
- Invalid story packages are rejected with deterministic validation failures categorized by schema, structure, or compatibility layer before publish, including invalid config for known block types.
- Version metadata is defined clearly enough to support publish-time engine major-version stamping and later migration handling.
- Example valid and invalid story package fixtures exist for later publish and runtime tests.
- The feature introduces no duplicated contract definitions across engine, API, and persistence layers.

## Test Plan

- Add unit tests for story package schema parsing success and malformed-shape failures.
- Add unit tests for structural validation failures, including duplicate ids, broken references, and invalid entrypoints.
- Add unit tests for compatibility validation failures, including unknown block types, invalid block config, unknown condition names, and unsupported engine major versions.
- Add targeted tests proving validation failures are structured deterministically enough for publish tooling to surface.
- Manually verify that a representative authored JSON story package can be parsed, validated, and rejected or accepted deterministically.

## Rollout and Observability

- Internal-only rollout; no player-facing release surface.
- Validation failures should return structured errors tagged by validation layer so later authoring and publish tooling can surface them directly.
- Success is measured by later features consuming one stable story package contract instead of redefining story shapes per layer.

## Risks and Mitigations

- Risk: the schema grows around speculative future creator needs. Mitigation: optimize for Phase 1 internal JSON authoring and curated MVP stories only.
- Risk: story package types drift between engine, API, and persistence layers. Mitigation: define one schema source of truth and infer types from it.
- Risk: validation rules blur authoring errors, graph integrity errors, and runtime compatibility concerns into one opaque failure surface. Mitigation: keep schema, structure, and compatibility validation separate but composable.
- Risk: authored content duplicates engine-owned behavior such as block scope. Mitigation: keep runtime metadata in engine registries and keep the story package contract data-only.

## Open Questions

- None. This feature resolves the main contract-boundary questions needed before storage and publish work begin.
