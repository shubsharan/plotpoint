| Field                         | Value |
| ----------------------------- | ----- |
| **Status**                    | Not Started |
| **Parent Epic**               | [EPIC-0004-story-run-lifecycle-persistence-and-multiplayer-state](../epics/EPIC-0004-story-run-lifecycle-persistence-and-multiplayer-state.md) |
| **Related Feature PRDs**      | [FEAT-0009-story-run-records-lobby-and-pinned-resume-contract](../features/FEAT-0009-story-run-records-lobby-and-pinned-resume-contract.md)<br>[FEAT-0011-shared-state-commits-sync-gates-and-notification-contract](../features/FEAT-0011-shared-state-commits-sync-gates-and-notification-contract.md) |
| **Related ADRs**              | [ADR-0002-headless-engine-runtime-boundary](../adrs/ADR-0002-headless-engine-runtime-boundary.md) |
| **Related Architecture Docs** | [hexagonal-feature-slice-architecture](../architecture/hexagonal-feature-slice-architecture.md)<br>[story-run-lifecycle-and-state-ownership](../architecture/story-run-lifecycle-and-state-ownership.md) |

# FEAT-0010 - Story Run Lifecycle, Replacement, and Completion Contract

## Goal

Define the adapter-owned lifecycle contract that turns the `FEAT-0009` `StoryRun` record boundary into concrete `create -> invite -> assign -> start -> resume -> replace -> finish` behavior for MVP co-op play.

## Background and Context

`FEAT-0009` locks the durable `StoryRun` aggregate, lobby boundary, role-slot/binding split, sparse role/shared persistence split, and pinned resume behavior. That work does not yet define how adapters assemble those records into lifecycle operations or when a run becomes durably complete.

EPIC-0004 needs that next slice before shared-state sync and package-upgrade work can be specified cleanly. This feature keeps the engine as the only gameplay authority while defining the lifecycle service surface that API and db adapters must implement around `startSession` and `loadSession`.

Although this slice is driven by co-op requirements, the lifecycle contract must also support single-player stories as runs with exactly one role slot. Solo play uses the same durable records and resume path without requiring multiplayer-specific orchestration.

## Scope

### In scope

- Define the adapter lifecycle service surface for `createRun`, invite, assignment, `startRun`, `resumeRun`, participant replacement, admin transfer, and completion.
- Define durable run, role-slot, and participant-binding status transitions for MVP lifecycle behavior.
- Define transferable run admin ownership for lifecycle and later package-upgrade authorization.
- Define fixed-roster-after-start policy for MVP play.
- Define completion rules for role slots and the run aggregate.
- Define typed lifecycle failures for missing bindings, invalid transitions, replacement authorization, completion blocking, and pinned-version resume failures.

### Out of scope

- Shared-state commit policy, sync-gate readiness semantics, and notification fanout.
- Shared-state conflict handling or shared revision acceptance rules.
- Package upgrade compatibility or migration logic.
- Brand-new role-slot creation after a run becomes `active`.
- Mobile UX or player-facing screens for lifecycle flows.

## Requirements

1. The feature must define adapter use cases for `createRun`, `inviteParticipantToRole`, `cancelInvite`, `acceptInvite`, `assignSelfToRole`, `startRun`, `resumeRun`, `replaceParticipant`, `transferRunAdmin`, `completeRole`, and `completeRun`.
2. `createRun` must create a `StoryRunRecord` in `lobby` plus the required `RunRoleSlotRecord` rows without pinning `storyPackageVersionId` yet, and one-role stories must auto-bind the host/admin to the only slot without creating an invite.
3. `startRun` must validate required role assignment through active bindings, pin `storyPackageVersionId`, create the initial empty `StoryRunSharedStateRecord` and `RoleRunStateRecord` rows, and then invoke engine `startSession` without persisting `RuntimeFrame` as authoritative run data.
4. Run admin is durable run metadata and is transferable for MVP lifecycle decisions, including future upgrade authorization.
5. After `startRun`, the role roster is fixed. Adapters may replace the participant bound to an existing role slot, but they must reject new role-slot creation or ad hoc late joins.
6. `resumeRun` must reconstruct the member runtime from the caller's active role binding, the latest accepted run records, and pinned `storyPackageVersionId` before invoking engine `loadSession`.
7. Participant replacement must preserve the displaced role slot's `RoleRunStateRecord` exactly.
8. `StoryRun.status` must be limited to `lobby | active | completed` for MVP. No reopen transition exists once a run is completed.
9. A role slot can only transition to `completed` after that slot's terminal role state and latest accepted shared-state pointer are durably persisted.
10. A run can only transition from `active` to `completed` when every required role slot in the run is `completed`.
11. Lifecycle failures must surface through typed adapter errors rather than route-local booleans or implicit fallbacks.
12. Single-player runs must be first-class: the same lifecycle contract applies when the run contains exactly one role slot.

## Locked Contracts

### Lifecycle Service Surface

- `createRun(request)` creates the `StoryRunRecord` in `lobby`, required `RunRoleSlotRecord` rows, and initial run admin metadata.
- `inviteParticipantToRole(request)` creates one role-specific `RunInviteRecord` while the run is in `lobby`.
- `cancelInvite(request)` explicitly cancels a pending role-specific invite so that slot or participant can be reused.
- `acceptInvite(request)` atomically marks the invite accepted and creates the corresponding `RunParticipantBindingRecord`.
- `assignSelfToRole(request)` lets the host/admin claim one unbound role slot directly in `lobby` without creating a synthetic self-invite.
- `startRun(request)` validates required role assignment, creates initial empty `StoryRunSharedStateRecord` and `RoleRunStateRecord` rows, pins `storyPackageVersionId`, transitions the run to `active`, and invokes engine `startSession`.
- `resumeRun(request)` requires an active binding, assembles the latest `RunResumeEnvelope`, and invokes engine `loadSession`.
- `replaceParticipant(request)` requires run admin authorization, rebinds an existing role slot to a new participant, and leaves the slot's `RoleRunStateRecord` unchanged.
- `transferRunAdmin(request)` reassigns run admin without mutating role-slot progress or shared state.
- `completeRole(request)` persists the caller's terminal role state, marks that role slot `completed`, and completes the run only if every required role slot is now `completed`.

