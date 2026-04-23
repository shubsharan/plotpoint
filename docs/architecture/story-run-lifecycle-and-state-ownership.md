| Field           | Value        |
| --------------- | ------------ |
| **Source**      | Internal     |
| **Type**        | Architecture |
| **Domains**     | API, Data Model, Runtime Orchestration, Mobile |
| **Last synced** | 2026-04-22   |

# Story Run Lifecycle And State Ownership

## Decision Summary

This document defines the durable adapter-side rules for hosting co-op play around the completed engine runtime surface.

- `StoryRun` is the adapter-owned aggregate for real play.
- `StoryRun` moves through `lobby -> active -> completed` under one aggregate root.
- Engine `SessionState` remains one player's gameplay execution contract inside that broader run.
- Role slots, participant bindings, role progress, and shared state are distinct concerns and must stay distinct in code and storage.
- Runs pin `storyPackageVersionId` at start and resume fail closed against that pin unless a later explicit upgrade flow succeeds.
- Post-start access is role-binding based, not room-presence based.

This doc is about ownership rules and implementation patterns. Feature PRDs remain the place for exact acceptance criteria and sequencing.

## Aggregate Boundary

`StoryRun` is broader than engine `SessionState`.

`StoryRun` owns:

- pre-start coordination in `lobby`
- run admin ownership
- role-slot availability and lifecycle
- participant invites and bindings
- shared-state durability and revision history
- resume assembly around the pinned published package version

Engine `SessionState` owns:

- one player's current runtime position
- one player's sparse role-scoped block state
- the shared block-state snapshot passed into the engine for computation
- the derived `RuntimeFrame` returned by engine commands

The run layer hosts gameplay. It does not replace it.

## Ownership Rules

### One aggregate, three phases

Use one aggregate:

- `lobby` for pre-start coordination
- `active` for real play
- `completed` for durably finished runs

Do not model lobby as a separate root such as `Room`, `Party`, or `PreRun`. That split makes resume, replacement, and completion harder because the durable identity changes at start.

### Role slots are not participants

Role slots represent the story-defined positions that must exist for a run.

Participants represent people who may be invited, bound, replaced, or promoted to admin.

Keep these separate because:

- slots survive participant replacement
- completion belongs to role progress, not to whichever participant currently occupies the slot
- authorization and admin transfer depend on run membership, not on mutating gameplay state

### Participant bindings are not role progress

Bindings answer "who currently occupies this slot?"

Role progress answers "what progress has this slot made in the story?"

If one participant replaces another after start:

- binding history changes
- role progress stays with the slot

Replacement is not a new slot, not a new run, and not a reason to discard role progress.

### Shared state is not role state

Shared state is adapter-owned durable truth for world state that affects multiple roles.

Role state is sparse progress for one role slot.

Persist and reason about them separately so later sync-gate and resume logic can:

- advance shared revisions explicitly
- preserve role-local offline progress
- hydrate the engine from the last accepted shared state rather than from speculative in-flight coordination data

## Canonical Flow

### 1. Create run

Creation establishes the aggregate and its slots, but not runtime state.

- create the `StoryRun`
- create the canonical role slots for the published story roles
- assign the current admin
- keep the run in `lobby`

For solo stories, the same model applies. There is still one run, one slot, one binding path, and an explicit transition to `active`.

### 2. Coordinate in lobby

Lobby is mutable setup.

- invite participants to specific role slots
- bind or rebind current occupants
- transfer admin if allowed by lifecycle rules
- do not create runtime role/shared state yet

Pre-start reassignment is setup correction, not replacement history. Use current ownership, not append-only occupant history, while the run is still in `lobby`.

### 3. Start run

`startRun` is the boundary where runtime durability begins.

At start:

- verify required slots are actively bound
- pin `storyPackageVersionId`
- create the first durable shared-state record
- create one durable role-state record per finalized binding
- transition the aggregate from `lobby` to `active`

This is the first point where runtime durability exists. Before this, the system is coordinating people, not resuming gameplay.

### 4. Resume and play

Resume is an assembly step around durable truth.

Adapters:

- load the run
- load the active binding for the caller
- load the role-state record for the bound slot
- load the last accepted shared-state record
- assemble engine `SessionState`
- call engine `loadSession`

The engine receives execution input. It does not discover or coordinate run membership on its own.

### 5. Replace or complete

After start, occupant changes become durable history.

- replacing a participant appends binding history and preserves role progress
- completing a role updates role-slot completion state
- completing the run is a run-level transition, not a side effect of transport disconnects or presence changes

## Pinned Version Rule

Runs pin `storyPackageVersionId` at `startRun`.

This rule exists so resume has a stable interpretation of:

- role-slot structure
- current nodes
- block state semantics
- shared-state meaning

Resume must fail closed if the pinned version cannot be resumed safely. A newly published package does not silently redefine an active run.

The only valid escape hatch is a later explicit upgrade flow that:

- authorizes the request
- verifies compatibility
- migrates durable state explicitly
- preserves the old pin on failure

## Edge Cases

### Solo play

Solo play uses the same run model.

- one run
- one slot
- one binding
- same pinning and resume rules
- same start boundary

Do not branch into a separate "single-player session" model just because coordination is trivial.

### Accepted invite but no current binding

An accepted invite is not enough to start or resume. Current binding is the authority for slot occupancy.

### Pre-start reassignment

Before start, reassignment is mutable setup. Replace the current binding instead of creating post-start replacement history.

### Post-start replacement

After start, replacement is append-only history on bindings while role progress remains attached to the slot.

### Incomplete shared coordination

When coordination is incomplete, the last committed shared revision remains authoritative for resume. Do not hydrate speculative shared mutations as durable run truth.

## Do / Do Not

Do:

- treat `StoryRun` as the adapter-owned aggregate around engine gameplay
- create role/shared runtime records only at `startRun`
- map `runId` to engine `sessionId` only at assembly boundaries
- keep participant identity separate from role progress
- preserve role progress across participant replacement
- treat solo play as the same model with one membership

Do not:

- model lobby as a separate aggregate
- persist hydrated runtime snapshots as the durable source of truth
- couple participant identity to role-state ownership
- treat presence, socket connection, or route session as slot ownership
- silently upgrade the pinned package version during resume

## Implementation Pattern

Use adapter services that operate on the run aggregate and assemble engine input only at the seam:

```ts
const run = await loadRunOrThrow(runId);
const binding = await loadActiveBindingOrThrow(runId, participantId);
const roleState = await loadRoleStateOrThrow(runId, binding.roleId);
const sharedState = await loadCommittedSharedStateOrThrow(runId);

const state = assembleSessionState({
  run,
  binding,
  roleState,
  sharedState,
});

return engine.loadSession({ state });
```

The service owns run truth. The engine owns gameplay execution after assembly.

## When A Change Requires An ADR

Create or update an ADR when a proposal changes any of these:

- whether `StoryRun` remains the single aggregate root for co-op play
- the meaning of `lobby`, `active`, or `completed`
- the rule that role progress survives participant replacement
- the durable split between role state and shared state
- the pin-by-default resume policy
- whether resume may derive from anything other than the last accepted durable state

Ordinary lifecycle handlers, query shapes, or notification-provider details do not need ADRs unless they force one of those boundary changes.

## Related Docs

- `hexagonal-feature-slice-architecture.md` defines the broader engine-versus-adapter ownership rules.
- `FEAT-0009` through `FEAT-0012` define the staged EPIC-0004 contracts that implement this architecture.
- `ADR-0002` remains the durable record for the headless engine runtime boundary.
