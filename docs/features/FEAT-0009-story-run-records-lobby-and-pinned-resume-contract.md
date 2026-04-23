| Field                         | Value |
| ----------------------------- | ----- |
| **Status**                    | In Progress |
| **Parent Epic**               | [EPIC-0004-story-run-lifecycle-persistence-and-multiplayer-state](../epics/EPIC-0004-story-run-lifecycle-persistence-and-multiplayer-state.md) |
| **Related Feature PRDs**      | [FEAT-0006-runtime-state-model-and-engine-public-surface](../features/FEAT-0006-runtime-state-model-and-engine-public-surface.md)<br>[FEAT-0008-condition-registry-and-graph-traversal-semantics](../features/FEAT-0008-condition-registry-and-graph-traversal-semantics.md) |
| **Related ADRs**              | [ADR-0002-headless-engine-runtime-boundary](../adrs/ADR-0002-headless-engine-runtime-boundary.md) |
| **Related Architecture Docs** | [hexagonal-feature-slice-architecture](../architecture/hexagonal-feature-slice-architecture.md)<br>[story-run-lifecycle-and-state-ownership](../architecture/story-run-lifecycle-and-state-ownership.md) |

# FEAT-0009 - Story Run Records, Lobby, and Pinned Resume Contract

## Goal

Define the first EPIC-0004 `StoryRun` boundary around the completed engine runtime by locking the adapter-owned run aggregate, `lobby` lifecycle phase, role-slot/binding ownership, sparse role-vs-shared persistence split, and pinned resume behavior.

## Background and Context

EPIC-0003 finished the headless runtime surface inside `packages/engine`, including sparse `SessionState`, deterministic block execution, and fact-based traversal. EPIC-0004 now needs the first adapter-owned run layer that can host those engine contracts across real co-op runs without duplicating gameplay authority.

The product strategy calls for local-first co-op stories where players receive roles before start, progress independently when offline, and synchronize only when shared state or story-defined coordination gates require it. This feature locks the durable run record model needed for that experience while intentionally stopping short of shared-state commit policy, sync-gate behavior, or realtime fanout.

## Scope

### In scope

- Define the adapter-owned `StoryRun` aggregate and its first durable record families.
- Define lobby, role-slot, invite, participant-binding, and role-state boundaries required for pre-start coordination and post-start resume.
- Define how sparse role-scoped and shared-scoped persistence reconstruct engine `SessionState`.
- Define pinned resume behavior around `storyPackageVersionId`.
- Define the adapter-owned resume bundle that adapters assemble before invoking the engine.
- Preserve engine `sessionId` terminology while clarifying that adapters map `StoryRun.runId` into engine `SessionState.sessionId`.

### Out of scope

- Shared-state commit semantics, sync-gate readiness coordination, or notification fanout.
- Shared-state conflict resolution, offline outbox replay, or retry policy.
- Mobile renderer UX or player-facing session flows.
- Explicit package-upgrade actions beyond preserving the deferred follow-up boundary.
- Lifecycle use-case policy for `createRun`, invite, assignment, replacement, or completion beyond the durable boundary needed by later features.

## Requirements

