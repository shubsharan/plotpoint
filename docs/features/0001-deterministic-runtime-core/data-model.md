# Data Model: Deterministic Runtime Core

## Canonical Value Model

All durable fields use `JsonValue`:

```text
JsonValue = null | boolean | finite number | string | JsonValue[] | JsonObject
JsonObject = string-keyed JsonValue properties
```

Canonicalization returns an isolated, recursively frozen value plus canonical text. Arrays retain order; object keys sort lexicographically; negative zero becomes zero. Validation uses the caller-resolved policy limits and reports the first invalid path without invoking getters, accessors, or `toJSON`.

Invalid values include undefined, bigint, symbol, function, non-finite number, sparse or extended arrays, accessors, symbol keys, non-enumerable properties, custom prototypes, class instances, dates, maps, sets, typed arrays, host handles, cyclic references, and strings containing lone UTF-16 surrogates.

## Runtime Policy

| Field                     | Type                      | Validation                 | Meaning                                          |
| ------------------------- | ------------------------- | -------------------------- | ------------------------------------------------ |
| `contractVersion`         | positive safe integer     | Gate 1 value is `1`        | Selects stable runtime semantics                 |
| `maxCanonicalDepth`       | non-negative safe integer | Default v1 value: `128`    | Deepest accepted durable-value path              |
| `maxCanonicalNodes`       | non-negative safe integer | Default v1 value: `100000` | Maximum values visited per canonicalization      |
| `maxAutomaticTransitions` | non-negative safe integer | Default v1 value: `100`    | Maximum automatic node changes after one command |

The resolved policy is part of the execution record. Callers may lower or raise limits explicitly, but replay must use the same resolved values.

## Aggregate Envelope

| Field           | Type                           | Validation                          | Meaning                                     |
| --------------- | ------------------------------ | ----------------------------------- | ------------------------------------------- |
| `kind`          | `player`, `team`, or `session` | Required                            | Gameplay ownership boundary                 |
| `id`            | string                         | Non-empty                           | Opaque aggregate identity                   |
| `schemaVersion` | positive safe integer          | At least `1`                        | Durable state schema version                |
| `stateVersion`  | non-negative safe integer      | Must not overflow on acceptance     | Optimistic concurrency version              |
| `authority`     | `local` or `server`            | Required                            | Where commands may ultimately commit        |
| `state`         | canonical object               | Required                            | Game-defined durable state                  |
| `progression`   | progression instance or absent | Graph/version must match definition | Durable progression owned by this aggregate |

An aggregate owns at most one Gate 1 progression instance. This is not a second aggregate: game state and progression advance under the same aggregate version and atomic candidate result.

## Command Envelope

| Field                  | Type                      | Validation                            | Meaning                                          |
| ---------------------- | ------------------------- | ------------------------------------- | ------------------------------------------------ |
| `id`                   | string                    | Non-empty                             | Stable identity for replay and later idempotency |
| `type`                 | string                    | Non-empty and matched to a definition | Game command discriminator                       |
| `target.kind`          | aggregate kind            | Must match definition and aggregate   | Target kind                                      |
| `target.id`            | string                    | Must equal aggregate identity         | Target instance                                  |
| `expectedStateVersion` | non-negative safe integer | Must equal aggregate state version    | Concurrency precondition                         |
| `payload`              | canonical object          | Definition validates domain shape     | Game-defined input                               |

Each command definition binds one command type to one aggregate kind and a synchronous handler. No runtime registry is introduced; definitions are explicit values later composed at build time.

## Observation Script

| Field   | Type            | Validation | Meaning                                                                 |
| ------- | --------------- | ---------- | ----------------------------------------------------------------------- |
| `kind`  | string          | Non-empty  | Clock, identifier, random, capability, or game-defined observation type |
| `key`   | string          | Non-empty  | Specific request name within the kind                                   |
| `value` | canonical value | Required   | Recorded external result                                                |

Array position is the observation sequence. `context.take(kind, key)` must match and consume the exact next item. A request with no next item is exhausted; a different next identity is out of order. The trace records provided index, requested identity, and consumed canonical value. Unused items remain visible to the testkit.

## Handler Decision

### Accepted Candidate

| Field                | Type                      | Rules                                          |
| -------------------- | ------------------------- | ---------------------------------------------- |
| `kind`               | `accepted`                | Required discriminator                         |
| `nextState`          | canonical object          | Proposed game state, not an aggregate envelope |
| `outcome`            | canonical object          | Semantic accepted result                       |
| `domainEvents`       | ordered canonical objects | Descriptive facts only                         |
| `effectIntents`      | ordered canonical objects | Never executed by runtime                      |
| `progressionIntents` | ordered lifecycle changes | Must target the owned progression instance     |

### Rejected Candidate

| Field     | Type             | Rules                         |
| --------- | ---------------- | ----------------------------- |
| `kind`    | `rejected`       | Required discriminator        |
| `outcome` | canonical object | Semantic rule-level rejection |

A rejected decision cannot contain next state, events, effects, or progression intents. Unexpected handler throws become invalid execution diagnostics rather than semantic rejection.

