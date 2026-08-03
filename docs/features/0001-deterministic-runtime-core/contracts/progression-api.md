# Contract: Progression Evaluation

## Durable Lifecycle

```ts
export type ProgressionStatus = "locked" | "available" | "active" | "completed" | "skipped";

export interface ProgressionNodeState {
  readonly nodeId: string;
  readonly status: ProgressionStatus;
}

export interface ProgressionInstance {
  readonly graphId: string;
  readonly graphVersion: number;
  readonly nodes: readonly ProgressionNodeState[];
}
```

Nodes sort by `nodeId` in durable state. Multiple nodes may be available or active; no field represents one global current node.

Legal movements are:

- `locked -> available | skipped`
- `available -> active | completed | skipped`
- `active -> available | completed | skipped`
- `completed` and `skipped` are terminal

## Definitions and Intents

```ts
export interface ProgressionIntent {
  readonly nodeId: string;
  readonly from: ProgressionStatus;
  readonly to: ProgressionStatus;
}

export interface AutomaticRule<State, Payload, Outcome, Kind> {
  readonly ruleId: string;
  readonly targetNodeId: string;
  readonly from: readonly ProgressionStatus[];
  readonly to: ProgressionStatus;
  readonly priority: number;
  readonly when: (input: ProgressionRuleInput<State, Payload, Outcome, Kind>) => boolean;
}

export interface ProgressionDefinition<State, Payload, Outcome, Kind> {
  readonly aggregateKind: Kind;
  readonly graphId: string;
  readonly graphVersion: number;
  readonly nodes: readonly {
    readonly nodeId: string;
    readonly initialStatus: ProgressionStatus;
  }[];
  readonly automaticRules: readonly AutomaticRule<State, Payload, Outcome, Kind>[];
}

export interface DefinedProgression<State, Payload, Outcome, Kind> extends ProgressionDefinition<
  State,
  Payload,
  Outcome,
  Kind
> {
  readonly [definedProgressionBrand]: true;
}

export function defineProgression<Kind, State, Payload, Outcome>(
  definition: ProgressionDefinition<State, Payload, Outcome, Kind>,
): DefinedProgression<State, Payload, Outcome, Kind>;
```

Rule input contains frozen candidate game state, current progression, command, semantic outcome, domain events, and the already-consumed observation trace. Rules cannot consume new observations, inspect accumulated automatic traversal, mutate state, return a promise, or execute effects.

`defineProgression` rejects malformed or duplicate graph, node, or rule identities; unknown
references; same-state rules; illegal lifecycle changes; invalid priorities; and invalid predicate
shape. It normalizes nodes, rule status lists, and rules with one ordinal comparator and freezes the
metadata. Execution separately rejects missing or extra instance nodes, graph-version mismatch,
duplicate command intents, and dynamic rule failures. Raw graph validation and direct evaluation are
not public root APIs.

## Atomic Evaluation

Direct command intents apply to a candidate progression before automatic evaluation and do not count against the automatic limit. Any invalid intent invalidates the whole command candidate.

Automatic progression uses rounds:

1. Record the canonical starting progression state.
2. Evaluate all rules against the same immutable pre-round snapshot.
3. Group enabled rules by target node.
4. Select the lowest numeric priority for each node.
5. If two enabled rules tie for a target's lowest priority, return `progression-conflict`.
6. Order independent winners by node ID and then rule ID using ordinal code-unit comparison.
7. If there are no winners, return the stable candidate.
8. If the whole batch exceeds the remaining automatic-transition budget, return `progression-limit-overrun` without applying any part of it.
9. Apply the complete batch simultaneously and append transition records in canonical order.
10. If the complete canonical progression state has appeared before, return `progression-cycle`.
11. Repeat with the new snapshot.

Command state, direct intents, and all automatic rounds form one atomic proposal. Any failure returns the original aggregate; the attempted trace is explanatory and never committable.

## Stable State

A progression state is stable when a complete rule scan selects no automatic transition. Having available or active nodes is compatible with stability.

Every successful evaluation guarantees:

- the state and graph validate;
- no automatic rule is selected;
- the automatic trace count is no greater than the resolved limit;
- each trace step's `from` status matches the preceding snapshot;
- no node changes twice in one round;
- terminal nodes have not reopened;
- input definitions, state, command, and observations remain unchanged.

## Transition Limit

`maxAutomaticTransitions` counts individual automatic node lifecycle changes, not scans, rounds, or direct command intents.

| Case                                                | Result                                     |
| --------------------------------------------------- | ------------------------------------------ |
| Limit `0`, no rule selected                         | Stable success                             |
| Limit `0`, at least one rule selected               | Limit overrun before any automatic change  |
| Exact limit reached and result stable               | Stable success                             |
| Exact limit reached and another rule selected       | Limit overrun                              |
| Next parallel batch is larger than remaining budget | Reject the entire batch with limit overrun |
| An in-budget batch enters a repeated state          | Cycle diagnostic                           |

A limit diagnostic includes limit, applied count, next batch size, and ordered candidate transitions.

## Cycle Detection

Cycle comparison uses the complete canonical progression state: graph identity, graph version, and every ordered node status. An implementation may index states by a deterministic fingerprint, but it must retain and compare canonical state rather than trusting a hash alone.

Cycle diagnostics include graph identity/version, first-seen automatic-transition count, repeated
automatic-transition count, cycle length, ordered automatic cycle trace, repeated snapshot, and the
triggering rules/nodes. Direct command-intent trace offsets are tracked separately and never used as
automatic-transition indexes.

## Trace

```ts
export interface ProgressionTransition {
  readonly sequence: number;
  readonly round: number;
  readonly source: "command" | "automatic";
  readonly ruleId?: string;
  readonly nodeId: string;
  readonly from: ProgressionStatus;
  readonly to: ProgressionStatus;
}
```

Direct intents appear before automatic steps. Steps inside one automatic batch share a round number and sort by node ID then rule ID. Sequence numbers are contiguous across the complete attempted traversal.

## Diagnostics

- `progression-graph-invalid`: malformed definition or unknown reference
- `progression-state-invalid`: instance does not match graph or contains invalid lifecycle data
- `progression-intent-invalid`: direct command intent is illegal or conflicting
- `progression-rule-failed`: predicate throws, mutates, or returns a non-boolean/async result
- `progression-conflict`: same-target rules tie at the winning priority
- `progression-cycle`: a complete canonical progression state repeats
- `progression-limit-overrun`: the next complete batch does not fit the remaining limit

All include graph and command identity plus the relevant node, rule, status, and attempted trace context.