1. The feature must define `StoryRun` as an adapter-owned aggregate distinct from engine `SessionState`.
2. `StoryRun.status` must be limited to `lobby | active | completed`, where `lobby` means pre-start coordination under the same aggregate root.
3. The feature must define the first durable record families needed to reconstruct one player's engine runtime from run data: `StoryRunRecord`, `RunRoleSlotRecord`, `RunInviteRecord`, `RunParticipantBindingRecord`, `StoryRunSharedStateRecord`, and `RoleRunStateRecord`.
4. `storyPackageVersionId` may be `null` while a run is in `lobby`, but `startRun` must pin a published `storyPackageVersionId` on the run record before any later resume.
5. Role-scoped progress and shared-scoped state must remain separate persistence concerns and must not collapse into one opaque stored `SessionState` blob.
6. Run-layer identity must use `participantId` terminology, and adapters must map the active binding's `participantId` into engine `SessionState.playerId` at `startSession` and `loadSession` time.
7. Canonical role-slot identity for MVP must be `runId + roleId`, with exactly one slot per published story role and no duplicate or optional slot semantics in this feature.
8. Participant binding must remain separate from role progress so replacement can preserve role-scoped runtime state exactly.
9. Role-specific invites must remain separate from participant bindings so pre-start offer/acceptance history does not become the authoritative post-assignment ownership record.
10. `RunInviteRecord` must target one specific role slot via `roleId`, and invite acceptance must atomically create the binding and mark the invite accepted.
11. A participant may have at most one active binding in a run and at most one pending invite in a run. A role slot may have at most one active binding and at most one pending invite.
12. Pending invites must block any other binding or invite operation on that slot until explicitly cancelled or accepted; the system must not auto-overwrite or auto-cancel them.
13. Shared state records must carry monotonic revision metadata even though direct-commit and sync-gate policy is deferred, so later sync work can build on an ordered shared-state boundary.
14. `StoryRunSharedStateRecord` and `RoleRunStateRecord` must be absent in `lobby` and created only at `startRun`.
15. `startRun` must create one initial `RoleRunStateRecord` for every finalized role slot binding, initialize the shared revision baseline to `0`, initialize each role state's accepted shared revision pointer to `0`, and seed each role state's `currentNodeId` to the story entry node.
16. Resume must assemble engine `loadSession` input from adapter-owned run records rather than storing or replaying `RuntimeFrame` as the primary persistence shape.
17. One-role stories must auto-bind the host/admin to the only slot at `createRun`, must not use invites, and must still remain in `lobby` until an explicit `startRun`.
18. Multi-role stories must leave all slots unbound at `createRun`; the host may self-assign in `lobby`, but only one current binding may exist per slot and per participant.
19. Run admin is separate run-level metadata, not a role-progress owner, and may transfer only to a participant already known to the run through an invite or binding.
20. API transport DTOs must remain route-local and map into the feature's adapter-owned records or assembler bundle before engine invocation.
21. Public naming for this boundary must use `StoryRun` terminology for adapters while preserving engine `sessionId` naming inside `SessionState`.
22. The feature must explicitly defer lifecycle orchestration, shared-state commit policy, sync-gate rules, and realtime delivery to later EPIC-0004 slices.

## Locked Contracts

### Story Run Aggregate Boundary

- `StoryRun` is broader than engine `SessionState`.
- For MVP, one run contains exactly one canonical slot per published `StoryPackage.roles[*].id`, identified by `runId + roleId`.
- One run contains one `StoryRunRecord`, many role slots, zero or more pre-start invites, no runtime state while in `lobby`, one shared sparse state record once started, and one role sparse state record per finalized slot binding once started.
- Engine `SessionState` is reconstructed per player from adapter-owned run records and is never the primary persistence schema.

### Adapter-Owned Record Families

- `StoryRunRecord`
  - `runId`
  - `storyId`
  - `storyPackageVersionId | null`
  - `status = 'lobby' | 'active' | 'completed'`
  - current admin `participantId`
  - `createdAt`
  - `startedAt`
  - `completedAt`
- `RunRoleSlotRecord`
  - `runId`
  - `roleId`
  - `createdAt`
  - `completedAt`
  - slot phase is derived from `StoryRun.status`, active binding presence, and `completedAt` rather than persisted as a separate status field
- `RunInviteRecord`
  - `inviteId`
  - `runId`
  - `roleId`
  - invited `participantId`
  - `status = 'pending' | 'accepted' | 'cancelled'`
  - `createdAt`
  - `acceptedAt`
  - no invite record exists for one-role stories because the sole slot auto-binds at `createRun`
- `RunParticipantBindingRecord`
  - `bindingId`
  - `runId`
  - `roleId`
  - bound `participantId`
  - optional `sourceInviteId`
  - `status = 'bound' | 'replaced'`
  - `boundAt`
  - `replacedAt`
  - while the run is in `lobby`, there is at most one current binding row per slot and per participant, and pre-start reassignment deletes the old row instead of retaining history
  - after the run is `active`, occupant changes append a new binding row and mark the previous active row `replaced`
- `StoryRunSharedStateRecord`
  - `runId`
  - sparse `sharedState.blockStates`
  - monotonic shared-state revision with initial baseline `0`
  - `updatedAt`
