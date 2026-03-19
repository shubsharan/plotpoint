| Field | Value |
|---|---|
| **Type** | Epic |
| **Epic ID** | EPIC-0001 |
| **Status** | In Progress |
| **Owner** | product-engineering |
| **Target milestone** | MVP-P0 |
| **Last synced** | 2026-03-18 |

# EPIC-0001 - Platform and Planning Foundation

## Goal
Establish the planning system, repo conventions, and delivery workflow needed to execute the MVP through a spec-driven process.

## Context
Plotpoint's MVP depends on disciplined sequencing: roadmap first, then the current epic, then architecture docs and feature PRDs only when they are needed for that epic. The repo already has an initial monorepo scaffold and a first feature draft, but EPIC-0001 is not complete until the documentation system and foundational delivery workflow are in place and aligned with just-in-time planning. For the platform foundation work, this epic treats scaffold clarity as the goal: stable repo shape, naming, and shared config now, with deeper runtime implementation deferred to later epics.

## Scope

### In scope
- Finalize roadmap, epic, feature, runbook, and ADR templates.
- Define the canonical doc structure and naming conventions.
- Complete foundational workflow docs for planning, branch creation, and PR scaffolding.
- Align existing foundation work to the `EPIC-XXXX` and `FEAT-XXXX` conventions.
- Finalize monorepo/platform shape, naming, and shared config work needed for downstream implementation.

### Out of scope
- Story runtime logic and condition evaluation.
- Session lifecycle and multiplayer sync behavior.
- Player-facing mobile gameplay features.

## Success Criteria
- Planning docs exist for the roadmap, the current epic, and the current epic's implementation-ready features.
- The repo has one clear spec-driven workflow for implementation.
- Future work stays in the roadmap until the team is ready to activate the next epic.
- Monorepo build, test, typecheck, and lint surfaces are reliable enough for downstream work.

## Dependencies
- `docs/product/product-roadmap.md`
- `docs/runbooks/spec-driven-delivery-workflow.md`
- `docs/runbooks/doc-authoring-quickstart.md`
- Existing foundation work in `docs/features/FEAT-0001-monorepo-and-shared-config-finalization.md`

## Risks and Mitigations
- Risk: the team creates docs that are too heavyweight to maintain. Mitigation: keep templates concise and tie every implementation branch to one feature PRD.
- Risk: repo structure and workflow docs drift apart. Mitigation: update templates and AGENTS guidance together in the same change set.

## Feature Breakdown
- `docs/features/FEAT-0001-monorepo-and-shared-config-finalization.md`
- `docs/features/FEAT-0002-spec-driven-delivery-automation.md`

## Milestones and Sequencing
1. Finalize roadmap and documentation conventions.
2. Create only the current epic's feature PRDs and supporting docs.
3. Close remaining foundation shape and workflow gaps so feature implementation can begin.

## Open Questions
- None.
