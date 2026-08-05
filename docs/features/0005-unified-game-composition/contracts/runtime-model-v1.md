# Contract: Aggregate Runtime V1

Aggregate Runtime V1 documents the corrected pre-release runtime contract. Serialized aggregate and
record shapes remain version 1 where they already carry a version. Repository-owned TypeScript APIs are
unversioned: they are edited in place and do not use generation suffixes.

## Schemas and Aggregates

```ts
type AggregateKind = "player" | "team" | "session";
type AggregateAuthority = "local" | "server";
type JsonObject = Readonly<Record<string, JsonValue>>;

type SchemaValidationResult<Value> =
  | { readonly valid: true; readonly value: Value }
  | { readonly valid: false; readonly diagnostics: readonly Diagnostic[] };

interface RuntimeSchema<Value> {
  readonly id: string;
  readonly version: number;
  readonly schemaDigest: `sha256:${string}`;
  validate(value: unknown): SchemaValidationResult<Value>;
}

interface Aggregate<State extends JsonObject, Kind extends AggregateKind> {
  readonly aggregateId: string;
  readonly modelId: string;
  readonly aggregateKind: Kind;
  readonly schemaId: string;
  readonly schemaVersion: number;
  readonly stateVersion: number;
  readonly state: State;
  readonly progression?: ProgressionInstance;
}
```

`stateVersion` is the only aggregate concurrency and commit counter. Runtime, Host API, Sync V1,
SQLite, PostgreSQL, and reports use that name directly; no `revision` alias exists. `schemaId` and
`schemaVersion` are persisted on the aggregate because persisted state must remain self-describing.
Resolved models derive those values from `stateSchema` and do not copy them into parallel fields.

Every runtime validator names the digest of the exact inventoried schema bytes it implements. Identity
and version without digest agreement are insufficient at release or trusted-mechanic registration.

## Typed Models and Commands

```ts
interface ResolvedCommandBinding<State extends JsonObject, Kind extends AggregateKind> {
  readonly registrationId: string;
  readonly commandType: string;
  readonly payloadSchema: RuntimeSchema<JsonObject>;
  readonly outcomeSchema: RuntimeSchema<JsonObject>;
  evaluate(input: {
    readonly aggregate: Aggregate<State, Kind>;
    readonly command: RuntimeCommand<JsonObject, Kind>;
    readonly observations: readonly Observation[];
  }):
    | { readonly kind: "decision"; readonly decision: HandlerDecision<State, JsonObject> }
    | { readonly kind: "invalid-payload"; readonly diagnostics: readonly Diagnostic[] };
}

declare function resolveCommandBinding<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
  Kind extends AggregateKind,
>(input: {
  readonly registrationId: string;
  readonly definition: CommandDefinition<State, Payload, Outcome, Kind>;
  readonly payloadSchema: RuntimeSchema<Payload>;
  readonly outcomeSchema: RuntimeSchema<Outcome>;
}): ResolvedCommandBinding<State, Kind>;

interface ResolvedAggregateModel<Kind extends AggregateKind, State extends JsonObject> {
  readonly modelId: string;
  readonly aggregateKind: Kind;
  readonly authority: AggregateAuthority;
  readonly stateSchema: RuntimeSchema<State>;
  readonly initializationSchema: RuntimeSchema<JsonObject>;
  initialize(input: JsonObject): State;
  readonly commandsByType: Readonly<Record<string, ResolvedCommandBinding<State, Kind>>>;
  readonly eventSchemas: Readonly<Record<string, RuntimeSchema<JsonObject>>>;
  readonly effectSchemas: Readonly<Record<string, RuntimeSchema<JsonObject>>>;
  readonly progression?: ProgressionDefinition<State, Kind>;
}

type InitializationResult<Kind extends AggregateKind> =
  | { readonly kind: "initialized"; readonly aggregate: Aggregate<JsonObject, Kind> }
  | { readonly kind: "invalid"; readonly diagnostics: readonly Diagnostic[] };

interface ExecutableAggregateModel<Kind extends AggregateKind> {
  readonly modelId: string;
  readonly aggregateKind: Kind;
  readonly authority: AggregateAuthority;
  readonly stateSchema: RuntimeSchema<JsonObject>;
  readonly initializationSchema: RuntimeSchema<JsonObject>;
  readonly commandContracts: Readonly<
    Record<
      string,
      {
        readonly registrationId: string;
        readonly payloadSchema: RuntimeSchema<JsonObject>;
        readonly outcomeSchema: RuntimeSchema<JsonObject>;
      }
    >
  >;
  readonly eventSchemas: Readonly<Record<string, RuntimeSchema<JsonObject>>>;
  readonly effectSchemas: Readonly<Record<string, RuntimeSchema<JsonObject>>>;
  readonly progression?: { readonly graphId: string; readonly graphVersion: number };
  initialize(input: JsonObject): InitializationResult<Kind>;
  execute(input: {
    readonly aggregate: Aggregate<JsonObject, Kind>;
    readonly command: RuntimeCommand<JsonObject, Kind>;
    readonly observations: readonly Observation[];
  }): ExecutionResult<JsonObject, JsonObject, JsonObject, Kind>;
}

declare function bindExecutableAggregateModel<Kind extends AggregateKind, State extends JsonObject>(
  model: ResolvedAggregateModel<Kind, State>,
): ExecutableAggregateModel<Kind>;
```

