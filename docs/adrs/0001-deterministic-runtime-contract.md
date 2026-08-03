---
status: Proposed
---

# ADR: Deterministic Runtime Contract

## Context

Gate 1 establishes the first Plotpoint contract consumed directly by game authors and by later compiler, player, persistence, synchronization, and authoritative-runtime work. It must define what durable state is, how one command proposes an aggregate transition, how external values enter deterministic logic, and how progression reaches a stable result. These choices form the aggregate-schema compatibility surface and will be expensive to change after releases and saved state depend on them.

Ordinary JavaScript can call ambient globals even when an API does not provide them. The initial contract therefore also needs an honest boundary between deterministic runtime behavior, author-facing verification, and the stronger import or isolation enforcement deferred to later gates.

## Decision

1. `@plotpoint/runtime` owns the dependency-free public command, aggregate, canonical-value, observation, diagnostic, execution-record, and progression contracts. `@plotpoint/testkit` owns deterministic fixtures, scripted observations, replay, and model testing. Gate 1 adds no release, bridge, or synchronization wire contract to `@plotpoint/protocol`.
2. Durable values use a versioned canonical JSON-compatible model. Boundaries validate without invoking getters or `toJSON`, reject unsupported or cyclic values, normalize negative zero, sort object keys, and return detached frozen canonical copies. Aggregate state, command payloads, outcomes, events, effects, observations, progression state, and execution records use this model.
3. A command targets exactly one player, team, or session aggregate and carries its expected state version. The runtime validates and canonicalizes all inputs, rejects target or version mismatches before invoking game logic, supplies only explicit ordered observations, validates the handler decision, and constructs the final aggregate. A successful state change advances the aggregate version once; rejection, invalid execution, and a true no-op preserve the version.
4. Handler decisions are discriminated accepted or rejected values. Accepted decisions propose next state, semantic outcome, domain events, post-commit effect intents, and optional progression intents. Runtime invalidity is separate. Effects are never executed by the runtime, and candidate events or effects are not exposed as committable if progression fails.
5. A progression instance belongs to one aggregate. Direct command intents are applied to a candidate, then automatic rules run in simultaneous deterministic rounds. Rules see one immutable pre-round snapshot; per-node winners are selected by lowest priority; equal-priority conflicts fail explicitly; independent winners apply as one canonical batch. Completed and skipped nodes are terminal. The transition limit counts individual automatic node changes, never splits a batch, and permits success at the exact limit only when the resulting state is stable. Repeated canonical progression state fails with a cycle diagnostic.
6. Command and progression evaluation form one atomic proposal. Invalid graph state, rule failure, conflict, cycle, or transition-limit overrun returns the original aggregate plus an explanatory attempted trace; no partially stabilized aggregate or candidate effect is committable.
7. Execution records are versioned canonical replay artifacts containing explicit inputs, consumed observations, decisions, outputs, progression trace, resolved limits, and stable diagnostic codes. They omit ambient timestamps, durations, stacks, generated record identifiers, and host error prose.
8. Gate 1 guarantees that Plotpoint runtime code performs no ambient I/O and supplies no ambient authority to handlers. The testkit freezes copies, scripts every observation, audits representative ambient APIs, repeats scenarios, and detects mutation or unused inputs. This is not a hostile-code sandbox: compiler import/global validation and stronger runtime isolation remain later-gate responsibilities.

## Consequences

- The runtime remains portable across the web runtime and author tests and has no production dependency or transport concern.
- Canonical validation, cloning, freezing, and full progression-state comparison add predictable linear work at execution boundaries in exchange for reproducibility and mutation isolation.
- JSON-compatible state excludes functions, class instances, cyclic structures, and host objects; richer values require a future explicit codec decision.
- One command cannot perform a hidden cross-aggregate transaction. Cross-aggregate facts must arrive as immutable observations or be coordinated by later platform workflows.
- Simultaneous progression rounds preserve parallel behavior and avoid iteration-order dependence, but conflicting rules must be resolved explicitly by the author.
- Full graph scans and state fingerprints are intentionally preferred over speculative indexing for Gate 1; optimization requires representative performance evidence.
- The TypeScript contract and test harness provide strong deterministic evidence but do not claim to secure arbitrary game code against deliberate ambient access.

## Supersession

**Supersedes**: None
**Superseded by**: None
