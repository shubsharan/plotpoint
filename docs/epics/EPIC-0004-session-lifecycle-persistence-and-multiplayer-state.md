| Field                                        | Value |
| -------------------------------------------- | ----- |
| **Status**                                   | Planned |
| **Product and Architecture Docs**            | [product-roadmap](../product/product-roadmap.md)<br>[product-strategy](../product/product-strategy.md)<br>[hexagonal-feature-slice-architecture](../architecture/hexagonal-feature-slice-architecture.md) |
| **Related Epics and Cross-PRD Dependencies** | [EPIC-0003-headless-runtime-engine-and-condition-system](../epics/EPIC-0003-headless-runtime-engine-and-condition-system.md) |
| **Related ADRs**                             | None. |
| **Feature Breakdown**                        | [FEAT-0009-session-records-membership-and-pinned-resume-contract](../features/FEAT-0009-session-records-membership-and-pinned-resume-contract.md) |

# EPIC-0004 - Session Lifecycle, Persistence, and Multiplayer State

## Goal

Make co-op play reliable across join, play, sync, resume, and finish by adding session orchestration and durable state around the completed engine runtime surface.

## Context

The roadmap places this epic immediately after the headless runtime engine work because Plotpoint needs more than deterministic execution semantics to support real co-op play. The product strategy calls for local-first storytelling where players can join a shared narrative session, receive roles, progress independently when offline, and sync only at critical multiplayer checkpoints.

EPIC-0003 completed the engine-owned execution contracts for `StoryPackage` loading, runtime state transitions, block execution, and traversal. EPIC-0004 now owns the adapter-side lifecycle, persistence, and multiplayer coordination needed to host those engine contracts across real sessions without moving gameplay authority out of `packages/engine`. The engine remains the single source of truth for story execution, while API, db, and realtime adapters take responsibility for durable storage, session membership, resume flows, and shared-state coordination.

## Scope

### In scope

- Define the session lifecycle surfaces needed for MVP play, including start, join, load, resume, and completion flows.
- Define persistent storage boundaries for sparse engine `SessionState`, including both player-scoped and shared state.
- Define player membership and role-assignment responsibilities required for co-op session setup and continuity.
- Define checkpoint and sync orchestration for local-first play, especially at critical multiplayer synchronization points.
- Define package-version pinning and resume compatibility policy around `storyPackageVersionId`.
- Define the API, db, and realtime adapter responsibilities required to host shared session state around the engine.

### Out of scope

- New engine block, condition, or traversal semantics already owned by `EPIC-0003`.
- Mobile renderer UX, gameplay presentation, or block rendering concerns owned by `EPIC-0005`.
- Creator tooling, story authoring, or publishing pipeline concerns from earlier epics.
- Speculative transport details, retry mechanics, or launch-operations work beyond what is needed to lock this epic boundary.

## Success Criteria

- The MVP gameplay loop can support `join -> play -> sync -> resume -> finish` for a co-op story session.
- The engine remains the single gameplay authority, with no session-layer duplication of execution logic.
- Ownership of player-scoped versus shared session state is explicit enough for later feature PRDs to implement without reopening core boundaries.
- Session resume works against pinned published package versions and fails explicitly when compatibility requirements are not met.

## Risks and Mitigations

- Risk: session orchestration starts to reimplement gameplay logic outside the engine. Mitigation: keep the engine as the sole execution authority and restrict this epic to lifecycle, persistence, and coordination responsibilities.
- Risk: persistence models drift away from sparse engine `SessionState` contracts. Mitigation: treat engine runtime contracts as the canonical state boundary and keep storage schemas adapter-owned projections around them.
- Risk: multiplayer coordination overfits to one hosting or sync model. Mitigation: define adapter responsibilities in a host-agnostic way so mobile-local and API-hosted flows can share the same engine contract.
- Risk: resume behavior becomes ambiguous across published package upgrades. Mitigation: pin sessions to `storyPackageVersionId` and make compatibility checks explicit at resume and upgrade boundaries.

## Decision Lock

- A co-op `session` is an adapter-owned multiplayer aggregate, distinct from engine `SessionState`.
- Engine `SessionState` represents one player's resumable runtime inside a shared session and remains the only gameplay execution contract.
- API, db, and realtime adapters own session membership, durable persistence, shared-state coordination, resume assembly, and update propagation around the engine.
- Shared session state is adapter-owned durable truth. The engine computes state transitions, but adapters decide when shared mutations are accepted, persisted, and broadcast.
- Sessions pin `storyPackageVersionId` at start and always resume against that pinned version unless a later explicit upgrade action is defined and succeeds compatibility checks.
- Co-op remains local-first and selective-sync: players may progress independently offline, while shared-state touches and multiplayer checkpoints trigger session-layer coordination.

## Milestones and Sequencing

1. Lock the session/persistence boundary and ownership of player-scoped versus shared state around the existing engine surface.
2. Define the session lifecycle and persistence slices needed for start, join, load, resume, and completion behavior.
3. Define multiplayer sync and resume orchestration on top of the completed engine contracts.
4. Hand off player-facing rendering and gameplay UX integration to `EPIC-0005`.

The next planned follow-up feature after `FEAT-0009` is checkpoint and shared-state sync orchestration on top of that session boundary.

## Open Questions

- Inherited concern: `EPIC-0003` deferred follow-up `DF-0001` still needs a session-layer policy for explicit mid-session upgrades of pinned published package versions. EPIC-0004 should resolve how upgrade actions, compatibility failures, and pinned-version preservation behave during resume and live session orchestration.