## Execution Result

| Variant    | Aggregate after                | Outputs                                            | Version behavior                                  |
| ---------- | ------------------------------ | -------------------------------------------------- | ------------------------------------------------- |
| `accepted` | Canonical stabilized candidate | Outcome, ordered events/effects, progression trace | Advance once if game or progression state changed |
| `no-op`    | Canonical original             | Outcome only                                       | Preserve version                                  |
| `rejected` | Canonical original             | Rejection outcome only                             | Preserve version                                  |
| `invalid`  | Canonical original             | Diagnostics and non-committable attempted trace    | Preserve version                                  |

If an accepted candidate has no final state or progression difference, it is a no-op. Events, effects, or progression work on a no-op are invalid because they imply commit-dependent work without a committed durable change.

## Progression Definition

### Node Definition

| Field           | Type             | Validation                              |
| --------------- | ---------------- | --------------------------------------- |
| `nodeId`        | string           | Unique, non-empty stable ASCII identity |
| `initialStatus` | lifecycle status | Required                                |

### Automatic Rule

| Field          | Type                       | Validation                                                 |
| -------------- | -------------------------- | ---------------------------------------------------------- |
| `ruleId`       | string                     | Unique, non-empty stable ASCII identity                    |
| `targetNodeId` | string                     | Must identify a defined node                               |
| `from`         | non-empty status set       | Must exclude terminal departure                            |
| `to`           | lifecycle status           | Must be a legal non-self movement from every `from` status |
| `priority`     | safe integer               | Lower values win for the same target                       |
| `when`         | synchronous pure predicate | Boolean result; no observation consumption or mutation     |

### Progression Instance

| Field          | Type                     | Validation                                                     |
| -------------- | ------------------------ | -------------------------------------------------------------- |
| `graphId`      | string                   | Matches the definition                                         |
| `graphVersion` | positive safe integer    | Matches the definition                                         |
| `nodes`        | ordered node-state array | Exactly one entry per definition node, canonical node-id order |

## Progression Lifecycle

```text
locked    -> available | skipped
available -> active | completed | skipped
active    -> available | completed | skipped
completed -> terminal
skipped   -> terminal
```

Multiple nodes may be available or active. `active -> available` is explicit deactivation and permits a valid graph to oscillate, which runtime cycle detection must diagnose. Resetting completed or skipped nodes and repeatable-node semantics are outside Gate 1.

## Progression Round and Trace

One automatic round:

1. Freezes one pre-round aggregate/progression snapshot.
2. Evaluates every automatic rule against that same snapshot.
3. Selects the lowest-priority enabled rule for each target node.
4. Fails if multiple enabled rules tie for a target's lowest priority.
5. Sorts independent winners by node ID and then rule ID.
6. Verifies the complete batch fits the remaining transition budget.
7. Applies the batch simultaneously and records its ordered steps.

A stable state has no selected automatic rule after a complete scan. Available or active nodes do not by themselves make it unstable.

Each trace step records sequence, round, source (`command` or `automatic`), rule ID when automatic, node ID, prior status, and next status. Direct command intents do not count toward the automatic limit. A simultaneous batch is never partially applied.

## Diagnostic

Every diagnostic contains a stable code, deterministic canonical details, and relevant command or graph identity. Human-readable rendering is outside the durable record.

Core codes:

- `canonical-value-invalid`, `canonical-limit-exceeded`
- `command-target-mismatch`, `stale-aggregate-version`, `state-version-overflow`
- `observation-exhausted`, `observation-order-mismatch`, `observation-unused`
- `handler-threw`, `handler-result-invalid`, `no-op-output-invalid`
- `progression-graph-invalid`, `progression-state-invalid`, `progression-intent-invalid`
- `progression-rule-failed`, `progression-conflict`, `progression-cycle`, `progression-limit-overrun`

## Execution Record

`formatVersion: 1` records:

- stable command definition identity and resolved runtime policy;
- canonical command, aggregate before, progression before, and observations provided;
- ordered observation consumption;
- terminal result variant and diagnostics;
- aggregate after for accepted results;
- semantic outcome, ordered domain events, and ordered effect intents when committable;
- direct and automatic progression trace plus stable state or attempted failure context.

The record excludes execution time, duration, stack traces, host errors, generated record IDs, and hashes used as the only source of truth. It is a replay fixture containing raw game state, not an operational log; later telemetry must apply redaction policy.

## Relationships and Atomicity

```text
Command -> targets one Aggregate
Aggregate -> owns zero or one Progression Instance
Command Definition -> invokes one Handler
Handler -> consumes ordered Observations
Handler -> proposes one Decision
Accepted Decision -> proposes State + Events + Effects + Progression Intents
Runtime -> stabilizes Candidate through one Progression Definition
Runtime -> emits one Execution Result + Execution Record
```

Only a stabilized accepted result is a commit candidate. Rejection, invalidity, no-op, cycle, conflict, or limit overrun preserves the original aggregate. No entity in this model persists itself or executes an effect.
