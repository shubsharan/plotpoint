| Field           | Value       |
| --------------- | ----------- |
| **Type**        | PRD         |
| **Feature ID**  | FEAT-0006   |
| **Status**      | In Progress |
| **Epic**        | EPIC-0003   |
| **Domains**     | Engine      |
| **Last synced** | 2026-03-30  |

# FEAT-0006 - Runtime State Model and Engine Public Surface

## Goal

Define the engine-owned runtime snapshot model and narrow public API that turn published story packages into executable gameplay sessions for both mobile-local and API-hosted runtime adapters.

## Background and Context

EPIC-0003 starts by locking the engine surface that every later runtime consumer depends on. FEAT-0005 now guarantees that `StoryPackageRepo.getPublishedPackage(storyId)` returns published story package data, so the next step is to define how the engine loads that story package, represents runtime progress, and exposes a small set of deterministic entrypoints for session startup and action execution.

The architecture already sketches the target shape: `createEngine` owns public runtime methods, runtime execution stays inside `packages/engine`, and the engine must remain host-agnostic so both mobile and API adapters can depend on the same gameplay authority. This feature turns those implied examples into an explicit engine contract and deliberately stops short of durable save orchestration, sync timing, or multiplayer authority policy.

## Scope

### In scope

- Define the canonical `RuntimeSnapshot` contract the engine operates on, including runtime identity, player-scoped state, shared game-scoped state, and derived progression data.
- Define the minimal engine port surface required in this feature to load published story packages and read external runtime context.
- Define the public `createEngine` API and its first-class runtime entrypoints for starting a game, loading runtime state, and submitting actions.
- Define the engine-owned result shape returned by runtime entrypoints so later API routes and mobile clients can consume one execution contract.
- Define the runtime lifecycle responsibilities that belong to the engine versus those deferred to later session, persistence, and multiplayer features.

### Out of scope

- Block-specific reducer behavior and registry composition beyond the interfaces this feature must expose.
- Condition evaluation and graph traversal semantics beyond reserving the progression fields that FEAT-0008 will populate.
- Durable runtime persistence repos, db schema, save ids, checkpoint policy, or retry orchestration.
- API request/response DTOs, mobile renderer behavior, or transport serialization details.
- Multiplayer sync policy, realtime checkpoint handling, or shared-state authority rules.

## Requirements

1. The engine must expose a single public construction surface, `createEngine`, that accepts abstract runtime ports rather than concrete adapter implementations.
2. `createEngine` must accept only the dependencies needed in this feature: published story package loading plus narrow runtime-context ports such as a clock and optional location reader.
3. The public engine API must define narrow runtime-first entrypoints: `startGame`, `loadRuntime`, and `submitAction`.
4. Every public runtime entrypoint must return the same engine-owned `RuntimeSnapshot` family rather than a persistence-shaped save record.
5. `RuntimeSnapshot` must distinguish player-scoped progress from shared game-scoped progress without pushing storage or transport details into engine-owned types.
6. `roleId` must be required at runtime startup and preserved in the player-scoped runtime identity contract.
7. Engine-owned runtime result shapes must be deterministic and rich enough for later API/mobile surfaces to render updated block state and available next-step information without reimplementing gameplay logic.
8. Runtime state and public engine APIs must be documented as engine contracts, not API DTOs, and remain framework-free.
9. FEAT-0006 must define the outer runtime result envelope, while FEAT-0008 later defines the traversal semantics that populate progression fields such as `availableEdges`.
10. This feature must define which lifecycle responsibilities remain inside the engine and which are explicitly deferred to later session persistence and multiplayer features.

## Architecture and Technical Notes

- Primary reference: `docs/architecture/hexagonal-feature-slice-architecture.md`
- The runtime surface should stay centered in `packages/engine`, with `createEngine` exporting engine-owned entrypoints and ports living in the engine package.
- `StoryPackageRepo.getPublishedPackage(storyId)` is the published story package ingress from EPIC-0002; FEAT-0006 defines how the runtime surface consumes that story package, not how publishing works.
- User-scoped and game-scoped state are engine concepts in this feature. Their durable persistence, hydration, and synchronization behavior remain later adapter concerns in EPIC-0004.
- The engine is host-agnostic in this feature. Mobile-local play and API-hosted execution both depend on the same `createEngine` surface rather than separate gameplay contracts.
- Success payloads from engine entrypoints should describe runtime outcomes such as updated state views and reserved next-step data, while route-local request/response DTOs remain adapter-owned in later work.
- The public surface for this feature is intentionally runtime-shaped rather than save-shaped:

