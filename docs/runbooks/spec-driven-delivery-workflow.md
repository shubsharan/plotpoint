| Field           | Value      |
| --------------- | ---------- |
| **Type**        | Workflow   |
| **Status**      | Active     |
| **Last synced** | 2026-04-15 |

# Plotpoint - Spec-Driven Delivery Workflow

## Purpose

Define the update contract for planning, implementation, and docs maintenance in this repository.

## Document Ownership

- Current implementation state and status rollups live in `docs/index.md`.
- Strategy and epic sequencing live in `docs/product/`.
- Structural and technical boundary docs live in `docs/architecture/`.
- Scoped delivery records live in `docs/epics/`, `docs/features/`, and `docs/adrs/`.

## Update Rules

1. Work-state changes update status on affected epic/feature docs and sync `docs/index.md` in the same patch.
2. Scope, contracts, acceptance criteria, or test-plan changes update affected epic/feature docs.
3. Strategy and roadmap sequencing changes update `docs/product/`.
4. Architecture or package-boundary changes update `docs/architecture/`.
5. Non-obvious trade-offs update `docs/adrs/`.
6. Deferred TODOs in feature/epic docs use `Deferred follow-up [DF-XXXX]: ... | Owner: ... | Trigger: ... | Exit criteria: ...` and must be mirrored in `docs/runbooks/deferred-followups.md`.
7. Every PRD must declare related PRDs and ADRs explicitly with markdown links or `- None.` in the required sections.

## Delivery Flow

1. Confirm the epic or feature doc captures the intended scope and acceptance criteria.
2. Confirm the PRD related-doc declarations are complete before implementation starts.
3. Create the feature branch from the selected feature PRD (`FEAT-XXXX-<slug>`).
4. Set feature status to `In Progress` before implementation work starts.
5. Implement and run relevant verification (including `pnpm docs:check` when docs change).
6. If state changed, update epic/feature statuses and sync `docs/index.md`.
7. If scope changed, update scoped docs in the same patch.

## Status Contract

- Feature statuses: `Not Started`, `In Progress`, `In Review`, `Completed`, `Cancelled`.
- Epic statuses: `Planned`, `In Progress`, `Completed`, `Cancelled`.
- Roadmap remains strategic and must not be used as a feature execution dashboard.

## Guardrails

- Keep epic and feature docs authoritative for scoped status, contracts, and acceptance criteria.
- Keep `docs/index.md` as the one-page current-state rollup.
- Do not duplicate mutable feature execution status across product strategy docs.
- Keep future planning lightweight in roadmap docs until an epic becomes active.