- `RoleRunStateRecord`
  - `runId`
  - `roleId`
  - `currentNodeId`
  - sparse `playerState.blockStates`
  - last accepted shared revision pointer with initial baseline `0`
  - `updatedAt`
- `StoryRunResumeBundle`
  - the adapter-owned assembler input that combines the run, the caller's active binding, the bound role slot, the shared state record, and that role slot's `RoleRunStateRecord` into one engine `SessionState` for `loadSession`

### Invite / Binding Constraints

- `RunInviteRecord` is role-specific. Creating an invite offers one participant one specific `runId + roleId` slot; accepting it atomically marks the invite `accepted` and creates the binding row.
- Accepted invites remain as durable history and do not get deleted after binding creation.
- `sourceInviteId` is present for invite-created bindings and absent for direct host self-assignment.
- A participant with an active binding in the run cannot receive a new invite.
- A participant with a pending invite in the run cannot receive a second pending invite.
- A slot with an active binding cannot receive a new invite.
- A slot with a pending invite cannot receive a second pending invite and cannot be rebound until that invite is explicitly cancelled or accepted.
- Accepting an invite fails if the participant already has an active binding in the run.

### Lobby / Activation / Resume Boundary

- While a run is in `lobby`, adapters may issue role-specific invites and maintain current slot bindings, but no runtime state records exist yet.
- One-role stories auto-bind the host/admin to the only slot at `createRun`, skip invites entirely, and stay in `lobby` until `startRun`.
- Multi-role stories start with all slots unbound. The host may self-assign one slot directly in `lobby`; other participants acquire slots through role-specific invite acceptance.
- Lobby-time slot reassignment is editable setup, not replacement history. If the current occupant changes before `startRun`, the old pre-start binding row is removed and a new current binding row is created.
- Activating a run pins `storyPackageVersionId`, creates the initial `StoryRunSharedStateRecord`, creates one initial `RoleRunStateRecord` per finalized slot binding, preserves the finalized lobby binding row as that slot's first active binding, and transitions the run from `lobby` to `active`.
- `startRun` validates active bindings for every required slot. Accepted invites or pending lobby plans are not enough.
- Resume loads the active participant binding plus latest accepted shared/role state records, maps `runId -> SessionState.sessionId` and `participantId -> SessionState.playerId`, reconstructs engine `SessionState`, and rehydrates runtime through engine `loadSession`.
- Post-start access is role-binding based rather than join/rejoin based. Late role-slot creation after activation is outside this feature boundary.

### Pinned Resume Contract

- `startRun` pins `storyPackageVersionId`.
- Resume always uses the pinned version, even when newer publishes exist.
- Compatibility failures fail closed and preserve the prior run boundary.
- Explicit upgrade actions remain deferred follow-up work under `DF-0001`.

## Architecture and Technical Notes

- The engine remains the single gameplay authority. API/db own durable run truth and assemble engine inputs around it.
- Shared run state is adapter-owned durable truth; engine commands compute the next accepted state but do not own cross-role coordination policy in this feature.
- This feature intentionally stops at persistence and reconstruction contracts. Lifecycle orchestration, direct shared commits, sync-gate rules, and realtime delivery stay out of scope so later slices can own them cleanly.
- Route handlers should persist sparse role/shared records and reconstruct engine `SessionState`; they should not persist hydrated `RuntimeView` or whole `RuntimeFrame` snapshots as authoritative data.
- Engine naming remains stable: use `sessionId` rather than `gameId` inside engine-facing contracts, treat `StoryRun.runId -> SessionState.sessionId` as the adapter mapping boundary, and treat binding `participantId -> SessionState.playerId` as the runtime identity mapping boundary.
- `RunParticipantBindingStatus = 'bound' | 'replaced'` is unchanged for MVP. `bound` covers both finalized lobby ownership and active-run ownership; `StoryRun.status` remains the stored lifecycle phase while slot phase is derived from bindings plus slot completion state.

## Acceptance Criteria

