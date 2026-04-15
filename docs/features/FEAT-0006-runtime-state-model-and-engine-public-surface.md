
| Field           | Value      |
| --------------- | ---------- |
| **Type**        | PRD        |
| **Feature ID**  | FEAT-0006  |
| **Status**      | Completed  |
| **Epic**        | EPIC-0003  |
| **Domains**     | Engine     |
| **Last synced** | 2026-04-15 |


# FEAT-0006 - Runtime State Model and Engine Public Surface

## Goal

Define the engine-owned runtime snapshot model and narrow public API that turn published story packages into executable gameplay sessions for both mobile-local and API-hosted runtime adapters.

## Background and Context

EPIC-0003 starts by locking the engine surface that every later runtime consumer depends on. FEAT-0005 now guarantees immutable published story package versions plus a current pointer, so the next step is to define how the engine pins runtime state to a package version, loads that package, and exposes deterministic entrypoints for session startup and action execution.

The architecture already sketches the target shape: `createEngine` owns public runtime methods, runtime execution stays inside `packages/engine`, and the engine must remain host-agnostic so both mobile and API adapters can depend on the same gameplay authority. This feature turns those implied examples into an explicit engine contract and deliberately stops short of durable save orchestration, sync timing, or multiplayer authority policy.

## Related Docs

### Parent Epic

- [EPIC-0003-headless-runtime-engine-and-condition-system](../epics/EPIC-0003-headless-runtime-engine-and-condition-system.md)

### Related Feature PRDs

- [FEAT-0005-story-publish-pipeline-and-published-catalog-availability](../features/FEAT-0005-story-publish-pipeline-and-published-catalog-availability.md)
- [FEAT-0007-block-registry-and-action-executor](../features/FEAT-0007-block-registry-and-action-executor.md)
- [FEAT-0008-condition-registry-and-graph-traversal-semantics](../features/FEAT-0008-condition-registry-and-graph-traversal-semantics.md)

### Related ADRs

- [ADR-0002-headless-engine-runtime-boundary](../adrs/ADR-0002-headless-engine-runtime-boundary.md)

### Related Architecture Docs

- [hexagonal-feature-slice-architecture](../architecture/hexagonal-feature-slice-architecture.md)

## Scope

### In scope

- Define the canonical runtime contracts the engine operates on: `SessionState` for resumable engine-owned state and `RuntimeFrame` for engine-computed result views that add derived progression data.
- Define the minimal engine port surface required in this feature to load published story packages and read external runtime context.
- Define the public `createEngine` API and its first-class runtime entrypoints for starting a game, loading runtime state, and submitting actions.
- Define the engine-owned result shape returned by runtime entrypoints so later API routes and mobile clients can consume one execution contract.
- Define the runtime lifecycle responsibilities that belong to the engine versus those deferred to later session, persistence, and multiplayer features.

### Out of scope

- Block-specific reducer behavior and registry composition beyond the interfaces this feature must expose.
- Condition evaluation and graph traversal semantics beyond reserving the progression field shapes that FEAT-0008 owns for population.
- Durable runtime persistence repos, db schema, save ids, checkpoint policy, or retry orchestration.
- API request/response DTOs, mobile renderer behavior, or transport serialization details.
- Multiplayer sync policy, realtime checkpoint handling, or shared-state authority rules.

## Requirements

1. The engine must expose a single public construction surface, `createEngine`, that accepts abstract runtime ports rather than concrete adapter implementations.
2. `createEngine` must accept only the dependencies needed in this feature: published story package loading plus narrow runtime-context ports such as a clock and optional location reader.
3. The public engine API must define narrow runtime-first entrypoints: `startSession`, `loadSession`, `submitAction`, and `traverse`.
4. Every public runtime entrypoint must return the same engine-owned `RuntimeFrame` family rather than a persistence-shaped save record.
5. `SessionState` must distinguish player-scoped progress from shared session-scoped progress without pushing storage or transport details into engine-owned types, while `RuntimeView` is the hydrated read projection and `RuntimeFrame` wraps both as `{ state, view }`.
6. `roleId` must be required at runtime startup and preserved in the player-scoped runtime identity contract.
7. Engine-owned runtime result shapes must be deterministic and rich enough for later API/mobile surfaces to render updated current-node block state and available next-step information without reimplementing gameplay logic.
8. Runtime state and public engine APIs must be documented as engine contracts, not API DTOs, and remain framework-free.
9. FEAT-0006 must define the outer runtime result envelope, while FEAT-0008 defines the traversal semantics that populate progression fields such as `traversableEdges`.
10. This feature must define which lifecycle responsibilities remain inside the engine and which are explicitly deferred to later session persistence and multiplayer features.

