| Field           | Value               |
| --------------- | ------------------- |
| **Type**        | Runbook             |
| **Status**      | Active              |
| **Owner**       | product-engineering |
| **Last synced** | 2026-04-15          |

# Runbook - Doc Authoring Quickstart

## Purpose

Provide a fast, repeatable guide for choosing the right doc type and keeping Plotpoint's docs contract aligned with `pnpm docs:check`.

## Scope

This runbook covers authoring and maintaining roadmap, epic, architecture, feature PRD, and ADR docs in the repo.

## Use This Doc Type Guide

- `docs/index.md`: one-page rollup of epic/feature statuses, current implementation snapshot, and full docs inventory.
- `docs/product/`: strategy and roadmap.
- `docs/runbooks/`: repeatable team workflows and operational guides.
- `docs/epics/`: strategic initiatives that group multiple features.
- `docs/features/`: implementation-ready feature PRDs with acceptance criteria.
- `docs/architecture/`: cross-cutting system design docs.
- `docs/adrs/`: decision records for non-obvious trade-offs.

## Standard Authoring Order

1. Create or update `docs/product/product-roadmap.md` only when sequencing or strategy changes.
2. Create or update only the current epic doc in `docs/epics/` when shared scope or contracts change.
3. Add architecture docs in `docs/architecture/` only when the current epic needs a cross-cutting decision documented.
4. Add feature PRDs in `docs/features/` only for the current epic, and keep acceptance criteria and test plan current.
5. Sync epic/feature status rollups and docs inventory in `docs/index.md` whenever scoped status or docs set changes.
6. Add ADRs in `docs/adrs/` for meaningful trade-off decisions.

## Just-in-Time Planning Rules

- Keep future epics lightweight in the roadmap until they become current.
- Avoid drafting full future epic docs unless they are required to unblock the active epic.
- Avoid drafting future architecture docs and feature PRDs in advance.
- Prefer changing the roadmap over maintaining speculative downstream docs.

## Template Usage

- Start each new runbook from `docs/runbooks/_template.md`.
- Start each new epic from `docs/epics/_template.md`.
- Start each new feature PRD from `docs/features/_template.md`.
- Start each new ADR from `docs/adrs/_template.md`.

## Naming Conventions

- Epic docs use `EPIC-XXXX` IDs and filenames like `docs/epics/EPIC-0001-<slug>.md`.
- Feature PRDs use `FEAT-XXXX` IDs and filenames like `docs/features/FEAT-0001-<slug>.md`.
- ADRs use `ADR-XXXX` IDs and filenames like `docs/adrs/ADR-0001-<slug>.md`.
- Scoped-doc IDs come from filenames; do not duplicate them in metadata rows.
- Feature implementation branches use `FEAT-XXXX-<slug>`.

## Metadata Table Contract

- Each feature, epic, and ADR stores machine-checked metadata in the top markdown table.
- Metadata rows are the only canonical source for related-doc links; do not duplicate those inventories in body sections.
- Scalar state belongs in the table only when tooling actually reads it. For scoped docs, `Status` is the behavior-bearing scalar.
- Relationship groups use inline Markdown links inside the value cell.
- Multiple links in one cell use `<br>`.
- Empty optional relationship groups use `None.` exactly.

## Required Relationship Rows

- Feature PRDs must include:
  - `Status`
  - `Parent Epic`
  - `Related Feature PRDs`
  - `Related ADRs`
  - `Related Architecture Docs`
- Epics must include:
  - `Status`
  - `Product and Architecture Docs`
  - `Related Epics and Cross-PRD Dependencies`
  - `Related ADRs`
  - `Feature Breakdown`
- ADRs must include:
  - `Status`
  - `Date`
  - `Deciders`
  - `Related Epics`
  - `Related Feature PRDs`
  - `Related Architecture Docs`

## Linking Rules

- Feature `Parent Epic` contains exactly one epic link.
- Feature optional relationship rows contain markdown links or `None.`.
- Epic `Feature Breakdown` contains feature links or `None.`.
- Epic `Product and Architecture Docs` may include `product/`, `architecture/`, or `runbooks/` links when those are the governing docs for the epic.
- ADR relationship rows contain markdown links or `None.`.
- `docs/index.md` lists every markdown file under `docs/` except `docs/index.md` itself.

## Implementation Gate

Before coding starts:

- Feature PRD status is `In Progress`.
- Feature PRD has acceptance criteria and test plan.
- Feature metadata-table relationship rows are complete and valid.
- Branch and draft PR are created from the feature PRD context.

## Status Hygiene

- Update feature status during delivery: `Not Started -> In Progress -> In Review -> Completed`.
- Allowed feature statuses: `Not Started`, `In Progress`, `In Review`, `Completed`, `Cancelled`.
- Allowed epic statuses: `Planned`, `In Progress`, `Completed`, `Cancelled`.
- ADR statuses should stay within `Proposed`, `Accepted`, `Deprecated`, or `Superseded by ADR-XXXX-<slug>`.
- Update epic status as grouped features move forward, then sync `docs/index.md` in the same patch.
- Keep roadmap strategic; avoid using it as a feature execution dashboard.

## Verification Checklist

- [ ] New doc uses the correct template.
- [ ] Metadata table contains all required rows for that doc type.
- [ ] Relationship rows use markdown links, `<br>`, and `None.` exactly as required.
- [ ] Body sections do not duplicate canonical related-doc inventories.
- [ ] Status fields reflect real project state.
- [ ] Feature PRD includes acceptance criteria and test plan.
- [ ] `docs/index.md` rollup statuses match epic/feature doc statuses.
- [ ] `docs/index.md` docs inventory matches the files currently under `docs/`.
- [ ] Run `pnpm docs:check` successfully after docs changes.

## References

- `docs/product/product-roadmap.md`
- `docs/runbooks/spec-driven-delivery-workflow.md`
- `docs/runbooks/_template.md`
- `docs/epics/_template.md`
- `docs/features/_template.md`
- `docs/adrs/_template.md`