```typescript
type RuntimeSnapshot = {
  storyId: string;
  gameId: string;
  playerId: string;
  roleId: string;
  currentNodeId: string;
  playerState: {
    blockStates: Record<string, unknown>;
  };
  sharedState: {
    blockStates: Record<string, unknown>;
  };
  availableEdges: Array<{
    edgeId: string;
    label?: string | undefined;
    targetNodeId: string;
  }>;
};

type EnginePorts = {
  storyPackageRepo: StoryPackageRepo;
  clock?: {
    now: () => Date;
  };
  locationReader?: {
    getCurrent: (playerId: string) => Promise<{ lat: number; lng: number } | null>;
  };
};

type Engine = {
  startGame: (input: {
    storyId: string;
    gameId: string;
    playerId: string;
    roleId: string;
  }) => Promise<RuntimeSnapshot>;
  loadRuntime: (input: {
    snapshot: RuntimeSnapshot;
  }) => Promise<RuntimeSnapshot>;
  submitAction: (input: {
    runtime: RuntimeSnapshot;
    blockId: string;
    action: unknown;
  }) => Promise<RuntimeSnapshot>;
};
```

- `loadRuntime` rehydrates an adapter-supplied runtime snapshot into the engine surface for continued execution; it does not imply engine-owned durable storage in this feature.
- No new ADR is required unless the current engine-port boundary proves insufficient for headless runtime orchestration.

## Acceptance Criteria

- The runtime state model is defined clearly enough that later block, traversal, session, and mobile work can build on it without reopening core state-shape questions.
- `createEngine` and its initial runtime entrypoints are defined as the single public execution surface for gameplay logic.
- Engine ports describe published story package access plus narrow context dependencies without leaking adapter-specific concerns into the engine.
- The feature establishes a deterministic engine-owned `RuntimeSnapshot` result shape for runtime operations.
- `roleId` is part of runtime startup and runtime state, not an adapter-only concern.
- The feature explicitly defers durable persistence policy, session lifecycle orchestration, and multiplayer sync semantics to later work.

## Test Plan

- Add unit tests that exercise `createEngine` surface construction with stubbed story package and context ports.
- Add contract-oriented tests that prove `startGame`, `loadRuntime`, and `submitAction` all return the same `RuntimeSnapshot` shape.
- Add focused engine tests for start/load/action entrypoint behavior using published story package fixtures and in-memory adapters suitable for mobile-local execution.
- Add tests that prove `roleId` is required at startup and preserved across runtime transitions.
- Add tests that prove progression output fields are engine-owned contract fields even before FEAT-0008 finalizes traversal behavior.
- Manually verify the documented public API remains consistent with the architecture examples for `createEngine`, `startGame`, `loadRuntime`, and `submitAction`.

## Rollout and Observability

- Internal engine-only rollout; later API routes and mobile features adopt this surface rather than inventing parallel gameplay contracts.
- Surface runtime errors explicitly through the engine API so adapters can log or serialize them later without guessing intent.
- Success is measured by downstream runtime features being able to build against one stable engine-owned public surface.

## Risks and Mitigations

- Risk: the engine API grows into an adapter-shaped surface. Mitigation: keep entrypoints and result types engine-centric and leave HTTP/mobile concerns to later layers.
- Risk: runtime state contracts blur with storage schemas. Mitigation: define runtime types as engine semantics first and let later persistence adapters map them in EPIC-0004.
- Risk: lifecycle responsibilities remain ambiguous between engine and session features. Mitigation: document exact ownership boundaries in this feature and defer orchestration policy to EPIC-0004.
- Risk: FEAT-0008 widens the engine surface opportunistically. Mitigation: reserve the progression fields and minimal context ports now so later traversal work fills the contract rather than replacing it.

## Open Questions

- Resolved: the engine is host-agnostic and may run directly in mobile for offline play or inside the API for hosted execution.
- Resolved: `roleId` is part of runtime startup and runtime identity in this feature rather than a later adapter-only field.
- Resolved: FEAT-0006 owns the outer `RuntimeSnapshot` contract, while FEAT-0008 later defines how traversal populates progression fields such as `availableEdges`.
- Resolved: durable save repos, sync timing, and multiplayer authority policy remain deferred to EPIC-0004.
