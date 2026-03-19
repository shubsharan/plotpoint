| Field | Value |
|---|---|
| **Type** | Roadmap |
| **Status** | Active |
| **Horizon** | MVP |
| **Last synced** | 2026-03-18 |

# Plotpoint - MVP Product Roadmap

## Goal
Deliver the first playable Plotpoint MVP: a single mobile app where small groups can discover, join, and complete a curated, location-based co-op story authored internally with JSON tooling.

## MVP Outcomes
- Players can browse available stories, join a session, receive a role, and complete a narrative run.
- Internal creators can publish and update curated story bundles without custom code per story release.
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
- Use specs as contracts: roadmap -> current epic -> architecture -> feature PRD -> implementation.
- Keep content development and platform development moving in parallel.

## Roadmap Operating Model
- The roadmap is the ordered queue of MVP epics.
- Only the current epic should be fully elaborated in `docs/epics/`.
- Architecture docs and feature PRDs are created just in time for the active epic.
- Future epics stay lightweight in the roadmap until they become current, which helps reduce document drift.

## Epic Queue

| Epic | Status | Purpose |
|---|---|---|
| `EPIC-0001` | Active | Establish the planning system, doc conventions, workflow, and remaining foundation cleanup needed to start feature delivery. |
| `EPIC-0002` | Queued | Define the canonical story bundle contract and internal publishing pipeline. |
| `EPIC-0003` | Queued | Build the headless runtime engine, block model, and condition system. |
| `EPIC-0004` | Queued | Add session lifecycle, persistence, and multiplayer shared-state handling. |
| `EPIC-0005` | Queued | Deliver the mobile player shell, renderer registry, and MVP gameplay UX. |
| `EPIC-0006` | Queued | Produce flagship stories and establish structured playtest operations. |
| `EPIC-0007` | Queued | Harden the product for launch with monitoring, support, and release operations. |

Do not create full docs for queued epics until the active epic is nearly complete or a future dependency is needed to unblock current work.

## Current Epic

### EPIC-0001 - Platform and Planning Foundation
#### Progress Tracker

- [x] Roadmap drafted
- [x] EPIC-0001 doc created
- [x] EPIC-0001 feature PRDs created
- [x] Existing foundation feature specs aligned to `FEAT-XXXX`
- [x] EPIC-0001 ready for implementation
- [x] FEAT-0001 monorepo foundation finalized

Focus:
- Finalize the repo's planning system and naming conventions.
- Create only the docs needed to execute EPIC-0001 cleanly.
- Align existing foundation work to the feature-based workflow.

Exit criteria:
- EPIC-0001 has its implementation-ready feature PRDs.
- Workflow docs and agent guidance support just-in-time planning.
- The team can begin implementation from a current feature PRD without relying on speculative future docs.

Reference:
- `docs/epics/EPIC-0001-platform-and-planning-foundation.md`

## Upcoming Epics
- `EPIC-0002` - Story Schema and Publishing Pipeline. Create this epic doc only after EPIC-0001 is substantially complete or blocked on story-schema decisions.
- `EPIC-0003` - Runtime Engine and Conditions System. Create this epic doc after the story bundle contract is stable enough to implement against.
- `EPIC-0004` - Session Lifecycle and Multiplayer State. Create this epic doc when runtime contracts are stable enough to define session persistence and sync.
- `EPIC-0005` - Mobile Player Experience. Create this epic doc when the active runtime and session contracts are ready to render in mobile.
- `EPIC-0006` - Content Production and Playtest Operations. Create this epic doc when the product can support meaningful flagship story playtests.
- `EPIC-0007` - Launch Readiness. Create this epic doc when MVP gameplay is stable enough to define launch operations concretely.

## MVP Readiness Gate
Plotpoint MVP is ready when:
- One curated co-op story can be published and played end-to-end.
- Core loop works reliably: browse -> join -> play -> sync -> resume -> finish.
- Required block set is stable for current story catalog.
- Test runs and playtest runs are consistent enough for release confidence.
