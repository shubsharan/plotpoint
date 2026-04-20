| Field                         | Value |
| ----------------------------- | ----- |
| **Status**                    | Not Started |
| **Parent Epic**               | [EPIC-0004-session-lifecycle-persistence-and-multiplayer-state](../epics/EPIC-0004-session-lifecycle-persistence-and-multiplayer-state.md) |
| **Related Feature PRDs**      | [FEAT-0009-session-records-membership-and-pinned-resume-contract](../features/FEAT-0009-session-records-membership-and-pinned-resume-contract.md)<br>[FEAT-0011-checkpoint-shared-state-sync-and-notification-contract](../features/FEAT-0011-checkpoint-shared-state-sync-and-notification-contract.md) |
| **Related ADRs**              | [ADR-0002-headless-engine-runtime-boundary](../adrs/ADR-0002-headless-engine-runtime-boundary.md) |
| **Related Architecture Docs** | [hexagonal-feature-slice-architecture](../architecture/hexagonal-feature-slice-architecture.md) |

# FEAT-0010 - Session Lifecycle, Rejoin, and Completion Contract

## Goal

Define the adapter-owned lifecycle contract that turns the `FEAT-0009` session record boundary into concrete `start -> rejoin -> load/resume -> finish` behavior for MVP co-op play.

## Background and Context

`FEAT-0009` locks the durable session aggregate, membership boundary, sparse player/shared persistence split, and pinned resume behavior. That work does not yet define how adapters assemble those records into lifecycle operations or when a session becomes durably complete.

EPIC-0004 needs that next slice before checkpoint sync and package-upgrade work can be specified cleanly. This feature keeps the engine as the only gameplay authority while defining the lifecycle service surface that API and db adapters must implement around `startSession` and `loadSession`.

Although this slice is driven by co-op requirements, the lifecycle contract must also support single-player stories as sessions with exactly one membership. Solo play uses the same durable records and resume path without requiring multiplayer-specific orchestration.

## Scope

### In scope

- Define the adapter lifecycle service surface for session start, rejoin, load/resume, and completion.
- Define durable session and membership status transitions for MVP lifecycle behavior.
- Define host ownership for the session lifecycle.
- Define rejoin-only participation policy for MVP play.
- Define completion rules for memberships and the session aggregate.
- Define typed lifecycle failures for missing membership, invalid transitions, completion blocking, and pinned-version resume failures.

### Out of scope

- Checkpoint readiness, shared-state proposal semantics, and notification fanout.
- Shared-state conflict handling or shared revision acceptance rules.
- Package upgrade compatibility or migration logic.
- Brand-new late join after the original membership set has been established.
- Mobile UX or player-facing screens for lifecycle flows.

## Requirements

1. The feature must define adapter use cases for `startSession`, `rejoinSession`, `loadSession`, and `completeMembership`.
2. Session start must create the session record, creator membership, empty sparse shared/player state records, and the first engine runtime without persisting `RuntimeFrame` as authoritative session data.
3. The session creator's membership is the immutable session host for MVP lifecycle decisions, including future upgrade authorization.
4. MVP participation is rejoin-only after session start. Adapters may restore an existing membership, but they must reject brand-new late joins.
5. `rejoinSession` and `loadSession` must reconstruct the member runtime from the latest accepted session records and pinned `storyPackageVersionId` before invoking engine `loadSession`.
6. Session status must be limited to `active` and `completed` for MVP. No reopen transition exists once a session is completed.
7. Membership status must be limited to `active` and `completed` for MVP. Rejoin restores an existing membership but does not create a new role claim or reopen a completed membership.
8. A membership can only transition to `completed` after the member's terminal player state and latest accepted shared-state pointer are durably persisted.
9. A session can only transition from `active` to `completed` when every membership in the session is `completed`.
10. Lifecycle failures must surface through typed adapter errors rather than route-local booleans or implicit fallbacks.
11. Single-player sessions must be first-class: the same lifecycle contract applies when the session contains exactly one membership.

## Locked Contracts

### Lifecycle Service Surface

- `startSession(request)` creates the `SessionRecord`, the creator's `SessionMembershipRecord`, initial empty `SessionSharedStateRecord` and `PlayerSessionStateRecord`, and then invokes engine `startSession`.
- `rejoinSession(request)` requires an existing membership, restores the previously claimed role, assembles the latest `SessionResumeEnvelope`, and invokes engine `loadSession`.
- `loadSession(request)` loads an existing membership's latest accepted runtime state from durable records and returns the same runtime envelope shape as `rejoinSession`.
- `completeMembership(request)` persists the caller's terminal player state, marks that membership `completed`, and completes the session only if every membership is now `completed`.