### Lifecycle Statuses

- `StoryRunStatus = 'lobby' | 'active' | 'completed'`
- `RunRoleSlotStatus = 'pending' | 'assigned' | 'active' | 'completed'`
- `RunParticipantBindingStatus = 'bound' | 'replaced'`
- Allowed run transitions: `lobby -> active -> completed`
- Allowed role-slot transition after activation: `active -> completed`
- `resumeRun` is an operation on an existing active binding, not a durable status value.
- A one-role run satisfies any "all required roles completed" rule when that single role completes.

### Resume Assembly Contract

- `RunResumeEnvelope` remains the adapter-owned assembly boundary from `FEAT-0009`.
- The envelope used by `resumeRun` must contain the `StoryRunRecord`, the caller's active `RunParticipantBindingRecord`, the bound `RunRoleSlotRecord`, the latest accepted `StoryRunSharedStateRecord`, the bound role slot's `RoleRunStateRecord`, and the pinned `storyPackageVersionId`.
- Adapters may derive route-local response DTOs from the loaded engine `RuntimeFrame`, but they must not persist `RuntimeView` or `RuntimeFrame` as authoritative lifecycle state.

### Route-Local DTO Boundary

- API route contracts stay route-local and map into lifecycle requests before touching db or engine adapters.
- Lifecycle requests and responses are adapter-owned contracts and must not mirror raw HTTP payloads as the durable service interface.
- Route handlers may shape response payloads for mobile/API clients, but status transitions and completion decisions live in the lifecycle service.

### Typed Lifecycle Errors

- `run_not_found`
- `run_binding_not_found`
- `run_role_assignment_incomplete`
- `run_start_not_allowed`
- `run_replace_not_allowed`
- `run_admin_transfer_not_allowed`
- `run_already_completed`
- `run_completion_blocked`
- `run_resume_package_missing`
- `run_resume_compatibility_failed`

## Architecture and Technical Notes

- The engine remains the sole gameplay authority. Lifecycle services orchestrate record loading and persistence around engine calls but do not replicate traversal or block logic.
- Run admin is run-owned metadata, not a UI concept or a role-progress owner.
- Run completion is a durable orchestration boundary. The final accepted role/shared state must be stored before the run can move to `completed`.
- This feature intentionally stops before shared-state commit and sync-gate coordination so `FEAT-0011` can define acceptance and targeted readiness rules cleanly.

## Acceptance Criteria

- [ ] The feature defines adapter use cases for create, invite, assign, start, resume, replacement, admin transfer, and role/run completion on top of `FEAT-0009` records.
- [ ] Fixed-roster-after-start MVP behavior is explicit, including rejection of new role-slot creation after activation.
- [ ] Run, role-slot, and participant-binding statuses are explicit and limited to the MVP lifecycle transitions defined here.
- [ ] Single-player runs are explicitly supported through the same run lifecycle model with exactly one role slot.
- [ ] Transferable admin ownership is explicit enough for later upgrade authorization to depend on it.
- [ ] Completion semantics require durable terminal role state and completion of every required role slot before the run completes.
- [ ] Typed lifecycle failures are explicit enough for API work to implement without inventing new lifecycle semantics.

## Test Plan

- Add contract tests proving `createRun` creates a `lobby` run with required role slots and no pinned package version yet.
- Add start tests proving `startRun` rejects incomplete required-role assignment and, on success, pins `storyPackageVersionId` and initializes shared/role state before returning the first runtime.
- Add lifecycle tests proving a one-role run can start, resume, and complete without any co-op-only branching.
- Add replacement tests covering participant rebinding of an existing role slot without mutating that slot's runtime state.
- Add admin-transfer tests proving admin authority can move without mutating role progress or shared state.
- Add resume assembly tests proving `resumeRun` reconstructs engine input from durable records rather than persisted `RuntimeFrame` blobs.
- Add completion tests proving a run remains `active` until every required role slot is durably marked `completed`.
- Add failure tests for missing binding, invalid start, unauthorized replacement, invalid completion attempts, and pinned-version resume failures.

## Rollout and Observability

- Land lifecycle contracts before shared-state sync work so `FEAT-0011` can build on stable run statuses, role-slot boundaries, and admin ownership.
- Surface lifecycle errors with typed codes and enough metadata to distinguish missing binding, completed run, and package-version resume failures.
- Record run creation, invitation, assignment, start, resume, replacement, admin transfer, and completion transitions as adapter-level operational events so future API/mobile work can inspect lifecycle failures without reading raw db state.

## Risks and Mitigations

- Risk: lifecycle services start storing or returning transport-shaped blobs as durable truth. Mitigation: keep the authoritative boundary on `StoryRunRecord`, `RunRoleSlotRecord`, `RunParticipantBindingRecord`, `StoryRunSharedStateRecord`, `RoleRunStateRecord`, and `RunResumeEnvelope`.
- Risk: participant replacement mutates progress by accident. Mitigation: lock replacement to rebinding an existing role slot while preserving that slot's role state exactly.
- Risk: completion semantics drift into UI or route handlers. Mitigation: define completion decisions and status transitions in the lifecycle service contract.

## Open Questions

- None. New role-slot creation beyond `lobby` remains outside this feature and should not be introduced opportunistically.
