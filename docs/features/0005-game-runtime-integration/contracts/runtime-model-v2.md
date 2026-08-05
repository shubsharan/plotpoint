# Contract: Aggregate Runtime Model V2

Runtime Model V2 is the author-facing deterministic contract used by compiler-generated local models
and platform-owned authoritative adapters. It replaces the private pre-release assembly of a command
definition, aggregate, and optional progression at every call site.

## Aggregate Model

```ts
interface RuntimeSchemaV2<Value> {
  readonly id: string;
  readonly version: number;
  readonly schemaDigest: `sha256:${string}`;
  validate(value: unknown): SchemaValidationResult<Value>;
}

interface ResolvedCommandBindingV2<
  State extends JsonObject,
  Kind extends "player" | "team" | "session",
> {
  readonly registrationId: string;
  readonly commandType: string;
  readonly payloadSchema: RuntimeSchemaV2<JsonObject>;
  readonly outcomeSchema: RuntimeSchemaV2<JsonObject>;
  evaluate(input: {
    readonly aggregate: AggregateInstanceV2<Kind, State>;
    readonly command: RuntimeCommand<JsonObject, Kind>;
    readonly observations: ObservationCursor;
  }):
    | { readonly kind: "decision"; readonly decision: HandlerDecision<State, JsonObject> }
    | { readonly kind: "invalid-payload"; readonly diagnostic: Diagnostic };
}

declare function resolveCommandBindingV2<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
  Kind extends AggregateKind,
>(input: {
  readonly registrationId: string;
  readonly definition: CommandDefinition<State, Payload, Outcome, Kind>;
  readonly payloadSchema: RuntimeSchemaV2<Payload>;
  readonly outcomeSchema: RuntimeSchemaV2<Outcome>;
}): ResolvedCommandBindingV2<State, Kind>;

interface ResolvedAggregateModelV2<
  Kind extends "player" | "team" | "session",
  State extends JsonObject,
> {
  readonly contractVersion: 2;
  readonly modelId: string;
  readonly aggregateKind: Kind;
  readonly authority: "local" | "server";
  readonly schemaId: string;
  readonly schemaVersion: number;
  readonly stateSchema: RuntimeSchemaV2<State>;
  readonly initializationSchema?: RuntimeSchemaV2<JsonObject>;
  initialize(input: JsonObject): State;
  readonly commandsByType: Readonly<Record<string, ResolvedCommandBindingV2<State, Kind>>>;
  readonly eventSchemas: Readonly<Record<string, RuntimeSchemaV2<JsonObject>>>;
  readonly effectSchemas: Readonly<Record<string, RuntimeSchemaV2<JsonObject>>>;
  readonly progression?: DefinedProgressionV2<State, Kind>;
}

interface ExecutableAggregateModelV2<Kind extends AggregateKind> {
  readonly contractVersion: 2;
  readonly modelId: string;
  readonly aggregateKind: Kind;
  readonly authority: "local" | "server";
  readonly schemaId: string;
  readonly schemaVersion: number;
  readonly stateSchema: RuntimeSchemaV2<JsonObject>;
  readonly initializationSchema?: RuntimeSchemaV2<JsonObject>;
  readonly commandContracts: Readonly<
    Record<
      string,
      {
        readonly registrationId: string;
        readonly payloadSchema: RuntimeSchemaV2<JsonObject>;
        readonly outcomeSchema: RuntimeSchemaV2<JsonObject>;
      }
    >
  >;
  readonly eventSchemas: Readonly<Record<string, RuntimeSchemaV2<JsonObject>>>;
  readonly effectSchemas: Readonly<Record<string, RuntimeSchemaV2<JsonObject>>>;
  readonly progression?: { readonly graphId: string; readonly graphVersion: number };
  initialize(input: JsonObject): JsonObject;
  execute(input: {
    readonly aggregate: AggregateInstanceV2<Kind, JsonObject>;
    readonly command: RuntimeCommand<JsonObject, Kind>;
    readonly observations: readonly Observation[];
    readonly policy?: Partial<RuntimePolicyV2>;
  }): ExecutionResultV2<Kind, JsonObject, JsonObject>;
}

declare function bindExecutableAggregateModelV2<
  Kind extends AggregateKind,
  State extends JsonObject,
>(model: ResolvedAggregateModelV2<Kind, State>): ExecutableAggregateModelV2<Kind>;
```

Every runtime schema identifies the digest of the exact inventoried schema bytes its validator
implements. The compiler generates resolved local models and digest-bound executable validators from
Project Configuration V2; authors do not duplicate command/progression maps or validators in the
initializer export. A trusted-mechanic adapter supplies the same resolved shape from platform code for
a server model and must match every release data-contract schema ID, version, and manifest digest.
Trusted Mechanic V1 requires `progression` to be absent on that server model. Initialization receives
only explicit frozen canonical input and its result passes `stateSchema`. The runtime derives optional
local progression.

`resolveCommandBindingV2` is the deliberate type-erasure boundary for a heterogeneous model registry.
Its generic factory closes over the payload/outcome-specific definition and schemas. The exposed
`evaluate` first narrows the erased payload through that schema and only then calls the typed handler;
the registry never widens a payload-specific function to an unsafe `JsonObject` function. Command type
is unique within a model.

`bindExecutableAggregateModelV2` is the only heterogeneous model-registry boundary. It constructs a new
wrapper rather than casting or widening a state-specific model. The wrapper exposes closed metadata and
erased validators, validates initialization output and persisted JSON state with the exact typed
`stateSchema`, then invokes the closed state-specific command/progression functions through `execute`.
The generated player registry and trusted-mechanic registry contain only these executable wrappers.

