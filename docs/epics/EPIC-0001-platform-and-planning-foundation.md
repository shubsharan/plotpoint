| Field                | Value               |
| -------------------- | ------------------- |
| **Type**             | Epic                |
| **Epic ID**          | EPIC-0001           |
| **Status**           | Completed           |
| **Last synced**      | 2026-03-19          |

# EPIC-0001 - Platform and Planning Foundation

## Goal

Establish baseline planning docs and repo conventions, then hand off to direct product implementation.

## Context

EPIC-0001 delivered the foundation docs and monorepo cleanup needed to start real product work. On 2026-03-19, the team explicitly cancelled FEAT-0002 (spec-driven delivery automation) and chose to move forward without additional process automation. This epic is therefore closed with a lean planning baseline rather than a fully automated workflow.

## Scope

### In scope

- Finalize roadmap, epic, feature, runbook, and ADR templates.
- Define the canonical doc structure and naming conventions.
- Keep planning workflow guidance lightweight and optional.
- Align existing foundation work to the `EPIC-XXXX` and `FEAT-XXXX` conventions.
- Finalize monorepo/platform shape, naming, and shared config work needed for downstream implementation.

### Out of scope

- Story runtime logic and condition evaluation.
- Session lifecycle and multiplayer sync behavior.
- Player-facing mobile gameplay features.

## Success Criteria

- Planning docs exist for the roadmap, the current epic, and the current epic's implementation-ready features.
- The repo has a clear minimal planning baseline that does not block implementation.
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
- Risk: workflow automation remains undone. Mitigation: defer it unless implementation pain makes it necessary later.

## Feature Breakdown

- `docs/features/FEAT-0001-monorepo-and-shared-config-finalization.md`
- `docs/features/FEAT-0002-spec-driven-delivery-automation.md` (Cancelled on 2026-03-19)

## Milestones and Sequencing

1. Finalize roadmap and documentation conventions.
2. Create only the current epic's feature PRDs and supporting docs.
3. Close remaining foundation shape gaps and begin product implementation.

## Open Questions

- None.
