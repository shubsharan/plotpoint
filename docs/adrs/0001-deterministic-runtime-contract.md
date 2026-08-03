---
status: Accepted
---

# ADR: Deterministic Runtime Contract

## Context

Gate 1 establishes the first Plotpoint contract consumed by game authors and later compiler,
player, persistence, synchronization, and authoritative-runtime work. Pre-release review exposed
three boundary defects: malformed inputs could escape as exceptions while constructing their
invalid record, reverted progression could be reported as a no-op with a trace, and locale-aware
sorting weakened cross-runtime determinism. The original generic types and some testkit assertions
also claimed stronger guarantees than they enforced.

The packages remain private, version `0.0.0`, and unreleased, so this ADR records the corrected Gate
1 contract directly rather than preserving accidental pre-release behavior.

## Decision

1. Command execution is a typed pipeline with preflight, handler, progression, classification, and
   record-construction phases. Policy or input values that cannot become canonical return
   `{ kind: "invalid", phase: "preflight", diagnostics }` without an aggregate or execution record.
   Once inputs are canonical, every terminal execution result contains a replayable record.
2. Execution records are assembled only from internally canonical components. Canonical limits
   apply to each durable input or output boundary; record construction does not revalidate raw input
   or impose a second combined budget.
3. Canonicalization accepts `unknown` and returns `JsonValue`; domain validators perform subsequent
   narrowing. Canonical objects are detached recursively frozen ordinary objects. Reserved property
   names are defined safely, and all canonical ordering uses ordinal code-unit comparison.
4. Aggregate kind is a generic parameter shared by aggregates, commands, command definitions,
   progression definitions, execution inputs, results, fixtures, and replay.
5. Static progression graphs are created through `defineProgression`, which validates, normalizes,
   ordinally orders, and freezes graph metadata once. Execution validates only the current instance,
   direct intents, predicate results, conflicts, cycles, and limits.
6. A no-op contains only the original aggregate and outcome. Events, effects, or any direct or
   automatic progression trace on an unchanged final aggregate are invalid. Cycle bookkeeping keeps
   command-intent trace offsets separate from automatic-transition counts.
7. The runtime root exports author-facing constructors, execution functions, durable/result types,
   and diagnostics. The testkit retains fixtures, scripted observations, strict execution, replay,
   honest variant/diagnostic assertions, and canonical record comparison. The harness owns mutation,
   isolation, consumption, repetition, and known-ambient-API checks.
8. Explicit observations, one-aggregate commands, semantic rejection, atomic command-plus-
   progression stabilization, simultaneous rounds, effects as post-commit data, stable diagnostics,
   and infrastructure-free replay remain the core semantics.

## Consequences

- The pre-release API changes without compatibility wrappers; documentation and internal consumers
  migrate together.
- Preflight failures are diagnosable but intentionally non-replayable because no canonical input set
  exists to record.
- Ordinary frozen objects restore familiar JavaScript ergonomics but require descriptor-safe
  construction for reserved keys.
- Validating static graphs once reduces repeated work and public surface, while dynamic progression
  state and rule results remain runtime-validated.
- The runtime remains a deterministic contract and testable authority boundary, not a hostile-code
  sandbox. Compiler and player isolation remain later gates.

## Supersession

**Supersedes**: None
**Superseded by**: None
