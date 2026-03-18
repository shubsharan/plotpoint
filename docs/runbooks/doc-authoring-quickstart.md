| Field | Value |
|---|---|
| **Type** | Runbook |
| **Status** | Active |
| **Owner** | product-engineering |
| **Last synced** | 2026-03-18 |

# Runbook - Doc Authoring Quickstart

## Purpose
Provide a fast, repeatable guide for choosing the right doc type and linking planning artifacts correctly before implementation.

## Scope
This runbook covers authoring and maintaining roadmap, epic, architecture, feature PRD, and ADR docs in the repo.

## Use This Doc Type Guide
- `docs/product/`: strategy and roadmap.
- `docs/runbooks/`: repeatable team workflows and operational guides.
- `docs/epics/`: strategic initiatives that group multiple features.
- `docs/features/`: implementation-ready feature PRDs with acceptance criteria.
- `docs/architecture/`: cross-cutting system design docs.
- `docs/adrs/`: decision records for non-obvious trade-offs.

## Standard Authoring Order
1. Create or update `docs/product/product-roadmap.md`.
2. Create or update relevant epic docs in `docs/epics/`.
3. Add architecture docs in `docs/architecture/` if decisions are cross-cutting.
4. Add feature PRDs in `docs/features/` linked to one epic.
5. Add ADRs in `docs/adrs/` for meaningful trade-off decisions.

## Template Usage
- Start each new runbook from `docs/runbooks/_template.md`.
- Start each new epic from `docs/epics/_template.md`.
- Start each new feature PRD from `docs/features/_template.md`.
- Start each new ADR from `docs/adrs/_template.md`.

## Linking Rules
- Each feature PRD links to exactly one epic.
- Feature PRDs link required architecture docs and ADRs.
- Epics link all in-scope feature PRDs.
- ADRs reference related epics/features and architecture docs.
- Roadmap reflects current epic status at all times.

## Implementation Gate
Before coding starts:
- Feature PRD status is `In Progress`.
- Feature PRD has acceptance criteria and test plan.
- Required architecture docs and ADRs are linked.
- Branch and draft PR are created from the feature PRD context.

## Status Hygiene
- Update feature status during delivery: `Backlog -> In Progress -> In Review -> Done`.
- Update epic status as grouped features move forward.
- Update roadmap when epic status changes.

## Verification Checklist
- [ ] New doc uses the correct template.
- [ ] Metadata table is complete and current.
- [ ] Links to related docs are present and valid.
- [ ] Status fields reflect real project state.
- [ ] Feature PRD includes acceptance criteria and test plan.

## References
- `docs/product/product-roadmap.md`
- `docs/runbooks/spec-driven-delivery-workflow.md`
- `docs/runbooks/_template.md`
- `docs/epics/_template.md`
- `docs/features/_template.md`
- `docs/adrs/_template.md`
