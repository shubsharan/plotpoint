| Field           | Value                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------ |
| **Source**      | [Hexagonal + Feature-Slice Architecture](https://www.notion.so/321997b3842e815c9c79ecdfc2f0e06d) |
| **Type**        | Architecture                                                                                     |
| **Domains**     | Engine, API, Data Model, Mobile                                                                  |
| **Last synced** | 2026-04-22                                                                                       |

# Hexagonal + Feature-Slice Architecture

## Decision Summary

This document defines the durable implementation rules for Plotpoint. It is intentionally not a map of the current repository layout. Repository structure will change. These rules should not.

- The engine is the single gameplay authority.
- Adapters own transport, persistence, orchestration, and integration concerns.
- Public runtime contracts stay engine-shaped, not route-shaped, db-shaped, or UI-shaped.
- API behavior is organized by feature slice so each route owns its own transport contracts and does not import handler logic from sibling routes.
- Durable run coordination is adapter-owned and must assemble engine input from adapter records instead of promoting adapter concerns into engine contracts.
- Non-obvious tradeoffs belong in ADRs. Cross-feature implementation rules belong in architecture docs. Scope and sequencing belong in feature PRDs.

## Documentation Contract

- `docs/index.md` is the current-state rollup.
- `docs/product/` holds product strategy and roadmap sequencing.
- `docs/architecture/` holds reusable implementation rules and ownership boundaries.
- `docs/epics/` and `docs/features/` hold scoped contracts, sequencing, and acceptance criteria.
- `docs/adrs/` hold decisions that required explicit tradeoff analysis and should not be treated as incidental implementation detail.

## Core Boundaries

### Engine boundary

The engine owns gameplay semantics and nothing else.

The engine owns:

- `StoryPackage` schema and compatibility validation
- engine runtime contracts such as `SessionState` and `RuntimeFrame`
- block definitions, reducer semantics, traversal facts, and graph traversal
- narrow ports for external dependencies such as published package lookup or device context

The engine does not own:

- HTTP DTOs
- database schemas
- draft or publish workflow state
- `StoryRun` persistence or lifecycle orchestration
- realtime transport, notification fanout, or provider-specific payloads

### Adapter boundary

Adapters own everything required to host the engine in real product flows.

Adapters own:

- request and response DTOs
- auth, authorization, and error serialization
- draft storage and publish persistence
- `StoryRun` lifecycle, resume assembly, and shared-state coordination
- notification delivery and infrastructure-specific policies

Adapters may compute, persist, and coordinate around engine state. They may not redefine gameplay rules that the engine already owns.

## Dependency Direction

Dependency direction is an invariant, not a suggestion.

- Mobile depends inward on engine contracts and adapter-owned service surfaces.
- API depends inward on engine contracts and adapter-owned persistence/services.
- DB packages may implement engine ports, but the engine must not import from db.
- Route-local contracts may reference engine types where useful, but engine types must never import transport concerns back.

When a change feels easier if the engine imports an adapter type, that is usually a design smell. Add or narrow a port instead.

## Runtime Contract Pattern

Runtime contracts stay centered on gameplay execution rather than storage or transport.

Canonical pattern:

1. Adapter loads its durable truth.
2. Adapter assembles engine input.
3. Engine computes the next gameplay result.
4. Adapter persists whichever parts of the result it owns durably.
5. Adapter maps the result into transport or UI shape.

Illustrative pattern:

```ts
const request = parseRouteDto(body);
const run = await loadRunOrThrow(request.runId);
const state = assembleSessionState(run, participantBinding);
const frame = await engine.submitAction({ state, blockId, action });
await persistAcceptedState(frame.state, run);
return serializeRouteResponse(frame);
```

The engine call is the center of the flow. Everything around it is adapter-owned preparation or projection.

## Transport And DTO Pattern

Transport contracts stay local to the boundary that owns them.

Use route-local DTOs when:

- parsing request bodies
- validating path or query params
- returning HTTP-specific success or error responses
- normalizing provider-specific input or output

Do not promote transport DTOs into engine contracts just because multiple routes happen to share them today.

Illustrative pattern:

```ts
const parsed = startRunRequestSchema.parse(body);
const command = toAdapterCommand(parsed);
const result = await runLifecycleService.startRun(command);
return c.json(toHttpResponse(result));
```

The request schema is local. The adapter command is local. The engine contract remains unchanged.

## Persistence Pattern

Persistence is an adapter projection around engine contracts, not a competing source of gameplay truth.

Use durable records to store:

- business workflow state such as draft metadata, publish versions, and `StoryRun`
- sparse engine-owned state that must survive resume
- adapter-owned metadata needed for orchestration, authorization, coordination, or observability

Do not store hydrated runtime snapshots as the canonical durable source if the engine can deterministically rehydrate them from sparse state and the published package.

The persistence rule is:

- persist minimal authoritative state
- derive views and envelopes on load
- keep adapter metadata separate from engine execution contracts

## Feature-Slice Pattern

Feature slices exist so behavior can stay cohesive without turning the API into a shared-utils maze.

Within a slice:

- route handlers parse and validate transport input
- slice services coordinate persistence and engine calls
- db queries stay focused on the slice's durable truth
- error mapping stays explicit and local

Across slices:

- share engine/domain contracts only when they are truly domain-level
- avoid importing sibling route handlers or transport schemas
- extract shared adapter helpers only when the rule is stable and reused across multiple slices

If two routes need the same business rule, extract an adapter service. If they only share JSON shape, keep that local unless the shape is itself a durable contract.

## Do / Do Not

### Engine ownership

Do:

- keep engine contracts runtime-shaped
- keep block reducers pure and value-based
- expose narrow ports for external dependencies
- let traversal, validation, and execution remain engine concerns

Do not:

- persist HTTP concerns in engine types
- move gameplay logic into API handlers or mobile components
- let engine imports drift into db, auth, or transport packages
- add convenience adapter fields to `SessionState` or `RuntimeFrame`

### Adapter ownership

Do:

- reconstruct engine input from adapter-owned records
- keep request parsing and response shaping at the transport edge
- store orchestration metadata outside engine contracts
- treat lifecycle and coordination as adapter responsibilities

Do not:

- persist `RuntimeFrame` as durable truth
- treat transport DTOs as domain contracts
- duplicate gameplay validation outside the engine when the engine already owns it
- couple db row shape directly to the public runtime API

## Edge Cases And How To Handle Them

### A route wants a simpler response than `RuntimeFrame`

Return a simpler route projection, but do not change the engine contract for that convenience. Project from `RuntimeFrame` at the edge.

### Persistence needs extra metadata

Add adapter-owned durable fields or companion records. Do not widen engine contracts just to satisfy storage layout.

### Multiple hosts need the same gameplay capability

Put that capability in the engine. Hosts may wrap it, but they should not each invent their own gameplay semantics.

### A feature spans engine and adapters

Split the change intentionally:

- engine owns the gameplay rule
- adapters own orchestration, transport, and persistence around it

If that split is unclear, the design is not ready.

## When A Change Requires An ADR

Create or update an ADR when a proposal changes any of these:

- the public engine runtime surface
- the ownership boundary between engine and adapters
- the canonical authored `StoryPackage` contract
- traversal or compatibility policy that affects published-package meaning
- the rule for what is durably authoritative versus derived

Do not create an ADR for ordinary implementation detail that already fits these architecture rules.

## Related Architecture Surfaces

- `story-run-lifecycle-and-state-ownership.md` defines the durable adapter-side run model that hosts engine runtime for co-op play.
- `ADR-0002` defines the headless engine runtime boundary.
- `ADR-0003` defines the traversal-fact model and the no-translation policy for authored condition leaves.
