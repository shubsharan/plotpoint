| Field           | Value               |
| --------------- | ------------------- |
| **Type**        | ADR                 |
| **Date**        | 2026-04-15          |
| **Deciders**    | product-engineering |
| **Last synced** | 2026-04-15          |

# ADR-0002 - Headless Engine Runtime Boundary

## Status

Accepted

## Context

EPIC-0003 needed a durable runtime boundary that mobile and API hosts could both consume without reimplementing gameplay logic or coupling the engine to transport and persistence concerns. FEAT-0006 locked the public engine surface and runtime contracts, while FEAT-0007 locked the executor and block-definition boundary that sits behind that surface.

The core decision was not only where runtime code lives, but also what belongs inside the engine contract: public entrypoints, sparse persisted session state, derived runtime views, executor ownership, block reducer responsibilities, and the generic action envelope that adapters must pass through unchanged.

## Options Considered

### Option A - Headless engine-owned runtime boundary

- Pros
- Keeps gameplay execution in one framework-free authority that mobile and API can both call.
- Preserves a narrow public surface: `createEngine`, `startSession`, `loadSession`, `submitAction`, and `traverse`.
- Keeps persisted `SessionState` sparse while returning a derived `RuntimeFrame.view` that hosts can render directly.
- Keeps orchestration concerns such as block lookup, bucket routing, validation order, and error mapping inside the executor instead of scattering them across adapters or block implementations.
- Cons
- Requires hosts to adapt to engine-owned contracts rather than shaping responses around transport-specific DTOs.
- Forces later persistence and sync work to integrate with the established runtime boundary instead of inventing a new session API.

### Option B - Adapter-shaped runtime APIs per host

- Pros
- Lets API and mobile tailor gameplay surfaces to their own transport and UX needs immediately.
- Can make persistence- or route-shaped payloads feel more direct in host code.
- Cons
- Reintroduces gameplay semantics outside the engine and risks drift between mobile-local and API-hosted execution.
- Couples runtime contracts to current adapter needs and makes later boundary changes more expensive.
- Blurs resumable state, derived view data, and persistence concerns.

### Option C - Block-owned orchestration with a thinner executor

- Pros
- Pushes more behavior closer to each block type and can make individual block implementations feel self-contained.
- Reduces the apparent responsibility of the central executor.
- Cons
- Makes validation order, bucket policy, and error mapping less uniform.
- Encourages cross-block or host-aware behavior to leak into reducers.
- Weakens deterministic runtime behavior across the MVP block catalog.

## Decision

Adopt the headless engine-owned runtime boundary from FEAT-0006 and FEAT-0007.

The engine is the single gameplay authority. Hosts construct it through `createEngine` and invoke `startSession`, `loadSession`, `submitAction`, and `traverse` rather than owning parallel gameplay contracts. Persisted `SessionState` remains sparse and resumable, while `RuntimeFrame` wraps that state with a derived `view` for host consumption.

Within that boundary, block definitions stay pure and block-local. The executor owns registry lookup, state-bucket routing, runtime context resolution, deterministic validation and execution order, structured runtime error mapping, and the generic `type: 'submit'` action envelope. Blocks receive plain values plus value-only context and return next state only for their own key.

## Consequences

### Positive

- Mobile and API depend on one runtime authority and do not need to duplicate gameplay semantics.
- Runtime contracts stay engine-shaped rather than persistence- or transport-shaped.
- Sparse persisted state and derived hydrated views remain distinct concepts.
- Executor behavior stays deterministic across block types and runtime entrypoints.

### Negative

- Later session orchestration and persistence work must build around the established engine contracts.
- Adapters cannot reshape the core gameplay contract without intentionally changing the engine boundary.
- Adding new runtime capabilities may require explicit boundary decisions rather than opportunistic host-local patches.

### Follow-up

- Keep future session persistence and multiplayer work in EPIC-0004 aligned to this runtime boundary.
- Treat changes to public runtime entrypoints, `SessionState`, `RuntimeFrame`, executor ownership, or action-envelope semantics as ADR-level changes.
- Keep FEAT-0008 traversal semantics within this runtime boundary rather than creating a second gameplay authority.

## References

- Related epic(s): `docs/epics/EPIC-0003-headless-runtime-engine-and-condition-system.md`
- Related feature PRD(s): `docs/features/FEAT-0006-runtime-state-model-and-engine-public-surface.md`, `docs/features/FEAT-0007-block-registry-and-action-executor.md`
- Related architecture docs: `docs/architecture/hexagonal-feature-slice-architecture.md`