- [ ] The feature defines the adapter-owned `StoryRun` aggregate separately from engine `SessionState`.
- [ ] The durable record families required for lobby, activation, and resume are explicit and sufficient to reconstruct engine `loadSession` input deterministically.
- [ ] Canonical role-slot identity is locked to `runId + roleId`, with one slot per published story role and no duplicate-slot semantics in this feature.
- [ ] Run-layer identity, invite targeting, and binding ownership all use `participantId`, while adapters map that identity into engine `playerId` only at runtime assembly.
- [ ] Pinned resume behavior is locked around stored `storyPackageVersionId` and excludes implicit upgrades.
- [ ] Role-slot ownership, participant binding, and role progress are explicitly separated at the contract level.
- [ ] Role-specific invites are explicit, remain separate from bindings, and include enough identity to enforce one pending invite per slot and per participant per run.
- [ ] Lobby binding edits stay mutable setup, while post-start occupant changes become append-only replacement history.
- [ ] One-role stories auto-bind the host without invites and still require explicit `startRun`; multi-role stories leave slots unbound at `createRun`.
- [ ] Role/shared persistence split is defined as separate records rather than one opaque stored runtime blob.
- [ ] Route-local DTO boundaries and reconstruction rules are explicit enough for later API work to implement without reopening the persistence boundary.
- [ ] Lifecycle policy, sync-gate behavior, realtime, and conflict-resolution concerns are clearly deferred.

## Test Plan

- Add contract tests proving a pinned run always resumes against its stored `storyPackageVersionId`, even after a newer publish exists.
- Add persistence assembly tests proving role-scoped and shared-scoped records reconstruct the expected engine `SessionState` deterministically.
- Add activation tests proving `StoryRunSharedStateRecord` and `RoleRunStateRecord` are absent in `lobby`, then created at `startRun` with shared revision `0`, per-role accepted shared revision `0`, and entry-node `currentNodeId`.
- Add roster tests proving one-role stories auto-bind the host and skip invites, while multi-role stories start unbound and require explicit slot ownership before `startRun`.
- Add invite tests proving role-specific invites enforce one pending invite per slot and per participant, block slot reassignment until cancelled or accepted, and remain durable history after acceptance.
- Add binding tests proving lobby occupant changes replace the current pre-start binding row without retaining history, while post-start occupant changes append new binding rows and mark the previous row `replaced`.
- Add boundary tests proving participant replacement can preserve a role's runtime state because binding and role progress are separate durable records.
- Add boundary tests proving run persistence stores role/shared slices separately rather than persisting a single opaque engine blob.
- Do not add lifecycle-orchestration, sync-gate, realtime fanout, or shared conflict-resolution tests in this feature.

## Rollout and Observability

- Internal contract rollout first: API/db/run implementation should adopt these record families before mobile/player-facing run UX work begins.
- Surface run reconstruction and resume failures through typed adapter errors with enough metadata to distinguish binding, pinning, and compatibility failures.
- Treat future changes to the `StoryRun` aggregate boundary or record families as EPIC-0004 contract changes, not opportunistic implementation details.

## Risks and Mitigations

- Risk: run persistence stores engine blobs directly and makes later sync work brittle. Mitigation: lock separate role/shared record families plus assembler rules now.
- Risk: invite, slot, and participant uniqueness drift into implicit handler logic and create conflicting lobby states. Mitigation: lock explicit invite/binding identity fields and one-pending/one-active constraints now.
- Risk: participant identity and role progress get coupled and make replacement unsafe. Mitigation: define `RunParticipantBindingRecord` and `RoleRunStateRecord` as separate durable contracts now.
- Risk: pinned resume semantics are weakened by publish updates. Mitigation: persist `storyPackageVersionId` on the run record and treat upgrades as explicit future actions only.
- Risk: naming drift reintroduces `game` nouns or treats `StoryRun` as a second engine contract. Mitigation: preserve engine `sessionId` naming while making adapter `StoryRun` terminology explicit.

## Open Questions

- Planned next slice: lifecycle orchestration should land as the next EPIC-0004 feature once FEAT-0009's record boundary is implemented.
- Deferred follow-up [DF-0001]: explicit run upgrade actions for pinned published package versions remain owned by the existing runtime follow-up boundary. | Owner: EPIC-0003 | Trigger: Run orchestration implementation begins for persisted runtime resume and upgrade controls. | Exit criteria: Runtime/run docs and implementation ship an explicit upgrade action with reject-on-incompatibility behavior and pinned-version preservation.
