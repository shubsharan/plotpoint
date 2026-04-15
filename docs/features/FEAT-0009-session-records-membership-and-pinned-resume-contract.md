| Field           | Value       |
| --------------- | ----------- |
| **Type**        | PRD         |
| **Feature ID**  | FEAT-0009   |
| **Status**      | Not Started |
| **Epic**        | EPIC-0004   |
| **Domains**     | API, DB, Engine |
| **Last synced** | 2026-04-15  |

# FEAT-0009 - Session Records, Membership, and Pinned Resume Contract

## Goal

Define the first EPIC-0004 session boundary around the completed engine runtime by locking the adapter-owned session aggregate, membership/role ownership, sparse player-vs-shared persistence split, and pinned resume behavior.

## Background and Context

EPIC-0003 finished the headless runtime surface inside `packages/engine`, including sparse `SessionState`, deterministic block execution, and fact-based traversal. EPIC-0004 now needs the first adapter-owned session layer that can host those engine contracts across real co-op runs without duplicating gameplay authority.

The product strategy calls for local-first co-op stories where players receive roles, progress independently when offline, and synchronize only when shared state or multiplayer checkpoints require coordination. This feature locks the durable session record model needed for that experience while intentionally stopping short of checkpoint barriers, realtime fanout, or shared-state conflict handling.

## Related Docs

### Parent Epic

- [EPIC-0004-session-lifecycle-persistence-and-multiplayer-state](../epics/EPIC-0004-session-lifecycle-persistence-and-multiplayer-state.md)

### Related Feature PRDs

- [FEAT-0006-runtime-state-model-and-engine-public-surface](../features/FEAT-0006-runtime-state-model-and-engine-public-surface.md)
- [FEAT-0008-condition-registry-and-graph-traversal-semantics](../features/FEAT-0008-condition-registry-and-graph-traversal-semantics.md)

### Related ADRs

- [ADR-0002-headless-engine-runtime-boundary](../adrs/ADR-0002-headless-engine-runtime-boundary.md)

### Related Architecture Docs

- [hexagonal-feature-slice-architecture](../architecture/hexagonal-feature-slice-architecture.md)

## Scope

### In scope

- Define the adapter-owned session aggregate and its first durable record families.
- Define membership and role-claim boundaries required for session start, join, rejoin, and resume.
- Define how sparse player-scoped and shared-scoped persistence reconstruct engine `SessionState`.
- Define pinned resume behavior around `storyPackageVersionId`.
- Define the contract-level start/join/load session surfaces that adapters assemble before invoking the engine.
- Normalize session terminology across engine-facing contracts so durable session work does not codify legacy `game` naming.

### Out of scope

- Checkpoint barrier semantics or readiness coordination.
- Shared-state conflict resolution, offline outbox replay, or retry policy.
- Realtime event transport, fanout payloads, or subscription mechanics.
- Mobile renderer UX or player-facing session flows.
- Explicit package-upgrade actions beyond preserving the deferred follow-up boundary.
- Broad late-join policy beyond basic membership restoration rules.

## Requirements

1. The feature must define `session` as an adapter-owned multiplayer aggregate distinct from engine `SessionState`.
2. The feature must define the first durable record families needed to reconstruct one player's engine runtime from session data: `SessionRecord`, `SessionMembershipRecord`, `SessionSharedStateRecord`, and `PlayerSessionStateRecord`.
3. Session start must pin `storyPackageVersionId` and persist that pin on the session record so later resumes always reconstruct against the same published package version.
4. Player-scoped state and shared-scoped state must remain separate persistence concerns and must not collapse into one opaque stored `SessionState` blob.
5. Session resume must assemble engine `loadSession` input from adapter-owned session records rather than storing or replaying `RuntimeFrame` as the primary persistence shape.
6. Membership must own role claims. First join claims a role, rejoin restores that same role and player-scoped runtime snapshot, and duplicate role claims are rejected.
7. Shared state records must carry monotonic revision metadata even though conflict-handling policy is deferred, so later sync work can build on an ordered shared-state boundary.
8. API transport DTOs must remain route-local and map into the feature's adapter-owned records or assembler envelope before engine invocation.
9. Public naming for this boundary must use `session` terminology across docs and engine-facing contracts, including `sessionId` in engine `SessionState` and `startSession` input.
10. The feature must explicitly defer checkpoint orchestration, shared-state conflict rules, and realtime delivery to the next EPIC-0004 slice.

## Locked Contracts

### Session Aggregate Boundary

- `Session` is broader than engine `SessionState`.
- One session contains one pinned story/package version, many memberships, one shared sparse state record, and one player sparse state record per membership.
- Engine `SessionState` is reconstructed per player from adapter-owned session records and is never the primary persistence schema.

### Adapter-Owned Record Families

- `SessionRecord`
  - `sessionId`
  - `storyId`
  - `storyPackageVersionId`
  - adapter-owned lifecycle status
  - `createdAt`
  - `startedAt`
  - `completedAt`
- `SessionMembershipRecord`
  - `sessionId`
  - player identity
  - claimed `roleId`
  - membership status
  - `joinedAt`
  - `rejoinedAt`
