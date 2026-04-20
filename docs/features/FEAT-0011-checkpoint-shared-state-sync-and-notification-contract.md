| Field                         | Value |
| ----------------------------- | ----- |
| **Status**                    | Not Started |
| **Parent Epic**               | [EPIC-0004-session-lifecycle-persistence-and-multiplayer-state](../epics/EPIC-0004-session-lifecycle-persistence-and-multiplayer-state.md) |
| **Related Feature PRDs**      | [FEAT-0009-session-records-membership-and-pinned-resume-contract](../features/FEAT-0009-session-records-membership-and-pinned-resume-contract.md)<br>[FEAT-0010-session-lifecycle-rejoin-and-completion-contract](../features/FEAT-0010-session-lifecycle-rejoin-and-completion-contract.md)<br>[FEAT-0012-session-package-upgrade-and-compatibility-contract](../features/FEAT-0012-session-package-upgrade-and-compatibility-contract.md) |
| **Related ADRs**              | [ADR-0002-headless-engine-runtime-boundary](../adrs/ADR-0002-headless-engine-runtime-boundary.md) |
| **Related Architecture Docs** | [hexagonal-feature-slice-architecture](../architecture/hexagonal-feature-slice-architecture.md) |

# FEAT-0011 - Checkpoint Shared-State Sync and Notification Contract

## Goal

Define the adapter-owned checkpoint coordination contract that accepts shared-state mutations, advances shared revisions, and notifies session members about multiplayer readiness and accepted updates without moving gameplay authority out of the engine.

## Background and Context

`FEAT-0009` defines the durable record families for player and shared state, and `FEAT-0010` defines the lifecycle service that loads and completes memberships around those records. EPIC-0004 still needs the rules that decide when a shared mutation becomes durable session truth and how members coordinate at multiplayer checkpoints.

The product strategy is local-first and selective-sync. Players may progress independently for player-local state, but shared-state touches and explicit multiplayer checkpoints need coordinated acceptance so all members resume from the same durable shared truth.

Single-player stories still use the same session model. In that case, checkpoint rules must degrade cleanly to one-member behavior rather than forcing unnecessary multiplayer coordination machinery.

## Scope

### In scope

- Define what counts as an explicit checkpoint for MVP session coordination.
- Define the API-coordinated shared-state proposal, readiness, accept, reject, and commit contracts.
- Define shared revision advancement rules for accepted checkpoint work.
- Define how incomplete checkpoint work affects resume behavior.
- Define abstract notification/event requirements for session updates and checkpoint readiness changes.
- Define typed failures for stale revisions, incomplete readiness, rejected commits, and incomplete-checkpoint resume.

### Out of scope

- New engine block types, traversal semantics, or block execution rules.
- Brand-new late join or membership creation after session start.
- Package upgrade policy or migration behavior.
- Transport-specific commitments such as Supabase Realtime channels, websocket protocols, or polling intervals.
- Offline outbox replay or generalized retry mechanics beyond the checkpoint contract.

## Requirements

1. The feature must define `checkpoint` as an adapter-owned coordination unit, not as a second gameplay authority inside the engine.
2. Only explicit checkpoint-required actions may trigger shared-state coordination. Player-local actions remain outside checkpoint coordination until a checkpoint boundary is reached.
3. Every shared-state proposal must include the proposer membership, the target session and checkpoint identity, the base shared revision, and the proposed shared mutation payload.
4. The API coordinator is the only authority that accepts or rejects a shared-state proposal for MVP.
5. Required checkpoint participants are all active memberships in the session for MVP. Partial-subset checkpoint participation is out of scope.
6. A checkpoint commit may only succeed when every active membership has durably reported readiness against the same base shared revision and proposal identity.
7. Accepting a checkpoint commit must persist the next shared-state snapshot, increment the monotonic shared revision, and update each participating player's accepted shared revision pointer.
8. Resume behavior must expose only the last committed shared state as authoritative session truth. Uncommitted checkpoint work may be surfaced as checkpoint status metadata, but it must not be replayed as accepted shared session state.
9. Notification requirements must be explicit at the contract level, but the feature must not require a specific realtime transport or provider.
10. Shared-state coordination failures must surface through typed adapter errors and explicit checkpoint statuses.
11. A single-member session must short-circuit checkpoint readiness: when only one active membership exists, that membership alone can satisfy readiness and commit preconditions.

## Locked Contracts

### Checkpoint Boundary

- A checkpoint is an adapter-owned coordination moment identified by `sessionId` plus `checkpointId`.
- A checkpoint starts when a checkpoint-required action proposes a shared-state mutation or group progression boundary that must be accepted by the API coordinator.
- Checkpoints do not redefine engine commands. The engine still computes player-local and shared state transitions; the checkpoint layer decides when a shared result becomes durable session truth.

### Checkpoint State Machine

