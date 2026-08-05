# Contract: Project Configuration V2 and Game Composition V1

## Compatibility Surface

Project Configuration V2 is the sole authored composition input. It remains strict UTF-8 JSON with
no comments, duplicate keys, unknown fields, executable configuration, discovery, or globs. Arrays are
author-readable and semantically unordered; the compiler ordinally orders every generated registry and
catalog collection.

V2 is a coordinated pre-release replacement for Project Configuration V1. The compiler does not
silently interpret one as the other. A V2 release requires Host API 1.2 and contains Game Composition
V1 at `composition/game.v1.json`, inventoried as Release Format V1 application content.

## Project Root

```ts
interface ProjectConfigurationV2 {
  readonly projectFormatVersion: 2;
  readonly environment: "web";
  readonly hostApi: { readonly major: 1; readonly minimumMinor: number }; // minimumMinor >= 2
  readonly application: ApplicationRegistration;
  readonly aggregateModels: readonly AggregateModelRegistration[];
  readonly commands: readonly CommandRegistration[];
  readonly aggregateSchemas: readonly AggregateSchemaRegistration[];
  readonly schemas: readonly SchemaRegistration[];
  readonly progressions: readonly ProgressionRegistration[];
  readonly components: readonly ComponentRegistration[];
  readonly content: readonly ContentRegistration[];
  readonly assets: readonly AssetRegistration[];
  readonly trustedMechanic?: TrustedMechanicRegistration;
}

interface SourceExport {
  readonly source: string;
  readonly export: string;
}

interface DependencySelection {
  readonly commands: readonly string[];
  readonly content: readonly string[];
  readonly assets: readonly string[];
  readonly capabilities: readonly CapabilityRequirement[];
  readonly sharedProjection?: SchemaReference;
}

interface SchemaReference {
  readonly id: string;
  readonly version: number;
}

interface ApplicationRegistration {
  readonly definition: SourceExport;
  readonly components: readonly string[];
}
```

There is no author-selected logic root. Aggregate-model, command, and progression registrations close
the logic graph; the application and selected component registrations close the presentation graph.
The compiler generates both executable roots.

## Aggregate and Command Registrations

```ts
interface AggregateModelContract {
  readonly id: string;
  readonly kind: "player" | "team" | "session";
  readonly aggregateSchema: string;
  readonly commands: readonly string[];
  readonly events: readonly { readonly type: string; readonly schema: string }[];
  readonly effects: readonly { readonly type: string; readonly schema: string }[];
}

interface LocalAggregateModelRegistration extends AggregateModelContract {
  readonly authority: "local";
  readonly initializer: SourceExport;
  readonly initializationContent?: string;
  readonly progression?: string;
}

interface ServerAggregateModelContract extends AggregateModelContract {
  readonly authority: "server";
  readonly trustedMechanic: { readonly id: string; readonly version: number };
  readonly initializationSchema: string;
}

type AggregateModelRegistration = LocalAggregateModelRegistration | ServerAggregateModelContract;

interface CommandContract {
  readonly id: string;
  readonly type: string;
  readonly aggregateModel: string;
  readonly payloadSchema: string;
  readonly outcomeSchema: string;
}

interface LocalCommandRegistration extends CommandContract {
  readonly execution: "local";
  readonly definition: SourceExport;
}

interface TrustedCommandContract extends CommandContract {
  readonly execution: "trusted-mechanic";
  readonly trustedMechanic: { readonly id: string; readonly version: number };
}

type CommandRegistration = LocalCommandRegistration | TrustedCommandContract;

interface ProgressionRegistration {
  readonly id: string;
  readonly version: number;
  readonly definition: SourceExport;
  readonly aggregateModel: string;
}
```

Every playable release declares exactly one source-backed local player model used by Runtime Bootstrap
V2. A local command has a release definition. Within one model, command type is unique even when
registration IDs differ. A server model and its commands are data-only contracts:
they may exist only with the release's one trusted-mechanic binding, declare the server initializer's
input schema, and contain no initializer, handler, progression predicate, or other server-executable
release source. The matching platform adapter owns a resolved model with the exact identities and
digest-bound validators. A progression belongs only to a local model, and that model owns at most one.
Model event/effect types are unique and resolve to registered schemas.

## Components and Resources