- `SessionSharedStateRecord`
  - `sessionId`
  - sparse `sharedState.blockStates`
  - monotonic shared-state revision
  - `updatedAt`
- `PlayerSessionStateRecord`
  - `sessionId`
  - player identity
  - `currentNodeId`
  - sparse `playerState.blockStates`
  - last accepted shared revision pointer
  - `updatedAt`
- `SessionResumeEnvelope`
  - the adapter-owned assembler input that combines the four record families into one engine `SessionState` for `loadSession`

### Start / Join / Resume Surfaces

- `start session`
  - create the session record pinned to the current published `storyPackageVersionId`
  - create the creator's membership
  - initialize empty sparse shared/player state records
  - assemble engine `startSession` or equivalent first-player runtime return
- `join session`
  - create or restore a membership for the requesting player and role
  - reject duplicate role claims
  - assemble runtime from session records without changing the pinned package version
- `load or resume session`
  - load existing membership plus latest accepted shared/player state records
  - reconstruct engine `SessionState`
  - rehydrate runtime through engine `loadSession`

### Pinned Resume Contract

- Session start pins `storyPackageVersionId`.
- Resume always uses the pinned version, even when newer publishes exist.
- Compatibility failures fail closed and preserve the prior session boundary.
- Explicit upgrade actions remain deferred follow-up work under `DF-0001`.

## Architecture and Technical Notes

- The engine remains the single gameplay authority. API/db own durable session truth and assemble engine inputs around it.
- Shared session state is adapter-owned durable truth; engine commands compute the next accepted state but do not own cross-player coordination policy in this feature.
- This feature intentionally stops at persistence and reconstruction contracts. Checkpoint barriers, shared-state acceptance rules, and realtime delivery stay out of scope so FEAT-0010 can own them cleanly.
- Route handlers should persist sparse player/shared records and reconstruct engine `SessionState`; they should not persist hydrated `RuntimeView` or whole `RuntimeFrame` snapshots as authoritative data.
- Session naming is product-facing and durable. Use `sessionId` rather than `gameId` across engine-facing contracts before API/db schemas build on the old term.

## Acceptance Criteria

- [ ] The feature defines the adapter-owned session aggregate separately from engine `SessionState`.
- [ ] The durable record families required for start/join/resume are explicit and sufficient to reconstruct engine `loadSession` input deterministically.
- [ ] Pinned resume behavior is locked around stored `storyPackageVersionId` and excludes implicit upgrades.
- [ ] Membership ownership, rejoin restoration, and duplicate-role rejection are explicit at contract level.
- [ ] Player/shared persistence split is defined as separate records rather than one opaque stored runtime blob.
- [ ] Route-local DTO boundaries and reconstruction rules are explicit enough for later API work to implement without reopening the persistence boundary.
- [ ] Checkpoint, realtime, and conflict-resolution concerns are clearly deferred.

## Test Plan

- Add contract tests proving a pinned session always resumes against its stored `storyPackageVersionId`, even after a newer publish exists.
- Add persistence assembly tests proving player-scoped and shared-scoped records reconstruct the expected engine `SessionState` deterministically.
- Add membership tests covering first join role claim, rejoin restoration of role and player runtime state, and duplicate-role rejection.
- Add start/load flow tests proving session creation initializes empty shared/player sparse state correctly and resume returns the correct player node plus shared-state projection.
- Add boundary tests proving session persistence stores player/shared slices separately rather than persisting a single opaque engine blob.
- Do not add checkpoint barrier, realtime fanout, or shared conflict-resolution tests in this feature.

## Rollout and Observability

- Internal contract rollout first: API/db/session implementation should adopt these record families before mobile/player-facing session UX work begins.
- Surface session reconstruction and resume failures through typed adapter errors with enough metadata to distinguish membership, pinning, and compatibility failures.
- Treat future changes to the session aggregate boundary or record families as EPIC-0004 contract changes, not opportunistic implementation details.

## Risks and Mitigations

- Risk: session persistence stores engine blobs directly and makes later sync work brittle. Mitigation: lock separate player/shared record families plus assembler rules now.
- Risk: shared-state authority drifts into clients or route-local heuristics. Mitigation: define shared state as adapter-owned durable truth even though conflict policy is deferred.
- Risk: pinned resume semantics are weakened by publish updates. Mitigation: persist `storyPackageVersionId` on the session record and treat upgrades as explicit future actions only.
- Risk: naming drift reintroduces `game` nouns into API/db contracts. Mitigation: rename engine-facing identifiers to `sessionId` in the same wave as this feature contract.

## Open Questions

- Planned next slice: checkpoint and shared-state sync orchestration should land as the next EPIC-0004 feature once FEAT-0009's record boundary is implemented.
- Deferred follow-up [DF-0001]: explicit session upgrade actions for pinned published package versions remain owned by the existing runtime follow-up boundary. | Owner: EPIC-0003 | Trigger: Session orchestration implementation begins for persisted runtime resume and upgrade controls. | Exit criteria: Runtime/session docs and implementation ship an explicit upgrade action with reject-on-incompatibility behavior and pinned-version preservation.