- `CheckpointStatus = 'collecting' | 'ready' | 'committed' | 'rejected' | 'expired'`
- New checkpoints enter `collecting`.
- A checkpoint transitions to `ready` when every active membership has reported readiness for the same proposal and base shared revision.
- The coordinator transitions `ready -> committed` when the shared mutation is durably persisted.
- The coordinator transitions `collecting | ready -> rejected` when the proposal is explicitly denied or superseded.
- The coordinator may transition `collecting | ready -> expired` when the proposal can no longer be resumed safely and members must reload from the last committed shared revision.
- For a one-member session, the sole active membership can satisfy the readiness condition immediately once it accepts the current proposal and revision.

### Shared-State Proposal Contract

- `SharedStateProposal` contains `sessionId`, `checkpointId`, `proposedByMembershipId`, `baseSharedRevision`, `proposalId`, and the candidate shared-state mutation payload.
- Proposal acceptance is evaluated against the current `SessionSharedStateRecord` revision and active membership set.
- Only one proposal may be authoritative for a given `checkpointId` at a time.

### Membership Readiness Contract

- `CheckpointMembershipReadiness` contains `sessionId`, `checkpointId`, `membershipId`, `proposalId`, `baseSharedRevision`, and `readiness = 'waiting' | 'ready' | 'blocked'`.
- Readiness is durable checkpoint metadata owned by adapters, not an engine field.
- A readiness update against a stale proposal or stale shared revision is rejected explicitly.

### Notification Contract

- `SessionNotificationEvent` is the adapter-owned event envelope for lifecycle and checkpoint updates.
- Required event types for MVP are `session.checkpoint_opened`, `session.checkpoint_member_ready`, `session.checkpoint_committed`, `session.checkpoint_rejected`, and `session.shared_state_updated`.
- Events must contain enough metadata for members to refresh from durable state, but the contract does not prescribe transport, channel topology, or provider-specific payload shape.

### Typed Checkpoint Errors

- `checkpoint_not_found`
- `checkpoint_revision_stale`
- `checkpoint_membership_not_ready`
- `checkpoint_proposal_rejected`
- `checkpoint_commit_conflict`
- `checkpoint_resume_incomplete`

## Architecture and Technical Notes

- API/db adapters own proposal acceptance, revision advancement, and notification fanout. The engine remains responsible only for gameplay state computation.
- Shared state remains adapter-owned durable truth. Members may compute candidate shared changes locally, but only committed shared revisions become authoritative session state.
- Resume logic must be able to distinguish last committed shared state from incomplete checkpoint metadata so members do not hydrate unaccepted shared mutations.
- Realtime matters here as behavior, not infrastructure. The feature requires timely checkpoint and shared-state notifications, but provider choice stays implementation-specific.

## Acceptance Criteria

- [ ] The feature defines explicit checkpoint-required coordination separately from player-local progression.
- [ ] The shared-state proposal, readiness, commit, and rejection contracts are explicit and API-coordinated.
- [ ] Shared revision advancement is explicit enough that accepted checkpoint work becomes durable shared truth.
- [ ] Resume semantics for incomplete checkpoints are explicit and fail closed around last committed shared state.
- [ ] Single-player sessions can satisfy checkpoint readiness and shared-state commit rules without requiring multi-member coordination.
- [ ] Notification requirements are explicit without binding the feature to a specific transport or provider.
- [ ] Typed checkpoint failures are explicit enough for implementation without reopening sync authority rules.

## Test Plan

- Add contract tests proving an explicit checkpoint waits for readiness from every active membership before a shared-state commit succeeds.
- Add checkpoint tests proving a one-member session can satisfy readiness and commit shared-state updates without extra coordination steps.
- Add shared revision tests proving an accepted checkpoint increments the shared revision and updates participating player revision pointers.
- Add failure tests for stale shared revision, missing readiness, rejected proposals, and commit conflicts.
- Add resume tests proving incomplete checkpoint work is surfaced as checkpoint metadata while the last committed shared state remains authoritative.
- Add notification contract tests proving checkpoint and shared-state updates emit the required session event types.

## Rollout and Observability

- Land checkpoint coordination after `FEAT-0010` lifecycle contracts so readiness and completion rules can reuse established membership and session status boundaries.
- Record proposal, readiness, commit, rejection, and expiration events with typed metadata so API/mobile adapters can diagnose sync failures without inferring state from raw tables.
- Keep notification delivery abstract in docs and implementation scaffolding until a concrete provider is required by the runtime host.

## Risks and Mitigations

- Risk: shared-state authority drifts into clients or route-local heuristics. Mitigation: lock proposal acceptance and commit authority to the API coordinator.
- Risk: checkpoint coordination starts inventing new gameplay semantics. Mitigation: keep checkpoint rules adapter-owned and engine-neutral.
- Risk: incomplete checkpoint work corrupts resume behavior. Mitigation: treat only the last committed shared revision as authoritative runtime input.
- Risk: transport debates block implementation progress. Mitigation: define notification behavior and event metadata without making provider choice part of the feature contract.

## Open Questions

- None. Provider choice for notification delivery remains an implementation detail until a later infrastructure decision is necessary.