```ts
interface ComponentRegistration extends DependencySelection {
  readonly id: string;
  readonly implementation: SourceExport;
}

interface AggregateSchemaRegistration {
  readonly id: string;
  readonly kind: "player" | "team" | "session";
  readonly version: number;
  readonly path: string;
}

interface SchemaRegistration {
  readonly id: string;
  readonly version: number;
  readonly path: string;
}

interface ContentRegistration {
  readonly id: string;
  readonly path: string;
  readonly schema?: string;
}

interface AssetRegistration {
  readonly id: string;
  readonly path: string;
  readonly releasePath: string;
}

interface CapabilityRequirement {
  readonly id: string;
  readonly major: number;
  readonly minimumMinor: number;
}
```

The application can only mount its selected pre-scoped components. Component selections are the
platform-visible dependency boundary; a component context resolves only its selected IDs. A declared
shared projection must equal the optional trusted mechanic's projection schema ID/version, and any
trusted command dependency requires that projection declaration. The release-wide manifest capability
list is the compatible ordinal union of component and optional trusted-mechanic requirements.

## Trusted Mechanic Registration

```ts
interface TrustedMechanicRegistration {
  readonly id: string;
  readonly version: number;
  readonly aggregateModel: string;
  readonly commands: readonly string[];
  readonly configuration: string;
  readonly projectionSchema: SchemaReference;
  readonly capabilities: readonly CapabilityRequirement[];
}
```

Project Configuration V2 permits zero or one binding. Its model must be a server data contract tied to
the same mechanic identity/version, each command must be a trusted command contract on that model,
configuration must name schema-validated content, and the projection schema ID/version must be
registered. No server initializer, handler, progression predicate, source export, or package identifier
is allowed.

## Application Definition

Presentation code exports a value created through the release-facing helper:

```ts
interface GameApplicationDefinitionV1 {
  readonly contractVersion: 1;
  mount(
    context: GameApplicationContextV1,
  ): GameApplicationHandleV1 | Promise<GameApplicationHandleV1>;
}

interface GameApplicationHandleV1 {
  unmount(): void | Promise<void>;
}

declare function defineGameApplicationV1(
  definition: GameApplicationDefinitionV1,
): GameApplicationDefinitionV1;
```

The helper checks and freezes data properties without invoking `mount`. Compiler definition inspection
requires the exact contract version and function shape. Application modules must not perform DOM or
host work during module evaluation; that work begins only inside `mount`. At runtime, the player
requires the exact handle shape and invokes `unmount` exactly once before a remount or view disposal.
A player-owned mount scope accepts component cleanup callbacks at resource-acquisition time and hides
them from the application. It invokes those callbacks once in reverse order if component/application
mount throws or returns an invalid application handle, and after a valid application unmount even when
that unmount or one callback fails.

## Game Composition Catalog

```ts
interface GameCompositionV1 {
  readonly version: 1;
  readonly requiredHostApi: { readonly major: 1; readonly minimumMinor: number };
  readonly application: {
    readonly contractVersion: 1;
    readonly export: "application";
    readonly components: readonly string[];
  };
  readonly aggregateModels: readonly AggregateModelDescriptorV1[];
  readonly commands: readonly CommandDescriptorV1[];
  readonly progressions: readonly ProgressionDescriptorV2[];
  readonly components: readonly ComponentDescriptorV1[];
  readonly resources: readonly ResourceBindingV1[];
  readonly capabilities: readonly CapabilityRequirement[];
  readonly trustedMechanic?: TrustedMechanicBindingV1;
}

interface AggregateModelDescriptorBaseV1 {
  readonly id: string;
  readonly kind: "player" | "team" | "session";
  readonly aggregateSchema: SchemaReference;
  readonly commands: readonly string[];
  readonly events: readonly { readonly type: string; readonly schema: SchemaReference }[];
  readonly effects: readonly { readonly type: string; readonly schema: SchemaReference }[];
}

type AggregateModelDescriptorV1 =
  | (AggregateModelDescriptorBaseV1 & {
      readonly authority: "local";
      readonly export: string;
      readonly initializationContent?: string;
      readonly progression?: string;
    })
  | (AggregateModelDescriptorBaseV1 & {
      readonly authority: "server";
      readonly trustedMechanic: { readonly id: string; readonly version: number };
      readonly initializationSchema: SchemaReference;
    });

type CommandDescriptorV1 =
  | {
      readonly id: string;
      readonly type: string;
      readonly aggregateModel: string;
      readonly payloadSchema: SchemaReference;
      readonly outcomeSchema: SchemaReference;
      readonly execution: "local";
    }
  | {
      readonly id: string;
      readonly type: string;
      readonly aggregateModel: string;
      readonly payloadSchema: SchemaReference;
      readonly outcomeSchema: SchemaReference;
      readonly execution: "trusted-mechanic";
      readonly trustedMechanic: { readonly id: string; readonly version: number };
    };

interface ProgressionDescriptorV2 {
  readonly id: string;
  readonly version: number;
  readonly aggregateModel: string;
}

interface ComponentDescriptorV1 extends DependencySelection {
  readonly id: string;
  readonly export: string;
}

interface ResourceBindingBaseV1 {
  readonly id: string;
  readonly path: string;
}

type ResourceBindingV1 =
  | (ResourceBindingBaseV1 & {
      readonly role: "aggregate-schema" | "schema";
      readonly schemaVersion: number;
    })
  | (ResourceBindingBaseV1 & {
      readonly role: "content";
      readonly schema?: SchemaReference;
    })
  | (ResourceBindingBaseV1 & {
      readonly role: "asset" | "progression-descriptor" | "component-descriptor";
    });
```

