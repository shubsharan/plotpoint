# Contract: Trusted Mechanic V1

Trusted Mechanic V1 is the closed boundary by which a verified release selects platform-owned
authoritative behavior. It is not a third-party plugin API and never causes the server to import or
execute release bundle code.

## Release Binding

Game Composition V1 carries:

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

Game Composition V1 contains zero or one binding. Its aggregate model and commands are data-only
server contracts tied to this exact identity/version. Configuration must be one schema-validated
content resource, and projection schema ID/version plus capabilities must exist in the composition.

The fixed catalog path plus resource mapping lets the service find configuration without reconstructing
compiler-private hexadecimal paths. Artifact verification and catalog/inventory agreement occur before
mechanic lookup.

## Platform Registry

The API composition root provides a closed immutable map conceptually equivalent to:

```ts
interface TrustedMechanicAdapterV1 {
  readonly id: string;
  readonly version: number;
  readonly model: ExecutableAggregateModelV2<"team"> | ExecutableAggregateModelV2<"session">;
  readonly configurationSchema: RuntimeSchemaV2<JsonObject>;
  readonly projectionSchema: RuntimeSchemaV2<JsonObject>;
  validateBinding(input: {
    readonly binding: TrustedMechanicBindingV1;
    readonly composition: GameCompositionV1;
    readonly configuration: object;
  }): ValidatedMechanicConfiguration | MechanicDiagnostic;
  initializationInput(configuration: ValidatedMechanicConfiguration): JsonObject;
  authorize(input: {
    readonly participant: AuthorizedParticipant;
    readonly command: SyncCommandV1;
  }): AuthorizedModelCommand | MechanicDecision;
  project(input: {
    readonly participant: AuthorizedParticipant;
    readonly aggregate: AggregateInstanceV2;
  }): SharedProjectionV1;
}
```

The adapter owns the complete state-specific platform `ResolvedAggregateModelV2` and publishes only its
`ExecutableAggregateModelV2` state-narrowing wrapper: initializer, command handlers, and
state/payload/outcome/event/effect validators remain closed behind that wrapper. It also owns
configuration and projection validators.
Every validator declares the digest of the exact inventoried schema bytes it implements; identity and
version alone are insufficient. The model identity, kind, schema digests, command registrations, and
event/effect declarations must exactly match the release's data-only server contract. Its `progression`
must be absent in V1 so the adapter cannot add authoritative behavior missing from the composition.
Its `initializationSchema` is required and must match the server contract's declared initialization
schema and manifest digest.

`configurationSchema` must match the schema attached to the binding's content resource, and
`projectionSchema` must match the binding's registered projection schema; both compare ID, required
version, and manifest digest. Every `project` result is validated through that projection validator and
stamped with the same ID/version before persistence.

Session creation obtains explicit input from `initializationInput` and calls the model initializer.
The input derives only from the validated release configuration. Shared Session API V1's `teamLabel`
is operator metadata outside canonical aggregate state; there is no mechanic-specific creation-input
bag or undocumented route-to-adapter mapping.
Authorized commands execute that model through Runtime Model V2 inside the existing PostgreSQL
transaction. Adapter decisions outside the runtime are limited to authorization and observation-policy
failures that map to explicit stable terminals. The adapter has no dynamic package name, source path,
URL, or open metadata map.

To preserve Sync V1 without truncating trusted command outcomes, every trusted-command outcome schema is
the exact closed `{ code: StableCode }` shape. Accepted, no-op, and rejected results copy
`outcome.code` unchanged to `SyncCommandResultV1.outcomeCode`. Execution-invalid results use the
executor's deterministic primary diagnostic code; the complete diagnostic list remains in the
authoritative execution record. Thus the durable participant-visible shared terminal is exactly
`terminal + outcomeCode + resultingStateVersion + decisionPosition`, while local Runtime Model V2 may
continue to use richer schema-validated outcome objects.

```ts
type StableCode = string;

interface TrustedOutcomeV1 {
  readonly code: StableCode;
}
```

At validation, `StableCode` is constrained to a canonical string matching
`^[a-z][a-z0-9-]{0,63}$` and enumerated by the exact trusted outcome schema; it is never free-form error
text. Stable codes remain participant-visible Sync V1 data but are not automatically safe for Game Play
Report V2, which excludes command outcomes.

## Target Discovery V1

The first registry entry is `plotpoint.hunt.target-discovery` version `1`. Its binding requires:

- one platform-owned resolved team model matching the release's server model contract;
- `plotpoint.hunt.target-discovery.v1` as a trusted command contract implemented by that model;
- target configuration conforming to `plotpoint.hunt.target-config.v1`;
- Foreground Location Capability V1; and
- a complete authorized team projection schema.

The adapter resolves persisted foreground observations attached by the host, validates configured
zone, age, and horizontal accuracy, and supplies explicit canonical facts to the registered model
command. Coordinates may enter the authenticated request digest but are not retained in receipts,
journals, projections, operational events, logs, or reports. Trusted-client evidence remains distinct
from device attestation.

The same team aggregate row, domain-aware stale acceptance, exact receipt, complete snapshot, and
redaction semantics from ADR 0005 remain. Hunt policy is no longer selected by a hard-coded content ID
or undeclared command in the API.

## Registration

Release registration succeeds only when:

1. complete bytes match the expected immutable release ID;
2. Release Format V1 and Host API compatibility are valid;
3. Game Composition V1 agrees with its manifest inventory and closed data descriptors; the service
   does not claim to inspect executable bundle exports;
4. when present, the trusted mechanic identity/version exists in the platform registry;
5. its adapter model and digest-bound validators match every declared model, command, schema,
   event/effect, config, projection, and capability relationship, every trusted outcome has exact
   `{ code: StableCode }` shape, and server progression is absent;
6. selected configuration is canonical and schema-valid; and
7. the stored registration digest is either absent or exactly identical.

The service stores the release ID, validated composition/mechanic descriptors, and canonical safe
configuration required to initialize sessions. Complete release bytes and executable bundles are
discarded after verification.

## Failure and Evolution

Stable failures distinguish unknown mechanic, unsupported version, invalid binding, invalid config,
model/command/schema mismatch, and changed release-registration reuse. Diagnostics contain only the
minimum logical IDs and never configuration values, bundle source, host paths, or parser prose.

A new platform mechanic or incompatible mechanic contract requires an explicit registry entry and
version. General third-party loading, arbitrary server code, remote plugin transport, background effect
delivery, and cross-aggregate orchestration are not part of Trusted Mechanic V1.
