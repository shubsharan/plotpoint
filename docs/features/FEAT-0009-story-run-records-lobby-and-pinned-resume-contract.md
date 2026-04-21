| Field                         | Value |
| ----------------------------- | ----- |
| **Status**                    | Not Started |
| **Parent Epic**               | [EPIC-0004-story-run-lifecycle-persistence-and-multiplayer-state](../epics/EPIC-0004-story-run-lifecycle-persistence-and-multiplayer-state.md) |
| **Related Feature PRDs**      | [FEAT-0006-runtime-state-model-and-engine-public-surface](../features/FEAT-0006-runtime-state-model-and-engine-public-surface.md)<br>[FEAT-0008-condition-registry-and-graph-traversal-semantics](../features/FEAT-0008-condition-registry-and-graph-traversal-semantics.md) |
| **Related ADRs**              | [ADR-0002-headless-engine-runtime-boundary](../adrs/ADR-0002-headless-engine-runtime-boundary.md) |
| **Related Architecture Docs** | [hexagonal-feature-slice-architecture](../architecture/hexagonal-feature-slice-architecture.md) |

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
- Define the adapter-owned resume envelope that adapters assemble before invoking the engine.
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
6. Participant binding must remain separate from role progress so replacement can preserve role-scoped runtime state exactly.
7. Resume must assemble engine `loadSession` input from adapter-owned run records rather than storing or replaying `RuntimeFrame` as the primary persistence shape.
8. Shared state records must carry monotonic revision metadata even though direct-commit and sync-gate policy is deferred, so later sync work can build on an ordered shared-state boundary.
9. API transport DTOs must remain route-local and map into the feature's adapter-owned records or assembler envelope before engine invocation.
10. Public naming for this boundary must use `StoryRun` terminology for adapters while preserving engine `sessionId` naming inside `SessionState`.
11. The feature must explicitly defer lifecycle orchestration, shared-state commit policy, sync-gate rules, and realtime delivery to later EPIC-0004 slices.

## Locked Contracts

### Story Run Aggregate Boundary

- `StoryRun` is broader than engine `SessionState`.
- One run contains one `StoryRunRecord`, many role slots, zero or more pre-start invites, one shared sparse state record, and one role sparse state record per role slot once started.
- Engine `SessionState` is reconstructed per player from adapter-owned run records and is never the primary persistence schema.

### Adapter-Owned Record Families

- `StoryRunRecord`
  - `runId`
  - `storyId`
  - `storyPackageVersionId | null`
  - `status = 'lobby' | 'active' | 'completed'`
  - current admin participant id
  - `createdAt`
  - `startedAt`
  - `completedAt`
- `RunRoleSlotRecord`
  - `runId`
  - `roleId`
  - slot completion status
  - `createdAt`
  - `completedAt`
- `RunInviteRecord`
  - `runId`
  - invited participant identity
  - invite status
  - `createdAt`
  - `acceptedAt`
- `RunParticipantBindingRecord`
  - `runId`
  - `roleId`
  - participant identity
  - binding status
  - `boundAt`
  - `replacedAt`
- `StoryRunSharedStateRecord`
  - `runId`
  - sparse `sharedState.blockStates`
  - monotonic shared-state revision
  - `updatedAt`
- `RoleRunStateRecord`
  - `runId`
  - `roleId`
  - `currentNodeId`
  - sparse `playerState.blockStates`
  - last accepted shared revision pointer
  - `updatedAt`
- `RunResumeEnvelope`
  - the adapter-owned assembler input that combines the run, the caller's active binding, the bound role slot, the shared state record, and that role slot's `RoleRunStateRecord` into one engine `SessionState` for `loadSession`

### Lobby / Activation / Resume Boundary

- While a run is in `lobby`, adapters may create invites and bind participants to role slots, but no role runtime state exists yet.
- Activating a run pins `storyPackageVersionId`, initializes empty `StoryRunSharedStateRecord` and `RoleRunStateRecord` data, and transitions the run from `lobby` to `active`.
- Resume loads the active participant binding plus latest accepted shared/role state records, reconstructs engine `SessionState`, and rehydrates runtime through engine `loadSession`.
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
- Engine naming remains stable: use `sessionId` rather than `gameId` inside engine-facing contracts, and treat `StoryRun.runId -> SessionState.sessionId` as the adapter mapping boundary.

## Acceptance Criteria

- [ ] The feature defines the adapter-owned `StoryRun` aggregate separately from engine `SessionState`.
- [ ] The durable record families required for lobby, activation, and resume are explicit and sufficient to reconstruct engine `loadSession` input deterministically.
- [ ] Pinned resume behavior is locked around stored `storyPackageVersionId` and excludes implicit upgrades.
- [ ] Role-slot ownership, participant binding, and role progress are explicitly separated at the contract level.
- [ ] Role/shared persistence split is defined as separate records rather than one opaque stored runtime blob.
- [ ] Route-local DTO boundaries and reconstruction rules are explicit enough for later API work to implement without reopening the persistence boundary.
- [ ] Lifecycle policy, sync-gate behavior, realtime, and conflict-resolution concerns are clearly deferred.

## Test Plan

- Add contract tests proving a pinned run always resumes against its stored `storyPackageVersionId`, even after a newer publish exists.
- Add persistence assembly tests proving role-scoped and shared-scoped records reconstruct the expected engine `SessionState` deterministically.
- Add boundary tests proving participant replacement can preserve a role's runtime state because binding and role progress are separate durable records.
- Add activation tests proving `storyPackageVersionId` is absent in `lobby`, then pinned when the run moves to `active`.
- Add boundary tests proving run persistence stores role/shared slices separately rather than persisting a single opaque engine blob.
- Do not add lifecycle-orchestration, sync-gate, realtime fanout, or shared conflict-resolution tests in this feature.

## Rollout and Observability

- Internal contract rollout first: API/db/run implementation should adopt these record families before mobile/player-facing run UX work begins.
- Surface run reconstruction and resume failures through typed adapter errors with enough metadata to distinguish binding, pinning, and compatibility failures.
- Treat future changes to the `StoryRun` aggregate boundary or record families as EPIC-0004 contract changes, not opportunistic implementation details.

## Risks and Mitigations

- Risk: run persistence stores engine blobs directly and makes later sync work brittle. Mitigation: lock separate role/shared record families plus assembler rules now.
- Risk: participant identity and role progress get coupled and make replacement unsafe. Mitigation: define `RunParticipantBindingRecord` and `RoleRunStateRecord` as separate durable contracts now.
- Risk: pinned resume semantics are weakened by publish updates. Mitigation: persist `storyPackageVersionId` on the run record and treat upgrades as explicit future actions only.
- Risk: naming drift reintroduces `game` nouns or treats `StoryRun` as a second engine contract. Mitigation: preserve engine `sessionId` naming while making adapter `StoryRun` terminology explicit.

## Open Questions

- Planned next slice: lifecycle orchestration should land as the next EPIC-0004 feature once FEAT-0009's record boundary is implemented.
- Deferred follow-up [DF-0001]: explicit run upgrade actions for pinned published package versions remain owned by the existing runtime follow-up boundary. | Owner: EPIC-0003 | Trigger: Run orchestration implementation begins for persisted runtime resume and upgrade controls. | Exit criteria: Runtime/run docs and implementation ship an explicit upgrade action with reject-on-incompatibility behavior and pinned-version preservation.
