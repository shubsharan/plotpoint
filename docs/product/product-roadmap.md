| Field | Value |
|---|---|
| **Type** | Roadmap |
| **Status** | Draft |
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
- Use specs as contracts: roadmap -> epic -> architecture -> feature PRD -> implementation.
- Keep content development and platform development moving in parallel.

## Roadmap Phases

### Phase 0 - Planning and scope lock
Focus:
- Create and align roadmap, epic docs, architecture docs, and feature PRDs.
- Define MVP success metrics and select the initial flagship story set.
- Confirm boundaries for what ships in MVP vs. post-MVP.

Exit criteria:
- Core planning documents exist and link to each other.
- Priorities and sequencing are explicit enough to begin feature implementation.

### Phase 1 - Story bundle and publish foundation
Focus:
- Finalize canonical story bundle schema, validation, and versioning rules.
- Implement internal publish/load flow for curated story content.
- Ensure authored content can be stored and loaded consistently by runtime services.

Exit criteria:
- A story bundle can be validated, versioned, stored, and loaded end-to-end.

### Phase 2 - Engine runtime
Focus:
- Implement block registry and pure block reducer pattern.
- Implement traversal and condition evaluation against merged save state.
- Support migrations for bundle compatibility over engine versions.

Exit criteria:
- Engine can execute representative story flows in automated tests.

### Phase 3 - Sessions, persistence, and sync
Focus:
- Implement start/join session flows and player role assignment.
- Persist user and shared game state with reconnect and resume support.
- Wire realtime updates for multiplayer shared-state changes.

Exit criteria:
- Multiple players can progress through one session with reliable state sync.

### Phase 4 - Mobile player experience
Focus:
- Build onboarding, catalog, lobby, and gameplay shell flows.
- Render scene content and the initial MVP block set in mobile UI.
- Integrate required device capabilities (for example geolocation and QR scan).

Exit criteria:
- Players can complete an MVP story in the app with acceptable usability.

### Phase 5 - Content production and playtesting
Focus:
- Author and tune 1-2 flagship curated stories.
- Run internal/cohort playtests and close content and platform gaps.
- Harden the publish, QA, and iteration loop for rapid fixes.

Exit criteria:
- At least one story is release-ready and repeatably playable.

### Phase 6 - Launch hardening
Focus:
- Add analytics, crash/error reporting, and release instrumentation.
- Finalize release checklist, support processes, and rollback paths.
- Prepare closed alpha/beta launch and post-launch iteration cadence.

Exit criteria:
- Team can publish, monitor, support, and patch MVP with confidence.

## Epic Groups for MVP
- Platform and planning foundation.
- Story schema and publishing pipeline.
- Runtime engine and conditions system.
- Session lifecycle and multiplayer state.
- Mobile player experience.
- Content production and playtest operations.
- Launch readiness.

## MVP Readiness Gate
Plotpoint MVP is ready when:
- One curated co-op story can be published and played end-to-end.
- Core loop works reliably: browse -> join -> play -> sync -> resume -> finish.
- Required block set is stable for current story catalog.
- Test runs and playtest runs are consistent enough for release confidence.
