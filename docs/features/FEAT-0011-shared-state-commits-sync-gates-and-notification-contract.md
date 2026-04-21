| Field                         | Value |
| ----------------------------- | ----- |
| **Status**                    | Not Started |
| **Parent Epic**               | [EPIC-0004-story-run-lifecycle-persistence-and-multiplayer-state](../epics/EPIC-0004-story-run-lifecycle-persistence-and-multiplayer-state.md) |
| **Related Feature PRDs**      | [FEAT-0009-story-run-records-lobby-and-pinned-resume-contract](../features/FEAT-0009-story-run-records-lobby-and-pinned-resume-contract.md)<br>[FEAT-0010-story-run-lifecycle-replacement-and-completion-contract](../features/FEAT-0010-story-run-lifecycle-replacement-and-completion-contract.md)<br>[FEAT-0012-story-run-package-upgrade-and-compatibility-contract](../features/FEAT-0012-story-run-package-upgrade-and-compatibility-contract.md) |
| **Related ADRs**              | [ADR-0002-headless-engine-runtime-boundary](../adrs/ADR-0002-headless-engine-runtime-boundary.md) |
| **Related Architecture Docs** | [hexagonal-feature-slice-architecture](../architecture/hexagonal-feature-slice-architecture.md) |

# FEAT-0011 - Shared-State Commits, Sync Gates, and Notification Contract

## Goal

Define the adapter-owned shared-state coordination contract that supports direct shared commits, explicit sync gates, shared revision advancement, and run notifications without moving gameplay authority out of the engine.

## Background and Context

`FEAT-0009` defines the durable record families for role and shared state, and `FEAT-0010` defines the lifecycle service that loads and completes role slots around those records. EPIC-0004 still needs the rules that decide when a shared mutation becomes durable run truth and how targeted roles coordinate when a story requires explicit multiplayer gating.

The product strategy is local-first and selective-sync. Players may progress independently for role-local state, but shared-state touches and story-defined coordination gates need explicit acceptance so all roles resume from the same durable shared truth without turning the run into a live room.

Single-player stories still use the same run model. In that case, direct commits and sync-gate rules must degrade cleanly to one-role behavior rather than forcing unnecessary multiplayer coordination machinery.

## Scope

### In scope

- Define when shared-state updates may commit directly versus when they must open an explicit sync gate.
- Define the API-coordinated shared-state proposal, targeted readiness, accept, reject, and commit contracts.
- Define shared revision advancement rules for direct commits and accepted sync-gate work.
- Define how incomplete sync-gate work affects resume behavior.
- Define abstract notification/event requirements for run updates and sync-gate readiness changes.
- Define typed failures for stale revisions, incomplete readiness, rejected commits, and incomplete sync-gate resume.

### Out of scope

- New engine block types, traversal semantics, or block execution rules.
- New role-slot creation after a run becomes `active`.
- Package upgrade policy or migration behavior.
- Transport-specific commitments such as Supabase Realtime channels, websocket protocols, or polling intervals.
- Offline outbox replay or generalized retry mechanics beyond the shared-state coordination contract.

## Requirements

1. The feature must define `SyncGate` as an adapter-owned coordination unit, not as a second gameplay authority inside the engine.
2. Shared-state truth is always the latest committed shared revision in `StoryRunSharedStateRecord`.
3. Shared-state mutations may commit directly when the story/action does not require explicit coordination across roles.
4. Only story-defined sync-gate-required actions may open a `SyncGate`. Role-local actions remain outside sync-gate coordination until such a boundary is reached.
5. Every shared-state proposal must include the proposer role slot, the target run and sync-gate identity when applicable, the base shared revision, and the proposed shared mutation payload.
6. The API coordinator is the only authority that accepts or rejects a shared-state proposal for MVP.
7. Required sync-gate participants are the gate's targeted required role slots, not all active bindings in the run.
8. A sync-gate commit may only succeed when every targeted required role slot has durably reported readiness against the same base shared revision and proposal identity.
9. Accepting a direct commit or sync-gate commit must persist the next shared-state snapshot, increment the monotonic shared revision, and update each affected role slot's accepted shared revision pointer.
10. Resume behavior must expose only the last committed shared state as authoritative run truth. Uncommitted sync-gate work may be surfaced as sync-gate metadata, but it must not be replayed as accepted shared state.
11. Notification requirements must be explicit at the contract level, but the feature must not require a specific realtime transport or provider.
12. Shared-state coordination failures must surface through typed adapter errors and explicit sync-gate statuses.
13. A one-role run must short-circuit any required readiness condition immediately once that role accepts the current proposal and revision.

## Locked Contracts

### Shared Commit Boundary

- A direct shared commit is an adapter-owned acceptance path that takes a candidate shared mutation from engine output, validates it against the current shared revision, and persists it immediately when no explicit sync gate is required.
- Direct commits do not redefine engine commands. The engine still computes role-local and shared state transitions; the run layer decides when a shared result becomes durable truth.

### Sync Gate Boundary

- A `SyncGate` is an adapter-owned coordination moment identified by `runId` plus `syncGateId`.
- A sync gate starts when a story-defined coordination boundary proposes a shared-state mutation or group progression boundary that must be accepted by the API coordinator.
- Sync gates do not redefine engine commands. The engine still computes role-local and shared state transitions; the sync-gate layer decides when a shared result becomes durable run truth.

### Sync Gate State Machine