## Architecture and Technical Notes

- Primary reference: `docs/architecture/hexagonal-feature-slice-architecture.md`
- Durable decision record: [ADR-0002-headless-engine-runtime-boundary](../adrs/ADR-0002-headless-engine-runtime-boundary.md)
- The runtime surface should stay centered in `packages/engine`, with `createEngine` exporting engine-owned entrypoints and ports living in the engine package.
- `StoryPackageRepo.getCurrentPublishedPackage(storyId)` and `getPublishedPackage(storyId, storyPackageVersionId)` are the published story package ingress from EPIC-0002; FEAT-0006 defines how the runtime surface consumes that data, not how publishing works.
- Player-scoped and shared session-scoped state are engine concepts in this feature. Their durable persistence, hydration, and synchronization behavior remain later adapter concerns in EPIC-0004.
- The engine is host-agnostic in this feature. Mobile-local play and API-hosted execution both depend on the same `createEngine` surface rather than separate gameplay contracts.
- Success payloads from engine entrypoints should describe runtime outcomes such as updated state views and reserved next-step data, while route-local request/response DTOs remain adapter-owned in later work.
- Later session persistence work reconstructs one player's `SessionState` from adapter-owned session records rather than storing hydrated `RuntimeFrame` payloads or transport DTOs as the primary durable shape.
- The public surface for this feature is intentionally runtime-shaped rather than save-shaped, with a deliberate split between sparse resumable state and engine-derived result fields:

```typescript
type SessionState = {
  storyId: string;
  storyPackageVersionId: string;
  sessionId: string;
  playerId: string;
  roleId: string;
  currentNodeId: string;
  playerState: {
    blockStates: Record<string, unknown>;
  };
  sharedState: {
    blockStates: Record<string, unknown>;
  };
};

type RuntimeView = {
  currentNode: {
    id: string;
    title: string;
    blocks: Array<{
      id: string;
      type: string;
      interactive: boolean;
      config: Record<string, StoryPackageJsonValue>;
      state: unknown;
    }>;
  };
  traversableEdges: Array<{
    edgeId: string;
    label?: string | undefined;
    targetNodeId: string;
  }>;
};

type RuntimeFrame = {
  state: SessionState;
  view: RuntimeView;
};

type EnginePorts = {
  storyPackageRepo: {
    getCurrentPublishedPackage: (storyId: string) => Promise<{
      storyPackage: StoryPackage;
      storyPackageVersionId: string;
    }>;
    getPublishedPackage: (
      storyId: string,
      storyPackageVersionId: string,
    ) => Promise<StoryPackage>;
  };
  clock?: {
    now: () => Date;
  };
  locationReader?: {
    getCurrent: (playerId: string) => Promise<{ lat: number; lng: number } | null>;
  };
};

type Engine = {
  startSession: (input: {
    storyId: string;
    sessionId: string;
    playerId: string;
    roleId: string;
  }) => Promise<RuntimeFrame>;
  loadSession: (input: {
    state: SessionState;
  }) => Promise<RuntimeFrame>;
  submitAction: (input: {
    state: SessionState;
    blockId: string;
    action: unknown;
  }) => Promise<RuntimeFrame>;
  traverse: (input: {
    state: SessionState;
    edgeId: string;
  }) => Promise<RuntimeFrame>;
};
```