`ResolvedAggregateModel` is the typed author/platform unit. Command definitions remain payload- and
outcome-specific. `resolveCommandBinding` closes over each typed definition and its validators, then
exposes an erased evaluator only after payload narrowing. `bindExecutableAggregateModel` constructs the
only erased model-registry wrapper; it first validates aggregate identity and state, then delegates to
that command binding. Neither boundary casts or widens a state- or payload-specific function.

Initialization validates canonical input through `initializationSchema`, calls the initializer,
validates the returned state, constructs `stateVersion: 0`, and attaches the sole canonical initial
progression instance. Failure returns `kind: "invalid"` with stable diagnostics; it never returns a
partially initialized aggregate or throws schema prose across the boundary.

Project Configuration V1 permits only local/player and server/team-or-session combinations. Generated
local registries contain local/player models. The platform mechanic registry contains server/team or
server/session models.

## Decisions and Execution Results

```ts
type HandlerDecision<State extends JsonObject, Outcome extends JsonObject> =
  | {
      readonly kind: "accepted";
      readonly nextState?: State;
      readonly outcome: Outcome;
      readonly domainEvents: readonly TypedRecord[];
      readonly effectIntents: readonly TypedRecord[];
      readonly progressionIntents: readonly ProgressionIntent[];
    }
  | { readonly kind: "no-op"; readonly outcome: Outcome }
  | { readonly kind: "rejected"; readonly outcome: Outcome };

type ExecutionResult<
  State extends JsonObject,
  Outcome extends JsonObject,
  Payload extends JsonObject,
  Kind extends AggregateKind,
> =
  | {
      readonly kind: "preflight-invalid";
      readonly diagnostics: readonly Diagnostic[];
    }
  | {
      readonly kind: "recorded";
      readonly aggregate: Aggregate<State, Kind>;
      readonly record: ExecutionRecord<State, Outcome, Payload, Kind>;
    };
```

The public generic order is exactly `ExecutionResult<State, Outcome, Payload, Kind>`, matching the
existing runtime. The execution record is the authority for its terminal, outcome or diagnostics,
events, effects, progression trace, input command, and prior/resulting state versions. Callers do not
reconstruct a second result from optional fields.

- Preflight invalidity has no aggregate or record and cannot be committed.
- Accepted requires at least one state change, progression change, domain event, or effect intent and
  advances `stateVersion` exactly once.
- No-op, rejected, and recorded execution-invalid preserve `stateVersion`.
- No-op contains no state replacement, event, effect, progression intent, or progression trace.
- Event/effect schemas and the outcome schema are validated before the recorded result is returned.
- Effect intents are durable post-commit evidence only; this feature adds no delivery worker.

Replay consumes the recorded command and observations, re-executes through the same model, and compares
the complete canonical record. It does not infer model, schema, or progression from caller-supplied
parallel arguments.

## Progression

```ts
interface ProgressionTransition<State extends JsonObject, Kind extends AggregateKind> {
  readonly transitionId: string;
  readonly targetNodeId: string;
  readonly from: readonly ProgressionStatus[];
  readonly to: ProgressionStatus;
  readonly priority: number;
  readonly trigger: "automatic" | "intent";
  readonly when?: (facts: {
    readonly aggregateState: State;
    readonly domainEvents: readonly TypedRecord[];
    readonly progression: ProgressionInstance;
  }) => boolean;
}

interface ProgressionDefinition<State extends JsonObject, Kind extends AggregateKind> {
  readonly aggregateKind: Kind;
  readonly graphId: string;
  readonly graphVersion: number;
  readonly nodes: readonly ProgressionNode[];
  readonly transitions: readonly ProgressionTransition<State, Kind>[];
}

declare function initialProgression<State extends JsonObject, Kind extends AggregateKind>(
  definition: ProgressionDefinition<State, Kind>,
): ProgressionInstance;
```

Each legal edge has one stable transition identity and owns `from`, `to`, target, priority, and trigger.
Automatic predicates see aggregate state, typed domain events, and current progression only. They are
not generic over one command payload or outcome, so heterogeneous commands can advance the same graph.

`initialProgression` is the sole constructor for the canonical initial instance. Initializers and host
adapters do not accept or duplicate progression state. Existing deterministic simultaneous rounds,
equal-priority conflict detection, cycle detection, transition limits, freezing, and ordinal ordering
remain.

## Clean-Break Validation

The implementation edits the existing runtime and progression APIs in place. It removes superseded
private assembly helpers and version-suffixed experimental types. There are no adapters between old and
corrected shapes. Type fixtures must reject duplicated schema identity, authority/kind mismatches,
unsafe erased registries, payload/outcome generic inversion, caller-supplied initial progression, and
parallel `revision` fields.
