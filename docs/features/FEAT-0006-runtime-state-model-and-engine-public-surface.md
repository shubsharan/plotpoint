| Field           | Value       |
| --------------- | ----------- |
| **Type**        | PRD         |
| **Feature ID**  | FEAT-0006   |
| **Status**      | Not Started |
| **Epic**        | EPIC-0003   |
| **Domains**     | Engine      |
| **Last synced** | 2026-03-30  |

# FEAT-0006 - Runtime State Model and Engine Public Surface

## Goal

Define the engine-owned runtime state model and narrow public API that turn published story bundles into executable gameplay sessions for later API and mobile adapters.

## Background and Context

EPIC-0003 starts by locking the engine surface that every later runtime consumer depends on. FEAT-0005 now guarantees that `StoryRepo.getBundle(storyId)` returns published bundle data, so the next step is to define how the engine loads that bundle, represents runtime progress, and exposes a small set of deterministic entrypoints for session startup and action execution.

The architecture already sketches the target shape: `createEngine` owns public runtime methods, the engine depends on abstract ports instead of concrete db or API code, and runtime execution must stay inside `packages/engine`. This feature is where those contracts stop being implied architecture examples and become the explicit PRD for the engine-facing surface.

## Scope

### In scope

- Define the runtime state types the engine operates on, including per-player progress state and shared game state as engine contracts.
- Define the engine port surface required to load published bundles and read/write runtime state through adapters.
- Define the public `createEngine` API and its first-class runtime entrypoints for starting a game, loading state, and submitting actions.
- Define the result shape returned by runtime entrypoints so later API routes and mobile clients can consume one engine-owned execution contract.
- Define the runtime lifecycle responsibilities that belong to the engine versus those deferred to later session and persistence features.

### Out of scope

- Block-specific reducer behavior and registry composition beyond the interfaces this feature must expose.
- Condition evaluation and graph traversal semantics beyond the runtime hooks that will call into them.
- Concrete db schema, persistence orchestration, or API request/response DTOs.
- Mobile renderer behavior, multiplayer sync policy, or realtime checkpoint handling.

## Requirements

1. The engine must expose a single public construction surface, `createEngine`, that accepts abstract runtime ports rather than concrete adapter implementations.
2. The public engine API must define narrow entrypoints for starting runtime state from a published story, loading existing runtime state, and submitting actions against the current runtime state.
3. Runtime state contracts must distinguish player-scoped progress from shared game-scoped progress without pushing storage or transport details into engine-owned types.
4. The engine port surface must include the minimum dependencies needed to load published bundles and read/write runtime state, while preserving the dependency direction `mobile -> api -> engine <- db`.
5. Engine-owned runtime result shapes must be deterministic and rich enough for later API/mobile surfaces to render updated block state and available next-step information without reimplementing gameplay logic.
6. Runtime state and public engine APIs must be documented as engine contracts, not API DTOs, and remain framework-free.
7. This feature must define which lifecycle responsibilities remain inside the engine and which are explicitly deferred to later session persistence and multiplayer features.

## Architecture and Technical Notes

- Primary reference: `docs/architecture/hexagonal-feature-slice-architecture.md`
- The runtime surface should stay centered in `packages/engine`, with `createEngine` exporting engine-owned entrypoints and ports living in the engine package.
- `StoryRepo.getBundle(storyId)` is the published bundle ingress from EPIC-0002; FEAT-0006 defines how the runtime surface consumes that bundle, not how publishing works.
- User-scoped and game-scoped state are engine concepts in this feature. Their durable persistence and synchronization behavior remain later adapter concerns.
- Success payloads from engine entrypoints should describe runtime outcomes such as updated state views and available next-step data, while route-local request/response DTOs remain adapter-owned in later work.
- No new ADR is required unless the current engine-port boundary proves insufficient for headless runtime orchestration.

## Acceptance Criteria

- The runtime state model is defined clearly enough that later block, traversal, session, and mobile work can build on it without reopening core state-shape questions.
- `createEngine` and its initial runtime entrypoints are defined as the single public execution surface for gameplay logic.
- Engine ports describe published bundle access and runtime state persistence needs without leaking adapter-specific concerns into the engine.
- The feature establishes a deterministic engine-owned result shape for runtime operations.
- The feature explicitly defers persistence policy, session lifecycle orchestration, and multiplayer sync semantics to later work.

## Test Plan

- Add unit tests that exercise `createEngine` surface construction with stubbed ports.
- Add unit tests that prove runtime state types and entrypoint result shapes can be consumed without adapter-specific casting or transport concerns.
- Add focused engine tests for start/load/action entrypoint behavior using published bundle fixtures and fake repos.
- Manually verify the documented public API remains consistent with the architecture examples for `createEngine`, `startGame`, `loadSave`, and `submitAction`.

## Rollout and Observability

- Internal engine-only rollout; later API routes and mobile features adopt this surface rather than inventing parallel gameplay contracts.
- Surface runtime errors explicitly through the engine API so adapters can log or serialize them later without guessing intent.
- Success is measured by downstream runtime features being able to build against one stable engine-owned public surface.

## Risks and Mitigations

- Risk: the engine API grows into an adapter-shaped surface. Mitigation: keep entrypoints and result types engine-centric and leave HTTP/mobile concerns to later layers.
- Risk: runtime state contracts blur with storage schemas. Mitigation: define runtime types as engine semantics first and let db adapters map them later.
- Risk: lifecycle responsibilities remain ambiguous between engine and session features. Mitigation: document exact ownership boundaries in this feature and defer orchestration policy to EPIC-0004.

## Open Questions

- None. This feature defines engine contracts only and intentionally leaves persistence and session orchestration details to later features.
