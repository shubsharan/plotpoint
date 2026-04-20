| Field                         | Value |
| ----------------------------- | ----- |
| **Status**                    | Accepted |
| **Date**                      | 2026-04-15 |
| **Deciders**                  | product-engineering |
| **Related Epics**             | [EPIC-0003-headless-runtime-engine-and-condition-system](../epics/EPIC-0003-headless-runtime-engine-and-condition-system.md) |
| **Related Feature PRDs**      | [FEAT-0008-condition-registry-and-graph-traversal-semantics](../features/FEAT-0008-condition-registry-and-graph-traversal-semantics.md) |
| **Related Architecture Docs** | [hexagonal-feature-slice-architecture](../architecture/hexagonal-feature-slice-architecture.md) |

# ADR-0003 - Traversal Facts Replace Named Condition Registry

## Context

EPIC-0003 originally reserved conditioned traversal as a later runtime concern, and the architecture baseline still referenced a named condition registry. By FEAT-0008, that model was no longer sufficient: traversal needed one deterministic condition contract that compatibility validation and runtime evaluation could both share without leaking block-specific logic into a global registry.

The decision point was whether authored conditions should continue to reference named conditions with params, whether the engine should translate legacy condition leaves forward, or whether traversal should pivot to block-exported facts derived from effective block state and config.

## Options Considered

### Option A - Traversal facts exported by blocks

- Pros
- Keeps traversal generic while leaving block-specific semantics inside block-owned fact projectors.
- Gives compatibility validation and runtime evaluation one shared contract.
- Supports deterministic traversal across `startSession`, `loadSession`, `submitAction`, and `traverse`.
- Keeps state-bucket resolution engine-owned and hidden from authored condition data.
- Cons
- Requires a breaking authored leaf-shape change from legacy `check.condition + params`.
- Requires each block to expose stable fact names and declared primitive kinds.

### Option B - Keep the named condition registry

- Pros
- Preserves the older authored condition shape and the original architecture wording.
- Centralizes condition names in one place.
- Cons
- Couples traversal semantics to a global registry that must know block-specific meaning.
- Duplicates or obscures logic that already belongs with block state and config.
- Makes it harder to share one contract cleanly between compatibility validation and runtime evaluation.

### Option C - Add a translation layer from legacy named conditions to facts

- Pros
- Softens migration pressure for existing authored packages.
- Allows old and new condition shapes to coexist temporarily.
- Cons
- Adds compatibility complexity to both validation and runtime paths.
- Creates ambiguity about the canonical authored condition contract.
- Risks silent drift if old packages continue to pass under translated semantics.

## Decision

Replace the named condition registry with block-exported traversal facts, as defined in FEAT-0008.

Authored condition leaves now reference `{ type: 'fact', blockId, fact }` with optional operator and value. Each block registry entry exports `traversal.facts`, where each fact declares a primitive kind and a pure projector derived from effective `state + config`. One shared evaluator uses those facts across all runtime entrypoints, and runtime keeps defensive failure behavior through `runtime_condition_evaluation_failed`.

No translation layer is provided for legacy `check.condition + params` leaves. Instead, the engine-major boundary advances so previously published packages using the old condition contract fail explicitly rather than drifting under translated semantics.

## Consequences

### Positive

- Traversal semantics are generic, deterministic, and shared across validation and runtime.
- Block-specific progression meaning stays with the block that owns the state and config.
- Runtime entrypoints derive `traversableEdges` through one evaluator rather than parallel implementations.
- Invalid referenced facts, bad operators, or projector failures surface through typed runtime failures instead of partial results.

### Negative

- The authored condition contract is intentionally breaking for older leaf shapes.
- Block authors must maintain stable fact names and kinds as part of the runtime contract.
- Future traversal capabilities must work through the fact-view model or explicitly replace it.

### Follow-up

- Keep the architecture doc and future traversal docs aligned to the fact-view model rather than the older named condition registry wording.
- Treat changes to authored condition leaf shape, exported traversal-fact contracts, evaluator reuse across runtime entrypoints, or translation policy as ADR-level decisions.
- Keep compatibility validation and runtime evaluation sharing the same fact metadata and operator rules.