Descriptors above are the complete closed catalog shapes; they carry logical relationships and local
model/component export names, while resources carry exact artifact paths. Digests and byte lengths remain
authoritative in the Release Format V1 manifest inventory and must match each catalog path. A schema
reference resolves only when its ID selects a schema-role resource with the same required version;
that resource path selects the exact manifest digest. All objects are closed canonical JSON. The
compiler proves catalog/generated-registry agreement while producing the release, and the player checks
it when loading trusted executable bundles. The API verifies catalog/inventory/data-descriptor agreement
without importing or claiming to inspect JavaScript exports.

## Public Inspection

The low-level Release Format V1 `inspectRelease` result stays game-agnostic. After opening and validating
the fixed catalog entry, the compiler CLI layers this versioned composition-aware result over it:

```ts
interface GameReleaseInspectionV1 {
  readonly version: 1;
  readonly release: InspectedRelease;
  readonly gameComposition:
    | { readonly kind: "absent" }
    | { readonly kind: "game-composition-v1"; readonly catalog: GameCompositionV1 };
}
```

`plotpoint inspect <release> --json` emits this closed shape; human output summarizes the same catalog
IDs, Host API requirement, resource bindings, and optional trusted mechanic. A Host API 1.2 artifact
whose Game Composition V1 is missing, invalid, or disagrees with the manifest returns an invalid
inspection rather than `absent`. Historical artifacts with no composition requirement remain
inspectable as `absent`.

## Generated Bundle Roots

The compiler emits conceptually equivalent named exports:

```ts
// bundles/logic.js
export const aggregateModels: Readonly<Record<string, ExecutableAggregateModelV2<"player">>>; // local only, compiler-generated state-narrowing wrappers

// bundles/presentation.js
export const application: GameApplicationDefinitionV1;
export const components: Readonly<Record<string, ComponentImplementationV1>>;
```

There are no author-maintained default registries. Local registry keys must equal their catalog IDs.
The compiler stores a state-specific model in this heterogeneous registry only through a generated
`bindExecutableAggregateModelV2` wrapper that validates erased JSON state with the exact `stateSchema`
before invoking typed command or progression code; no state-specific function is widened directly.
Progression definitions are closed inside their owning executable model rather than exported through a
second selectable runtime registry.
Server model/command contracts exist only in the data catalog and are matched to a platform-owned
resolved model during release registration. The bundles remain closed trusted release graphs with no
external imports after bundling.

## Validation Failures

Compilation fails deterministically for:

- missing, duplicate, ambiguous, case-aliased, or wrong-role IDs and paths;
- a malformed application definition or missing configured export;
- a model/command/progression/schema kind, digest, or identity mismatch, including duplicate command
  type within one model;
- a component dependency not present in the project, an unversioned or foreign shared-projection
  schema, or a trusted command dependency without that projection;
- more than one trusted mechanic, a server model with executable release source, or a mechanic using a
  local model, foreign command, invalid config, unknown projection schema, or incompatible capability
  version;
- catalog, generated registry, descriptor, inventory path, or manifest disagreement; or
- top-level presentation work that prevents bounded definition inspection.

These checks prove the supported composition and import boundary. They do not prove arbitrary trusted
JavaScript lacks ambient access inside the WebView.