### Lifecycle Statuses

- `SessionStatus = 'active' | 'completed'`
- `SessionMembershipStatus = 'active' | 'completed'`
- Allowed session transition: `active -> completed`
- Allowed membership transition: `active -> completed`
- Rejoin is an operation on an existing membership, not a durable status value.
- A one-member session satisfies any "all memberships completed" rule when that single membership completes.

### Resume Assembly Contract

- `SessionResumeEnvelope` remains the adapter-owned assembly boundary from `FEAT-0009`.
- The envelope used by `rejoinSession` and `loadSession` must contain the `SessionRecord`, the caller's `SessionMembershipRecord`, the latest accepted `SessionSharedStateRecord`, the caller's `PlayerSessionStateRecord`, and the pinned `storyPackageVersionId`.
- Adapters may derive route-local response DTOs from the loaded engine `RuntimeFrame`, but they must not persist `RuntimeView` or `RuntimeFrame` as authoritative lifecycle state.

### Route-Local DTO Boundary

- API route contracts stay route-local and map into lifecycle requests before touching db or engine adapters.
- Lifecycle requests and responses are adapter-owned contracts and must not mirror raw HTTP payloads as the durable service interface.
- Route handlers may shape response payloads for mobile/API clients, but status transitions and completion decisions live in the lifecycle service.

### Typed Lifecycle Errors

- `session_not_found`
- `session_membership_not_found`
- `session_rejoin_not_allowed`
- `session_already_completed`
- `session_completion_blocked`
- `session_resume_package_missing`
- `session_resume_compatibility_failed`

## Architecture and Technical Notes

- The engine remains the sole gameplay authority. Lifecycle services orchestrate record loading and persistence around engine calls but do not replicate traversal or block logic.
- Host identity is session-owned metadata, not a UI concept. For MVP, the creator membership is the host and remains the host for the life of the session.
- Session completion is a durable orchestration boundary. The final accepted player/shared state must be stored before the session can move to `completed`.
- This feature intentionally stops before checkpoint coordination so `FEAT-0011` can define shared-state acceptance and readiness rules cleanly.

## Acceptance Criteria

- [ ] The feature defines adapter use cases for start, rejoin, load/resume, and membership completion on top of `FEAT-0009` records.
- [ ] Rejoin-only MVP behavior is explicit, including rejection of brand-new late joins.
- [ ] Session and membership statuses are explicit and limited to the MVP lifecycle transitions defined here.
- [ ] Single-player sessions are explicitly supported through the same session lifecycle model with exactly one membership.
- [ ] Host ownership is explicit enough for later upgrade authorization to depend on it.
- [ ] Completion semantics require durable terminal member state and completion of every membership before the session completes.
- [ ] Typed lifecycle failures are explicit enough for API work to implement without inventing new lifecycle semantics.

## Test Plan

- Add contract tests proving session start creates the session, creator membership, and initial sparse state records before returning the first runtime.
- Add lifecycle tests proving a one-member session can start, resume, and complete without any co-op-only branching.
- Add lifecycle tests covering rejoin restoration of role claim and player-scoped state for an existing membership.
- Add resume assembly tests proving `loadSession` reconstructs engine input from durable records rather than persisted `RuntimeFrame` blobs.
- Add completion tests proving a session remains `active` until every membership is durably marked `completed`.
- Add failure tests for missing membership, invalid rejoin, invalid completion attempts, and pinned-version resume failures.

## Rollout and Observability

- Land lifecycle contracts before checkpoint sync work so `FEAT-0011` can build on stable lifecycle statuses and host ownership.
- Surface lifecycle errors with typed codes and enough metadata to distinguish missing membership, completed session, and package-version resume failures.
- Record session start, rejoin, load, and completion transitions as adapter-level operational events so future API/mobile work can inspect lifecycle failures without reading raw db state.

## Risks and Mitigations

- Risk: lifecycle services start storing or returning transport-shaped blobs as durable truth. Mitigation: keep the authoritative boundary on `SessionRecord`, `SessionMembershipRecord`, `SessionSharedStateRecord`, `PlayerSessionStateRecord`, and `SessionResumeEnvelope`.
- Risk: rejoin policy becomes ambiguous and reintroduces late-join behavior by accident. Mitigation: lock MVP to restoration of existing memberships only.
- Risk: completion semantics drift into UI or route handlers. Mitigation: define completion decisions and status transitions in the lifecycle service contract.

## Open Questions

- None. Late-join expansion beyond membership restoration remains outside this feature and should not be introduced opportunistically.