- Persisted `SessionState` stays sparse: missing block-state entries mean "use the block definition's deterministic `initialState(config)`" rather than "this state must be materialized before use."
- `loadSession` rehydrates adapter-supplied sparse `SessionState` into the engine surface for continued execution and returns a fresh `RuntimeFrame` with a hydrated `view.currentNode`; it does not imply engine-owned durable storage in this feature.
- The headless runtime boundary, public engine surface, and sparse-state-versus-derived-view split are captured durably in [ADR-0002-headless-engine-runtime-boundary](../adrs/ADR-0002-headless-engine-runtime-boundary.md).

## Acceptance Criteria

- The runtime state model is defined clearly enough that later block, traversal, session, and mobile work can build on it without reopening core state-shape questions.
- `createEngine` and its initial runtime entrypoints are defined as the single public execution surface for gameplay logic.
- Engine ports describe published story package access plus narrow context dependencies without leaking adapter-specific concerns into the engine.
- The feature establishes a deterministic engine-owned `RuntimeFrame` result shape for runtime operations while keeping resumable `SessionState` sparse, free of derived progression fields, and pinned to `storyPackageVersionId`.
- `roleId` is part of runtime startup and runtime state, not an adapter-only concern.
- The feature explicitly defers durable persistence policy, session lifecycle orchestration, and multiplayer sync semantics to later work.

## Test Plan

- Add unit tests that exercise `createEngine` surface construction with stubbed story package and context ports.
- Add contract-oriented tests that prove `startSession`, `loadSession`, `submitAction`, and `traverse` all return the same `RuntimeFrame` shape while runtime commands accept minimal `SessionState` input.
- Add focused engine tests for start/load/action entrypoint behavior using published story package fixtures and in-memory adapters suitable for mobile-local execution.
- Add tests that prove `roleId` is required at startup and preserved across runtime transitions.
- Add tests that prove progression output fields are engine-owned contract fields consistent with FEAT-0008 traversal behavior.
- Manually verify the documented public API remains consistent with the architecture examples for `createEngine`, `startSession`, `loadSession`, `submitAction`, and `traverse`.

## Rollout and Observability

- Internal engine-only rollout; later API routes and mobile features adopt this surface rather than inventing parallel gameplay contracts.
- Surface runtime errors explicitly through the engine API so adapters can log or serialize them later without guessing intent.
- Success is measured by downstream runtime features being able to build against one stable engine-owned public surface.

## Risks and Mitigations

- Risk: the engine API grows into an adapter-shaped surface. Mitigation: keep entrypoints and result types engine-centric and leave HTTP/mobile concerns to later layers.
- Risk: runtime state contracts blur with storage schemas. Mitigation: keep `SessionState` as sparse progression facts and let `RuntimeFrame.view.currentNode` carry the hydrated read model adapters need.
- Risk: lifecycle responsibilities remain ambiguous between engine and session features. Mitigation: document exact ownership boundaries in this feature and defer orchestration policy to EPIC-0004.
- Risk: follow-on traversal work widens the engine surface opportunistically. Mitigation: reserve the progression fields and minimal context ports so traversal fills the contract rather than replacing it (delivered for authored edges in FEAT-0008).

## Open Questions

- Resolved: the engine is host-agnostic and may run directly in mobile for offline play or inside the API for hosted execution.
- Resolved: `roleId` is part of runtime startup and runtime identity in this feature rather than a later adapter-only field.
- Resolved: FEAT-0006 owns both the resumable `SessionState` boundary and the outer `RuntimeFrame` result contract, while FEAT-0008 defines how traversal populates progression fields such as `traversableEdges`.
- Resolved: runtime state is pinned to a published package version via `storyPackageVersionId`; explicit mid-session upgrades remain a separate session orchestration action.
- Deferred follow-up [DF-0001]: define session upgrade policy for pinned published package versions. Default policy is pin at session start, allow explicit session/API-triggered upgrades, and reject upgrades when runtime compatibility checks fail so the session remains on its prior version. | Owner: EPIC-0003 | Trigger: Session orchestration scope is activated for runtime persistence/resume work. | Exit criteria: A merged feature implementation and docs update define explicit upgrade flow, compatibility failure behavior, and persistence semantics.
