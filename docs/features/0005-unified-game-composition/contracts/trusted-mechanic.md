# Contract: Trusted Mechanic

Trusted Mechanic is the closed boundary by which a verified release selects platform-owned
authoritative behavior. It is not a plugin API and never causes the server to import or execute release
bundle code.

## Release Binding

```ts
interface TrustedMechanicBinding {
  readonly id: string;
  readonly aggregateModel: string;
  readonly commands: readonly string[];
  readonly configuration: string;
  readonly projectionSchema: SchemaReference;
  readonly capabilities: readonly CapabilityRequirement[];
}
```

A Game Composition contains zero or one binding. The binding selects one data-only server model and
its trusted command contracts. Configuration references schema-validated content; projection schema
and capabilities resolve through the composition and Release Manifest inventory before mechanic lookup.

Release registration verifies immutable bytes, Release Format and Host API compatibility, inventory
relationships, exact model and command contracts, every schema digest, the trusted outcome shape, and
canonical configuration. It stores only the release ID, validated descriptors, and safe initialization
configuration, then discards the release bytes. Server models with effects are rejected.

## Closed Adapter Contract

```ts
interface TrustedMechanicAdapter<Kind extends "team" | "session"> {
  readonly id: string;
  readonly model: ExecutableAggregateModel<Kind>;
  readonly configurationSchema: RuntimeSchema<JsonObject>;
  readonly projectionSchema: RuntimeSchema<JsonObject>;
  validateBinding(input: {
    readonly binding: TrustedMechanicBinding;
    readonly composition: GameComposition;
    readonly configuration: unknown;
  }): MechanicBindingValidation;
  execute(input: {
    readonly participant: AuthorizedParticipant;
    readonly aggregate: Aggregate<JsonObject, Kind>;
    readonly command: SyncCommand;
    readonly observations: readonly PersistedObservation[];
  }): MechanicExecution<Kind>;
  project(input: {
    readonly participant: AuthorizedParticipant;
    readonly aggregate: Aggregate<JsonObject, Kind>;
  }): MechanicProjection;
}

interface MechanicExecution<Kind extends "team" | "session"> {
  readonly terminal: "accepted" | "no-op" | "rejected" | "invalid";
  readonly outcomeCode: string;
  readonly aggregateBefore: Aggregate<JsonObject, Kind>;
  readonly aggregateAfter: Aggregate<JsonObject, Kind>;
  readonly domainEvents: readonly JsonObject[];
  readonly capabilityEvidence: readonly CapabilityEvidence[];
}
```

`execute` is the only public authoritative decision operation. The adapter privately discovers and
validates the target, authority, command payload, and observations, then either returns a complete
terminal result or invokes the exact-version deterministic model. Callers cannot split authorization
from execution or persist a decision made against different aggregate state.

The registry stores adapters behind a constructed erased wrapper that checks the binding-selected
authority and aggregate kind. It does not cast a typed adapter to another kind. Each adapter owns the
resolved model, initializer, handlers, and state, payload, outcome, event, effect, configuration, and
projection validators. Every validator declares the digest of the exact inventoried schema bytes it
implements.

Binding validation requires exact agreement for model ID, server authority, aggregate kind, state and
initialization schemas, event and effect declarations, selected commands, command payload and outcome
schemas, configuration schema, projection schema, and derived capability requirements. Server
progression, source paths, package names, URLs, dynamic imports, and open metadata are forbidden.

Session creation calls `model.initialize(validated.initializationInput)`. The input derives only from
validated release configuration. Operator labels remain metadata outside canonical aggregate state.

## Execution and Results

The adapter evaluates every command against the latest locked aggregate. Domain-aware policy may accept
a stale command when its target is still available. An already-satisfied target returns a stable no-op
at the current version. Invalid participant authority, target, payload, or observations returns an
explicit rejected or invalid terminal without mutation.

The adapter preserves Sync names and values directly:

```text
SyncCommand.expectedStateVersion -> RuntimeCommand.expectedStateVersion
Aggregate.stateVersion           -> SyncCommandResult.resultingStateVersion
```

Trusted command outcomes are exact `{ code }` objects. Accepted, no-op, and rejected records copy the
code unchanged to `SyncCommandResult.outcomeCode`. Recorded execution invalidity uses the executor's
deterministic primary diagnostic while retaining the full diagnostic list in the authoritative record.
Additional outcome fields are rejected at registration.

The service serializes the participant row, invokes `execute` once, persists the returned aggregate,
events, terminal result, and exact capability evidence in one transaction, and constructs the response
from that result. It owns locking and transaction orchestration but no domain conflict decision.
Participant-scoped idempotency is keyed by `(sessionId, participantId, commandId)`; exact retry returns
the original result and changed reuse conflicts.

## Projection

`project` constructs one complete participant-authorized `SharedProjection`, including aggregate,
projection schema, and payload identity. The adapter validates the payload through the exact
release-matched schema. The service does not stamp or repair a partial projection. The player repeats
the release, aggregate, schema, and payload checks with the same pure resolver before persistence and
before component exposure.

## Target Discovery

The first registry entry is `plotpoint.location.target-discovery`. It requires the platform-owned team
model and command of the same ID, target configuration conforming to
`plotpoint.location.target-config`, Foreground Location Capability, and the declared team projection.

Private target discovery verifies participant and aggregate authority, configured target, zone, age,
and horizontal accuracy. It transforms accepted coordinates into a coordinate-free observation fact
before deterministic execution. Raw coordinates may enter the authenticated request digest but never
receipts, journals, projections, operational events, logs, or reports. The result exposes exact generic
`captured`, `consumed`, `denied`, or `expired` capability evidence.

## Failure and Evolution

Stable failures distinguish unknown mechanic, invalid binding or configuration, model, command, or
schema mismatch, invalid projection, and changed registration reuse. Diagnostics include only required
logical IDs, never configuration values, bundle source, host paths, coordinates, or parser prose.

A new mechanic requires another explicit registry identity. General third-party loading,
release-authored server code, remote plugin transport, background effect delivery, and cross-aggregate
orchestration remain out of scope. This pre-release correction retains no public authorization phase,
compatibility adapter, or legacy reader.