- `SyncGateStatus = 'collecting' | 'ready' | 'committed' | 'rejected' | 'expired'`
- New sync gates enter `collecting`.
- A sync gate transitions to `ready` when every targeted required role slot has reported readiness for the same proposal and base shared revision.
- The coordinator transitions `ready -> committed` when the shared mutation is durably persisted.
- The coordinator transitions `collecting | ready -> rejected` when the proposal is explicitly denied or superseded.
- The coordinator may transition `collecting | ready -> expired` when the proposal can no longer be resumed safely and roles must reload from the last committed shared revision.
- For a one-role run, the sole targeted required role can satisfy the readiness condition immediately once it accepts the current proposal and revision.

### Shared-State Proposal Contract

- `SharedStateProposal` contains `runId`, optional `syncGateId`, `proposedByRoleId`, `baseSharedRevision`, `proposalId`, and the candidate shared-state mutation payload.
- Proposal acceptance is evaluated against the current `StoryRunSharedStateRecord` revision and, when a sync gate exists, the targeted role-slot set for that gate.
- Only one proposal may be authoritative for a given `syncGateId` at a time.

### Sync Gate Readiness Contract

- `SyncGateRoleReadiness` contains `runId`, `syncGateId`, `roleId`, `proposalId`, `baseSharedRevision`, and `readiness = 'waiting' | 'ready' | 'blocked'`.
- Readiness is durable sync-gate metadata owned by adapters, not an engine field.
- A readiness update against a stale proposal or stale shared revision is rejected explicitly.

### Notification Contract

- `RunNotificationEvent` is the adapter-owned event envelope for lifecycle and shared-state updates.
- Required event types for MVP are `run.shared_state_committed`, `run.sync_gate_opened`, `run.sync_gate_role_ready`, `run.sync_gate_committed`, `run.sync_gate_rejected`, and `run.sync_gate_expired`.
- Events must contain enough metadata for participants to refresh from durable state, but the contract does not prescribe transport, channel topology, or provider-specific payload shape.

### Typed Shared-State Errors

- `shared_state_revision_stale`
- `shared_state_commit_rejected`
- `sync_gate_not_found`
- `sync_gate_role_not_ready`
- `sync_gate_proposal_rejected`
- `sync_gate_commit_conflict`
- `sync_gate_resume_incomplete`

## Architecture and Technical Notes

- API/db adapters own proposal acceptance, revision advancement, sync-gate state, and notification fanout. The engine remains responsible only for gameplay state computation.
- Shared state remains adapter-owned durable truth. Roles may compute candidate shared changes locally, but only committed shared revisions become authoritative run state.
- Resume logic must be able to distinguish last committed shared state from incomplete sync-gate metadata so participants do not hydrate unaccepted shared mutations.
- Realtime matters here as behavior, not infrastructure. The feature requires timely shared-state and sync-gate notifications, but provider choice stays implementation-specific.

## Acceptance Criteria

- [ ] The feature defines direct shared commits separately from explicit sync-gate coordination.
- [ ] The shared-state proposal, targeted readiness, commit, and rejection contracts are explicit and API-coordinated.
- [ ] Shared revision advancement is explicit enough that accepted direct commits and sync-gate work become durable shared truth.
- [ ] Resume semantics for incomplete sync gates are explicit and fail closed around last committed shared state.
- [ ] Single-player runs can satisfy direct-commit and sync-gate rules without requiring multi-role coordination.
- [ ] Notification requirements are explicit without binding the feature to a specific transport or provider.
- [ ] Typed shared-state and sync-gate failures are explicit enough for implementation without reopening sync authority rules.

## Test Plan

- Add contract tests proving a direct shared-state commit can update the committed revision without requiring full-roster readiness.
- Add sync-gate tests proving only the gate's targeted required role slots must satisfy readiness before a shared-state commit succeeds.
- Add sync-gate tests proving a one-role run can satisfy readiness and commit shared-state updates without extra coordination steps.
- Add shared revision tests proving accepted direct commits and sync-gate commits increment the shared revision and update affected role revision pointers.
- Add failure tests for stale shared revision, missing targeted readiness, rejected proposals, and commit conflicts.
- Add resume tests proving incomplete sync-gate work is surfaced as sync-gate metadata while the last committed shared state remains authoritative.
- Add notification contract tests proving shared-state and sync-gate updates emit the required run event types.

## Rollout and Observability

- Land shared-state coordination after `FEAT-0010` lifecycle contracts so readiness and completion rules can reuse established run, role-slot, and admin boundaries.
- Record direct-commit, proposal, readiness, commit, rejection, and expiration events with typed metadata so API/mobile adapters can diagnose sync failures without inferring state from raw tables.
- Keep notification delivery abstract in docs and implementation scaffolding until a concrete provider is required by the runtime host.

## Risks and Mitigations

- Risk: shared-state authority drifts into clients or route-local heuristics. Mitigation: lock proposal acceptance and commit authority to the API coordinator.
- Risk: sync-gate coordination starts inventing new gameplay semantics. Mitigation: keep sync-gate rules adapter-owned and engine-neutral.
- Risk: a live-room mentality creeps back in through full-roster readiness requirements. Mitigation: scope readiness to the targeted required role slots for each sync gate.
- Risk: incomplete sync-gate work corrupts resume behavior. Mitigation: treat only the last committed shared revision as authoritative runtime input.
- Risk: transport debates block implementation progress. Mitigation: define notification behavior and event metadata without making provider choice part of the feature contract.

## Open Questions

- None. Provider choice for notification delivery remains an implementation detail until a later infrastructure decision is necessary.
