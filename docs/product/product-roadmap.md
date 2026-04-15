| Field           | Value      |
| --------------- | ---------- |
| **Type**        | Roadmap    |
| **Status**      | Active     |
| **Horizon**     | MVP        |
| **Last synced** | 2026-04-15 |

# Plotpoint - MVP Product Roadmap

## Goal

Deliver the first playable Plotpoint MVP: a single mobile app where small groups can discover, join, and complete a curated, location-based co-op story authored internally with JSON tooling.

## MVP Outcomes

- Players can browse available stories, join a session, receive a role, and complete a narrative run.
- Internal creators can publish and update curated story packages without custom code per story release.
- The runtime supports player-scoped and shared game-scoped state for multiplayer storytelling.
- The team can run repeatable playtests and ship improvements on a predictable release cadence.

## Out of Scope for MVP

- Open creator marketplace and revenue sharing.
- Visual story builder and AI-assisted story creation.
- Self-serve advertising marketplace and campaign tooling.
- Broad moderation and public third-party publishing workflows.

## Delivery Principles

- Build for the first stories, then generalize where needed.
- Keep engine logic headless, pure, and heavily tested.
- Ship thin vertical slices across mobile, API, db, and engine.
- Keep planning lightweight and implementation-first; docs support delivery but do not gate it.
- Keep content development and platform development moving in parallel.

## Roadmap Operating Model

- The roadmap is a strategic artifact: it defines the ordered MVP epics and their intent.
- The roadmap does not track active work, feature checklists, or execution status.
- `docs/index.md` is the operational source for active epic/feature tracking.
- Epic/feature docs carry implementation details and day-to-day progress.

## Document Ownership

- `docs/index.md` owns current implementation state and epic/feature work status rollups.
- `docs/product/` owns product strategy and roadmap sequencing.
- `docs/architecture/` owns technical boundaries, package direction, and structural conventions.
- `docs/epics/`, `docs/features/`, and `docs/adrs/` own scoped design records, acceptance contracts, and trade-off decisions.

## Epic Queue

| Epic        | Objective                                                      | MVP                                                  | Status      |
| ----------- | -------------------------------------------------------------- | ---------------------------------------------------- | ----------- |
| `EPIC-0001` | Establish planning/docs baseline and foundation cleanup.       | Creates a clean starting point for product delivery. | Complete    |
| `EPIC-0002` | Define story package contract and internal publishing pipeline. | Enables repeatable, non-code content releases.       | Complete    |
| `EPIC-0003` | Build the headless runtime engine and condition system.        | Provides core story execution semantics.             | Complete    |
| `EPIC-0004` | Add session lifecycle, persistence, and multiplayer state.     | Supports reliable co-op play across sessions.        | Not Started |
| `EPIC-0005` | Deliver mobile shell, renderer registry, and gameplay UX.      | Makes the runtime playable in the MVP app.           | Not Started |
| `EPIC-0006` | Build content production and structured playtest operations.   | Validates the experience with real story runs.       | Not Started |
| `EPIC-0007` | Harden launch readiness, monitoring, and support operations.   | Prepares MVP for dependable public rollout.          | Not Started |

## MVP Readiness Gate

Plotpoint MVP is ready when:

- One curated co-op story can be published and played end-to-end.
- Core loop works reliably: browse -> join -> play -> sync -> resume -> finish.
- Required block set is stable for current story catalog.
- Test runs and playtest runs are consistent enough for release confidence.
