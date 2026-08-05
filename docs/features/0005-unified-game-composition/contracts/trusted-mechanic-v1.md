# Contract: Trusted Mechanic V1

Trusted Mechanic V1 is the closed boundary by which a verified release selects platform-owned
authoritative behavior. It is not a plugin API and never causes the server to import or execute release
bundle code.

## Release Binding

```ts
interface TrustedMechanicBindingV1 {
  readonly id: string;
  readonly version: number;
  readonly aggregateModel: string;
  readonly commands: readonly string[];
  readonly configuration: string;
  readonly projectionSchema: SchemaReference;
  readonly capabilities: readonly CapabilityRequirement[];
}
```

Game Composition V1 contains zero or one binding. It alone selects one data-only server model and its
trusted command contracts; those descriptors do not repeat mechanic identity. Configuration references
schema-validated content. Projection schema and capabilities resolve through the composition and
Release Manifest V1 inventory before mechanic lookup.

## Closed Adapter Contract

```ts
interface MechanicDiagnosticV1 {
  readonly code:
    | "invalid-binding"
    | "invalid-configuration"
    | "model-contract-mismatch"
    | "command-contract-mismatch"
    | "schema-contract-mismatch"
    | "projection-invalid";
  readonly logicalIds: readonly string[];
}

interface ValidatedMechanicBindingV1 {
  readonly binding: TrustedMechanicBindingV1;
  readonly configuration: JsonObject;
  readonly initializationInput: JsonObject;
}

type MechanicBindingValidationV1 =
  | { readonly kind: "valid"; readonly value: ValidatedMechanicBindingV1 }
  | { readonly kind: "invalid"; readonly diagnostic: MechanicDiagnosticV1 };

type MechanicAuthorizationV1<Kind extends "team" | "session"> =
  | {
      readonly kind: "authorized";
      readonly command: RuntimeCommand<JsonObject, Kind>;
      readonly observations: readonly Observation[];
    }
  | {
      readonly kind: "rejected";
      readonly outcome: TrustedOutcomeV1;
    }
  | {
      readonly kind: "invalid";
      readonly diagnostics: readonly Diagnostic[];
    };

type MechanicProjectionV1 =
  | { readonly kind: "projected"; readonly projection: SharedProjectionV1 }
  | { readonly kind: "invalid"; readonly diagnostic: MechanicDiagnosticV1 };

interface TrustedMechanicAdapterV1<Kind extends "team" | "session"> {
  readonly id: string;
  readonly version: number;
  readonly model: ExecutableAggregateModel<Kind>;
  readonly configurationSchema: RuntimeSchema<JsonObject>;
  readonly projectionSchema: RuntimeSchema<JsonObject>;
  validateBinding(input: {
    readonly binding: TrustedMechanicBindingV1;
    readonly composition: GameCompositionV1;
    readonly configuration: unknown;
  }): MechanicBindingValidationV1;
  authorize(input: {
    readonly participant: AuthorizedParticipantV1;
    readonly command: SyncCommandV1;
    readonly observations: readonly PersistedObservationV1[];
  }): MechanicAuthorizationV1<Kind>;
  project(input: {
    readonly participant: AuthorizedParticipantV1;
    readonly aggregate: Aggregate<JsonObject, Kind>;
  }): MechanicProjectionV1;
}
```

Every adapter operation has a closed result. Binding validation returns the validated canonical
configuration and exact initializer input together, or one safe diagnostic. Authorization returns a
fully formed runtime command plus transformed explicit observations, or an explicit rejected/invalid
terminal. Projection returns one complete `SharedProjectionV1` or an explicit failure. There are no
placeholder `ValidatedMechanicConfiguration`, `AuthorizedModelCommand`, `MechanicDecision`, or
partially described aggregate types at this boundary.

The platform registry stores adapters behind a constructed erased wrapper that first checks the
binding-selected authority/kind. It does not cast one typed adapter into another. The adapter owns the
complete state-specific resolved model, initializer, handlers, and state/payload/outcome/event/effect
validators. Every validator declares the digest of the exact inventoried schema bytes it implements.

Binding validation requires exact agreement for model ID, server authority, team/session kind, state
and initialization schemas, event/effect declarations, selected commands, command payload/outcome
schemas, configuration schema, projection schema, and derived capability requirements. Server
progression is absent. No server source path, package name, URL, dynamic import, or open metadata is
accepted.

Session creation calls `model.initialize(validated.initializationInput)`. The input derives only from
validated release configuration. Operator `teamLabel` remains metadata outside canonical aggregate
state and never enters an implicit mechanic input bag.

## State-Version and Outcome Mapping

The adapter preserves Sync V1 names and values directly:

```text
SyncCommandV1.expectedStateVersion -> RuntimeCommand.expectedStateVersion
Aggregate.stateVersion             -> SyncCommandResultV1.resultingStateVersion
```

There is no revision field or translation layer. Domain-aware stale acceptance remains adapter policy,
but any authorized command sent to the runtime carries the original expected state version and explicit
observation facts.

Every trusted-command outcome schema is the exact closed shape:

```ts
interface TrustedOutcomeV1 {
  readonly code: StableCode;
}
```

`StableCode` matches `^[a-z][a-z0-9-]{0,63}$` and is enumerated by the command's schema. Accepted,
no-op, and rejected runtime records copy `outcome.code` unchanged to
`SyncCommandResultV1.outcomeCode`. Recorded execution invalidity uses the executor's deterministic
primary diagnostic; the full diagnostic list remains in the authoritative record. Additional outcome
fields are rejected at release registration rather than truncated.

## Projection

`project` constructs the complete participant-authorized `SharedProjectionV1`, including its projection
identity, schema ID/version, and payload. The adapter validates the payload through the exact
release-matched projection schema before returning `kind: "projected"`. The service does not stamp or
repair a partial projection after the adapter returns. The player independently checks the same schema
identity/version, manifest digest, and payload before persistence or component exposure.

## Target Discovery V1

The first closed registry entry is `plotpoint.location.target-discovery` version `1`. It requires one
platform-owned team model, command `plotpoint.location.target-discovery.v1`, target configuration conforming
to `plotpoint.location.target-config.v1`, Foreground Location Capability V1, and a complete authorized team
projection schema.

The adapter resolves persisted foreground observations, validates configured zone, age, and horizontal
accuracy, and supplies canonical facts to the runtime command. Coordinates may enter the authenticated
request digest but are not retained in receipts, journals, projections, operational events, logs, or
reports. Trusted-client evidence remains distinct from device attestation.

## Registration and Failure

Release registration verifies immutable bytes, Release Format V1, Host API compatibility, mandatory
Game Composition V1, inventory relationships, the exact adapter identity/version, all digest-bound
model/command/config/projection contracts, the trusted outcome shape, and canonical configuration. It
stores the release ID, validated descriptors, and safe initialization configuration, then discards
release bytes. It never imports executable release roots.

Stable failures distinguish unknown mechanic, unsupported version, invalid binding/configuration,
model/command/schema mismatch, invalid projection, and changed registration reuse. Diagnostics include
only required logical IDs and never configuration values, bundle source, host paths, coordinates, or
parser prose.

A new mechanic or incompatible mechanic behavior requires another explicit registry identity/version.
General third-party loading, release-authored server code, remote plugin transport, background effect
delivery, and cross-aggregate orchestration remain out of scope.
