| Field                                        | Value |
| -------------------------------------------- | ----- |
| **Status**                                   | Planned |
| **Product and Architecture Docs**            | [product-roadmap](../product/product-roadmap.md)<br>[product-strategy](../product/product-strategy.md)<br>[hexagonal-feature-slice-architecture](../architecture/hexagonal-feature-slice-architecture.md)<br>[story-run-lifecycle-and-state-ownership](../architecture/story-run-lifecycle-and-state-ownership.md) |
| **Related Epics and Cross-PRD Dependencies** | [EPIC-0003-headless-runtime-engine-and-condition-system](../epics/EPIC-0003-headless-runtime-engine-and-condition-system.md) |
| **Related ADRs**                             | None. |
| **Feature Breakdown**                        | [FEAT-0009-story-run-records-lobby-and-pinned-resume-contract](../features/FEAT-0009-story-run-records-lobby-and-pinned-resume-contract.md)<br>[FEAT-0010-story-run-lifecycle-replacement-and-completion-contract](../features/FEAT-0010-story-run-lifecycle-replacement-and-completion-contract.md)<br>[FEAT-0011-shared-state-commits-sync-gates-and-notification-contract](../features/FEAT-0011-shared-state-commits-sync-gates-and-notification-contract.md)<br>[FEAT-0012-story-run-package-upgrade-and-compatibility-contract](../features/FEAT-0012-story-run-package-upgrade-and-compatibility-contract.md) |

# EPIC-0004 - Story Run Lifecycle, Persistence, and Multiplayer State

## Goal

Make co-op play reliable across lobby, start, play, sync, resume, and finish by adding `StoryRun` orchestration and durable state around the completed engine runtime surface.

## Context

The roadmap places this epic immediately after the headless runtime engine work because Plotpoint needs more than deterministic execution semantics to support real co-op play. The product strategy calls for local-first storytelling where players coordinate before start, follow separate role-based storylines, progress independently when offline, and sync only when the shared world or a story-defined coordination gate requires it.

EPIC-0003 completed the engine-owned execution contracts for `StoryPackage` loading, runtime state transitions, block execution, and traversal. EPIC-0004 now owns the adapter-side lifecycle, persistence, and multiplayer coordination needed to host those engine contracts across real co-op runs without moving gameplay authority out of `packages/engine`.

The key redesign in this epic is a clean split between pre-start coordination and post-start play without introducing a second aggregate root. A single adapter-owned `StoryRun` moves through `lobby`, `active`, and `completed` phases. While the run is in `lobby`, adapters manage invites, role assignment, and readiness to begin. Once the run becomes `active`, the system stops behaving like a live room and instead optimizes for role-scoped progress plus committed shared world state. The engine remains the single source of truth for story execution, while API, db, and notification adapters take responsibility for durable storage, run admin, role-slot binding, resume assembly, shared-state coordination, and update propagation.

This epic is intentionally split into four feature PRDs so implementation can lock the durable boundary first, then lifecycle behavior, then shared-state coordination, and finally the explicit package-upgrade policy that resolves the inherited runtime follow-up.

## Scope

### In scope

- Define the `StoryRun` lifecycle surfaces needed for MVP play, including lobby creation, role assignment, start, resume, participant replacement, admin transfer, and completion flows.
- Define persistent storage boundaries for sparse engine `SessionState`, including both player-scoped and shared state.
- Define role-slot, participant-binding, and admin responsibilities required for co-op setup and continuity.
- Define shared-state commit and sync-gate orchestration for local-first play, especially at critical multiplayer synchronization points.
- Define package-version pinning and resume compatibility policy around `storyPackageVersionId`.
- Define the API, db, and realtime adapter responsibilities required to host shared `StoryRun` state around the engine.

### Out of scope

- New engine block, condition, or traversal semantics already owned by `EPIC-0003`.
- Mobile renderer UX, gameplay presentation, or block rendering concerns owned by `EPIC-0005`.
- Creator tooling, story authoring, or publishing pipeline concerns from earlier epics.
- Speculative transport details, retry mechanics, or launch-operations work beyond what is needed to lock this epic boundary.

## Success Criteria

- The MVP gameplay loop can support `create run -> assign roles -> start -> play -> sync -> resume -> finish` for a co-op story run.
- The engine remains the single gameplay authority, with no run-layer duplication of execution logic.
- Ownership of role-scoped progress versus shared run state is explicit enough for later feature PRDs to implement without reopening core boundaries.
- Run resume works against pinned published package versions and fails explicitly when compatibility requirements are not met.
- The EPIC-0004 feature sequence is explicit enough that lifecycle, sync, and upgrade work can be implemented without reopening the epic boundary.

## Risks and Mitigations

- Risk: run orchestration starts to reimplement gameplay logic outside the engine. Mitigation: keep the engine as the sole execution authority and restrict this epic to lifecycle, persistence, and coordination responsibilities.
- Risk: persistence models drift away from sparse engine `SessionState` contracts. Mitigation: treat engine runtime contracts as the canonical state boundary and keep storage schemas adapter-owned projections around them.
- Risk: multiplayer coordination overfits to one hosting or sync model. Mitigation: define adapter responsibilities in a host-agnostic way so mobile-local and API-hosted flows can share the same engine contract.
- Risk: post-start play keeps inheriting live-room assumptions and overweights member presence over role progress. Mitigation: model post-start state around role slots, participant bindings, and committed shared revisions rather than join/rejoin semantics.
- Risk: resume behavior becomes ambiguous across published package upgrades. Mitigation: pin runs to `storyPackageVersionId` and make compatibility checks explicit at resume and upgrade boundaries.

## Decision Lock

- `StoryRun` is the adapter-owned aggregate for co-op play and is distinct from engine `SessionState`.
- `StoryRun.status = 'lobby' | 'active' | 'completed'`, where `lobby` is pre-start coordination only rather than a separate aggregate.
- Engine `SessionState` remains the only gameplay execution contract for one player's current runtime. Adapters map `StoryRun.runId` to engine `SessionState.sessionId` at resume time rather than reopening the engine boundary.
- Role-scoped progress and participant identity are separate concerns. Role slots and role state survive participant replacement.
- API, db, and realtime adapters own invites, role-slot binding, durable persistence, run admin, shared-state coordination, resume assembly, and update propagation around the engine.
- Shared run state is adapter-owned durable truth. The engine computes state transitions, but adapters decide when shared mutations are committed, persisted, and broadcast.
- Runs pin `storyPackageVersionId` at `startRun` and always resume against that pinned version unless a later explicit upgrade action is defined and succeeds compatibility checks.
- Co-op remains local-first and selective-sync: players may progress independently offline, while shared-state touches and story-defined sync gates trigger run-layer coordination.

## Milestones and Sequencing

1. `FEAT-0009` locks the adapter-owned `StoryRun` aggregate, lobby status, role-slot/binding record families, and pinned resume contract around the existing engine surface.
2. `FEAT-0010` defines create/invite/assign/start lifecycle behavior, `resumeRun`, participant replacement, admin transfer, and completion semantics on top of those records, including the single-role case.
3. `FEAT-0011` defines committed shared revisions, direct shared commits, explicit sync gates, and notification requirements without committing to a specific transport, while allowing one-role runs to short-circuit targeted readiness.
4. `FEAT-0012` resolves the inherited package-upgrade follow-up with admin-triggered, fail-closed compatibility rules for pinned runs.
5. Hand off player-facing rendering and gameplay UX integration to `EPIC-0005`.

## Open Questions

- No new epic-level open questions. `FEAT-0012` is the planned EPIC-0004 resolution path for the inherited `DF-0001` package-upgrade policy.
