# Contract: Runtime Root API

## Compatibility Surface

Gate 1 exposes named values and types only from `@plotpoint/runtime`. Deep imports are unsupported. The package has no runtime dependencies and performs no persistence, network, clock, randomness, device, or effect operation.

The declarations below define required semantics; implementation may split internal files without expanding the root compatibility surface.

## Durable Types

```ts
export type JsonPrimitive = null | boolean | number | string;
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export type AggregateKind = "player" | "team" | "session";
export type AggregateAuthority = "local" | "server";

export interface ProgressionInstance {
  readonly graphId: string;
  readonly graphVersion: number;
  readonly nodes: readonly ProgressionNodeState[];
}

export interface Aggregate<State extends JsonObject = JsonObject> {
  readonly kind: AggregateKind;
  readonly id: string;
  readonly schemaVersion: number;
  readonly stateVersion: number;
  readonly authority: AggregateAuthority;
  readonly state: State;
  readonly progression?: ProgressionInstance;
}

export interface Command<Payload extends JsonObject = JsonObject> {
  readonly id: string;
  readonly type: string;
  readonly target: { readonly kind: AggregateKind; readonly id: string };
  readonly expectedStateVersion: number;
  readonly payload: Payload;
}

export interface Observation<Value extends JsonValue = JsonValue> {
  readonly kind: string;
  readonly key: string;
  readonly value: Value;
}
```

Numbers in durable values must be finite. Aggregate schema versions are positive safe integers; aggregate state versions and command expected versions are non-negative safe integers.

## Command Definition

```ts
export interface TransitionContext {
  take<Value extends JsonValue>(kind: string, key: string): Value;
}

export interface AcceptedDecision<State extends JsonObject, Outcome extends JsonObject> {
  readonly kind: "accepted";
  readonly nextState: State;
  readonly outcome: Outcome;
  readonly domainEvents: readonly JsonObject[];
  readonly effectIntents: readonly JsonObject[];
  readonly progressionIntents: readonly ProgressionIntent[];
}

export interface RejectedDecision<Outcome extends JsonObject> {
  readonly kind: "rejected";
  readonly outcome: Outcome;
}

export type HandlerDecision<State extends JsonObject, Outcome extends JsonObject> =
  AcceptedDecision<State, Outcome> | RejectedDecision<Outcome>;

export interface CommandDefinition<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
> {
  readonly definitionId: string;
  readonly commandType: string;
  readonly aggregateKind: AggregateKind;
  readonly handle: (
    aggregate: Readonly<Aggregate<State>>,
    command: Readonly<Command<Payload>>,
    context: TransitionContext,
  ) => HandlerDecision<State, Outcome>;
}

export function defineCommand<State, Payload, Outcome>(
  definition: CommandDefinition<State, Payload, Outcome>,
): CommandDefinition<State, Payload, Outcome>;
```

Generic parameters are constrained to canonical objects. Definitions and handlers are explicit immutable values, not registrations in a mutable runtime registry. Handlers are synchronous; a promise-shaped result is invalid.

## Execution

```ts
export interface RuntimePolicy {
  readonly contractVersion: 1;
  readonly maxCanonicalDepth: number;
  readonly maxCanonicalNodes: number;
  readonly maxAutomaticTransitions: number;
}

export interface ExecuteCommandInput<State, Payload, Outcome> {
  readonly definition: CommandDefinition<State, Payload, Outcome>;
  readonly aggregate: Aggregate<State>;
  readonly command: Command<Payload>;
  readonly observations: readonly Observation[];
  readonly policy?: Partial<RuntimePolicy>;
  readonly progression?: ProgressionDefinition<State, Payload, Outcome>;
}

export type ExecutionResult<State, Outcome> =
  | AcceptedExecution<State, Outcome>
  | NoOpExecution<State, Outcome>
  | RejectedExecution<State, Outcome>
  | InvalidExecution<State>;

export function executeCommand<State, Payload, Outcome>(
  input: ExecuteCommandInput<State, Payload, Outcome>,
): ExecutionResult<State, Outcome>;
```

### Required Evaluation Order

1. Resolve and validate the runtime policy.
2. Validate and canonicalize the aggregate, command, observations, definition identity, and progression definition/state.
3. Verify command type and exact target kind/identity.
4. Verify expected state version before invoking the handler or consuming observations.
5. Invoke the handler with detached frozen inputs and an ordered observation cursor.
6. Convert unexpected throws to `handler-threw`; never persist stack, timing, or host error prose.
7. Validate and canonicalize the handler decision.
8. For rejection, return the original canonical aggregate and rejection outcome.
9. For acceptance, apply direct progression intents, then run automatic progression to stability.
10. If progression fails, return invalid with the original aggregate and non-committable attempted trace.
11. Compare final state and progression with the original. A true no-op preserves the version and permits no events, effects, or progression work.
12. For a state change, increment the runtime-owned state version exactly once, guarding overflow.
13. Canonicalize the complete execution record and return the committable result.

## Result Invariants

- `accepted`: contains a new aggregate with `stateVersion + 1`, semantic outcome, ordered events, ordered effect intents, progression trace, and execution record.
- `no-op`: contains the original canonical aggregate and outcome; no events, effects, or progression trace.
- `rejected`: contains the original canonical aggregate and rejection outcome; no events, effects, or progression evaluation.
- `invalid`: contains the original canonical aggregate, one or more stable diagnostics, and any attempted trace strictly marked non-committable.
- No result executes an effect.
- Candidate events and effects are absent from the committable surface when later validation or progression fails.

## Canonicalization API

```ts
export interface CanonicalValue<Value extends JsonValue = JsonValue> {
  readonly value: Value;
  readonly text: string;
}

export type CanonicalizeResult<Value extends JsonValue = JsonValue> =
  | { readonly kind: "valid"; readonly canonical: CanonicalValue<Value> }
  | { readonly kind: "invalid"; readonly diagnostic: Diagnostic };

export function canonicalizeValue(
  value: unknown,
  limits?: Pick<RuntimePolicy, "maxCanonicalDepth" | "maxCanonicalNodes">,
): CanonicalizeResult;
```

Validation must inspect property descriptors and never invoke accessors or `toJSON`. Error details use a JSON-pointer-like value path. A canonical value returned to a handler or caller is detached and recursively frozen.

## Diagnostics

```ts
export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly details: JsonObject;
}
```

Codes and detail fields are compatibility data; human prose is rendered separately. Expected invalid input returns a diagnostic result rather than throwing. Programmer misuse may throw only where no meaningful execution result can exist, such as attempting to define a command with a malformed static definition.

## Ambient Authority

The root API provides no clock, random generator, identifier source, persistence adapter, network client, device adapter, or effect executor. All external results arrive through `observations`. This contract does not claim to sandbox a handler that deliberately closes over JavaScript globals; compiler validation and runtime isolation are later concerns.