## Commands and Decisions

```ts
interface RuntimeCommand<Payload extends JsonObject, Kind extends AggregateKind> {
  readonly id: string;
  readonly type: string;
  readonly target: { readonly kind: Kind; readonly id: string };
  readonly expectedRevision: number;
  readonly payload: Payload;
}

interface AcceptedDecision<State extends JsonObject, Outcome extends JsonObject> {
  readonly kind: "accepted";
  readonly nextState: State;
  readonly outcome: Outcome;
  readonly domainEvents: readonly TypedRecord[];
  readonly effectIntents: readonly TypedRecord[];
  readonly progressionIntents: readonly ProgressionIntentV2[];
}

interface NoOpDecision<Outcome extends JsonObject> {
  readonly kind: "no-op";
  readonly outcome: Outcome;
}

interface RejectedDecision<Outcome extends JsonObject> {
  readonly kind: "rejected";
  readonly outcome: Outcome;
}

interface TypedRecord {
  readonly type: string;
  readonly payload: JsonObject;
}

type HandlerDecision<State extends JsonObject, Outcome extends JsonObject> =
  AcceptedDecision<State, Outcome> | NoOpDecision<Outcome> | RejectedDecision<Outcome>;
```

An accepted decision is invalid if state and progression are unchanged and both event/effect arrays
are empty. A no-op cannot carry state, event, effect, or progression fields. Runtime invalidity is
never a handler decision.

## Execution

```ts
interface ExecuteModelCommandInput<
  Kind extends AggregateKind,
  State extends JsonObject,
  Payload extends JsonObject,
> {
  readonly model: ResolvedAggregateModelV2<Kind, State>;
  readonly aggregate: AggregateInstanceV2<Kind, State>;
  readonly command: RuntimeCommand<Payload, Kind>;
  readonly observations: readonly Observation[];
  readonly policy?: Partial<RuntimePolicyV2>;
}

declare function executeModelCommand<
  Kind extends AggregateKind,
  State extends JsonObject,
  Payload extends JsonObject,
>(input: ExecuteModelCommandInput<Kind, State, Payload>): ExecutionResultV2<Kind, State, Payload>;
```

The executor:

1. resolves and validates policy, model, aggregate, command, and observations;
2. requires model/kind/schema/authority/target/revision agreement;
3. selects exactly one resolved command binding by command type;
4. invokes its erased wrapper, which schema-narrows the payload before calling the typed handler with
   detached frozen values and an observation cursor;
5. validates the explicit decision through the model's state, outcome, event, and effect validators;
6. evaluates optional progression atomically;
7. classifies and constructs a canonical result/record; and
8. advances revision exactly once only for an accepted commit.

Preflight invalidity has no record. Every later terminal has one record. Expected malformed or stale
input returns invalid data rather than throwing. A thrown handler or rule becomes a stable diagnostic.

## Result Semantics

| Result             | Aggregate after                          | Durable outputs                             | Revision     |
| ------------------ | ---------------------------------------- | ------------------------------------------- | ------------ |
| accepted           | Canonical state and optional progression | Outcome plus zero or more events/effects    | `before + 1` |
| no-op              | Original                                 | Outcome only                                | unchanged    |
| rejected           | Original                                 | Outcome only                                | unchanged    |
| invalid, execution | Original                                 | Diagnostics and attempted progression trace | unchanged    |
| invalid, preflight | Absent                                   | Diagnostics                                 | absent       |

Event-only and effect-only accepted records contain an after aggregate whose state/progression values
may equal before but whose revision advances. The runtime never executes effect intents.

## Progression V2

```ts
interface ProgressionNodeDefinitionV2 {
  readonly nodeId: string;
  readonly initialStatus: ProgressionStatus;
}

interface ProgressionTransitionDefinitionV2<State extends JsonObject> {
  readonly transitionId: string;
  readonly targetNodeId: string;
  readonly from: readonly ProgressionStatus[];
  readonly to: ProgressionStatus;
  readonly priority: number;
  readonly trigger: "direct" | "automatic";
  readonly when?: (facts: ProgressionFacts<State>) => boolean;
}

interface ProgressionFacts<State extends JsonObject> {
  readonly aggregateState: State;
  readonly progression: ProgressionInstanceV2;
  readonly domainEvents: readonly TypedRecord[];
}

interface ProgressionDefinitionV2<State extends JsonObject, Kind extends AggregateKind> {
  readonly aggregateKind: Kind;
  readonly graphId: string;
  readonly graphVersion: number;
  readonly nodes: readonly ProgressionNodeDefinitionV2[];
  readonly transitions: readonly ProgressionTransitionDefinitionV2<State>[];
}
```

Every direct intent names a declared `direct` transition and must match its current `from` state.
Automatic predicates exist only on `automatic` transitions and see no command-wide payload/outcome
generic. Existing simultaneous-round, lowest-priority winner, equal-priority conflict, cycle, exact
limit, and ordinal trace behavior remains.

`initialProgression(definition)` is runtime-owned, canonical, frozen, and returns exactly one node-state
entry for every definition node in ordinal ID order. Passing a mismatched hand-built instance is invalid.

## Replay and Compatibility

Execution Record V2 includes `modelId`, schema identity, revision semantics, explicit decision variant,
typed event/effect arrays, and Progression Trace V2. Testkit replay resolves the model by `modelId` and
requires canonical equality of result and record.

Runtime V1 remains historical pre-release evidence and receives no compatibility wrapper. Runtime,
testkit, compiler, protocol adapter, and both reference games migrate together under accepted ADR 0001.
