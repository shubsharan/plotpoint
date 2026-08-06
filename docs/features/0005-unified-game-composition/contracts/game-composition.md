# Contract: Project Configuration and Game Composition

## Aggregate Schema Identity Amendment

Aggregate schema inventory entries contain logical schema ID, artifact path, and exact digest only.
`schemaVersion`, `schema_version`, aggregate manifest versions, and equivalent generation counters are
invalid. Schema agreement is derived from the verified pinned release, logical ID, and exact inventoried
bytes. Server aggregate models declaring any effects are invalid because Feature 0005 does not provide
an authoritative effect outbox or delivery boundary.

Project Configuration is the sole authored composition input. This feature corrects its private
pre-release shape in place. The compiler accepts only the shape below and provides no legacy parser,
upgrade mode, aliases, or compatibility diagnostics for the discarded shape.

The file remains strict UTF-8 JSON with no comments, duplicate keys, unknown fields, executable
configuration, discovery, or globs. Arrays are semantically unordered; the compiler ordinally orders
every generated registry and catalog collection.

## Project Root

```ts
interface ProjectConfiguration {
  readonly projectFormatVersion: 1;
  readonly environment: "web";
  readonly hostApi: { readonly major: 1; readonly minimumMinor: 0 | 1 };
  readonly application: ApplicationRegistration;
  readonly aggregateModels: readonly AggregateModelRegistration[];
  readonly commands: readonly CommandRegistration[];
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

interface SchemaReference {
  readonly id: string;
}

interface CapabilityRequirement {
  readonly id: string;
  readonly major: number;
  readonly minimumMinor: number;
}

interface ApplicationRegistration {
  readonly definition: SourceExport;
  readonly components: readonly string[];
}
```

There is no author-selected logic or presentation root. Aggregate-model, command, progression, and
component registrations close the source graph; the compiler generates the executable roots.

## Models, Commands, and Progression

```ts
interface AggregateModelBase {
  readonly id: string;
  readonly stateSchema: string;
  readonly initializationSchema: string;
  readonly events: readonly { readonly type: string; readonly schema: string }[];
  readonly effects: readonly { readonly type: string; readonly schema: string }[];
}

interface LocalAggregateModelRegistration extends AggregateModelBase {
  readonly authority: "local";
  readonly kind: "player";
  readonly initializer: SourceExport;
  readonly initializationContent?: string;
}

interface ServerAggregateModelContract extends AggregateModelBase {
  readonly authority: "server";
  readonly kind: "team" | "session";
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
}

type CommandRegistration = LocalCommandRegistration | TrustedCommandContract;

interface ProgressionRegistration {
  readonly id: string;
  readonly aggregateModel: string;
  readonly definition: SourceExport;
}
```

Each relationship has one owner:

- A command points to its aggregate model; a model does not list commands.
- A progression points to its local aggregate model; a model does not point back to progression.
- The trusted-mechanic binding selects one server model and its trusted commands; the selected model
  and commands do not repeat mechanic identity.
- Event and effect type/schema declarations belong to the model because they constrain every command
  executable within that model.

The authority/kind union is closed. Local models are player models. Server models are team or session
models. A local command may reference only a local model; a trusted command may reference only the
server model selected by the binding. Command type is unique within each derived model command set.
Every playable project has exactly one local/player model. Server models may appear only when selected
by the one trusted-mechanic binding; unselected server contracts are invalid.

Every model names an initialization schema. When `initializationContent` is present, it must reference
content whose required schema is exactly that schema ID. When absent, the canonical
initializer input is `{}`, which must validate against the initialization schema. This prevents a typed
initializer from receiving untyped or wrongly typed content.

One local model may have at most one progression after deriving progression registrations by
`aggregateModel`. Server progression is not supported by Trusted Mechanic.

The runnable co-op reference uses one local/player shell model and one server/team model selected by
the target-discovery binding. Its valid command set is the binding-selected trusted target-discovery set.
It has no local team/session command, unselected server contract, or server progression. The earlier
round/clue command and progression examples are removed rather than used to widen this contract.

## Components and Resources

```ts
interface DependencySelection {
  readonly commands: readonly string[];
  readonly content: readonly string[];
  readonly assets: readonly string[];
  readonly capabilities: readonly CapabilityRequirement[];
  readonly sharedProjection?: SchemaReference;
}

interface ComponentRegistration extends DependencySelection {
  readonly id: string;
  readonly implementation: SourceExport;
}

interface SchemaRegistration {
  readonly id: string;
  readonly path: string;
}

interface ContentRegistration {
  readonly id: string;
  readonly path: string;
  readonly schema?: SchemaReference;
}

interface AssetRegistration {
  readonly id: string;
  readonly path: string;
  readonly releasePath: string;
}
```

The application can mount only its selected generated component factories. Each factory receives only
the commands, content, assets, capabilities, and optional shared projection declared by that component.
A component selecting a trusted command must select the trusted mechanic's projection schema. The
release-wide capability set is the ordinal compatible union of component and trusted-mechanic
requirements.

## Trusted Mechanic Registration

```ts
interface TrustedMechanicRegistration {
  readonly id: string;
  readonly aggregateModel: string;
  readonly commands: readonly string[];
  readonly configuration: string;
  readonly projectionSchema: SchemaReference;
  readonly capabilities: readonly CapabilityRequirement[];
}
```

There is zero or one binding. Its model must be one server model, every selected command must be a
trusted command on that model, configuration must reference content with a required schema, and the
projection schema must be registered. The binding contains no source path, package name, URL,
initializer, handler, validator, or open metadata. The platform adapter owns executable server code.

## Application Definition

```ts
interface GameApplicationDefinition {
  mount(context: GameApplicationContext): GameApplicationHandle | Promise<GameApplicationHandle>;
}

interface GameApplicationHandle {
  unmount(): void | Promise<void>;
}

declare function defineGameApplication(
  definition: GameApplicationDefinition,
): GameApplicationDefinition;
```

Compiler inspection validates the exact static shape without invoking `mount`. Application modules do
no DOM or host work during module evaluation. Runtime validation requires the exact handle and invokes
`unmount` once before remount or disposal. A player-owned cleanup scope rolls back component resources
in reverse order after a thrown mount, invalid element/handle, unmount failure, remount, or disposal.

## Game Composition Catalog

Every playable Release Format artifact contains one canonical Game Composition catalog at
`composition/game.json`, inventoried as application content.

```ts
interface GameComposition {
  readonly application: {
    readonly components: readonly string[];
  };
  readonly aggregateModels: readonly AggregateModelDescriptor[];
  readonly commands: readonly CommandDescriptor[];
  readonly progressions: readonly ProgressionDescriptor[];
  readonly components: readonly ComponentDescriptor[];
  readonly resources: readonly ResourceBinding[];
  readonly trustedMechanic?: TrustedMechanicBinding;
}

type AggregateModelDescriptor =
  | {
      readonly id: string;
      readonly authority: "local";
      readonly kind: "player";
      readonly stateSchema: SchemaReference;
      readonly initializationSchema: SchemaReference;
      readonly initializationContent?: string;
      readonly events: readonly { readonly type: string; readonly schema: SchemaReference }[];
      readonly effects: readonly { readonly type: string; readonly schema: SchemaReference }[];
    }
  | {
      readonly id: string;
      readonly authority: "server";
      readonly kind: "team" | "session";
      readonly stateSchema: SchemaReference;
      readonly initializationSchema: SchemaReference;
      readonly events: readonly { readonly type: string; readonly schema: SchemaReference }[];
      readonly effects: readonly { readonly type: string; readonly schema: SchemaReference }[];
    };

interface CommandDescriptor {
  readonly id: string;
  readonly type: string;
  readonly aggregateModel: string;
  readonly payloadSchema: SchemaReference;
  readonly outcomeSchema: SchemaReference;
  readonly execution: "local" | "trusted-mechanic";
}

interface ProgressionDescriptor {
  readonly id: string;
  readonly aggregateModel: string;
}

interface ComponentDescriptor extends DependencySelection {
  readonly id: string;
}

interface ResourceBindingBase {
  readonly id: string;
  readonly path: string;
}

type ResourceBinding =
  | (ResourceBindingBase & {
      readonly role: "schema";
    })
  | (ResourceBindingBase & {
      readonly role: "content";
      readonly schema?: SchemaReference;
    })
  | (ResourceBindingBase & {
      readonly role: "asset" | "progression-descriptor" | "component-descriptor";
    });
```

`TrustedMechanicBinding` is defined by Trusted Mechanic and has the same logical fields as the
authored registration. Catalog membership is derived from the one-way references above; reverse
command/progression lists are not serialized.

The catalog omits `requiredHostApi` and a top-level capability list. Release Manifest is the single
authority for both. Compilation derives the capability union from the composition and requires exact
semantic equality with the manifest. The catalog also omits per-model and per-component `export`
fields: generated bundle roots use fixed map exports, and registry keys are the logical IDs.

Resource paths select exact Release Manifest inventory entries; their digests and byte lengths stay
authoritative in that manifest. A schema reference is a stable logical ID; the release inventory binds
that ID to exact bytes and a digest. Content used for initialization or mechanic configuration must
carry its required schema ID.

## Generated Roots and Inspection

The compiler emits the fixed roots:

```ts
// bundles/logic.js
export const aggregateModels: Readonly<Record<string, ExecutableAggregateModel<"player">>>;

// bundles/presentation.js
export const application: GameApplicationDefinition;
export const components: Readonly<Record<string, ComponentImplementation>>;
```

There are no author-maintained default registries and no per-item named exports in the catalog. Local
model and component registry keys equal catalog IDs. Progression stays inside its owning executable
model. Server contracts exist only in the data catalog and are matched to a platform-owned adapter.

The low-level Release Format inspector remains game-agnostic. The composition-aware inspector has
one result shape:

```ts
interface GameReleaseInspection {
  readonly release: InspectedRelease;
  readonly gameComposition: GameComposition;
}
```

A missing, invalid, or inventory-inconsistent catalog makes a playable-release inspection invalid; it
does not return an `absent` historical variant. Pre-feature artifacts must be recompiled.

## Validation Failures

Compilation fails deterministically for missing/duplicate/wrong-role IDs, authority/kind mismatch,
duplicate command types within a derived model, unresolved source exports, a malformed application,
initializer/content schema mismatch, more than one derived progression per model, a trusted command
outside the selected mechanic, an unselected server model, any server progression, invalid component
dependencies, catalog/registry/inventory disagreement, or capability-union/manifest disagreement.

These checks prove the supported composition and import boundary. They do not prove arbitrary trusted
JavaScript lacks ambient access inside the single WebView.

## Naming and Compatibility

Repository interfaces, schema IDs, command IDs, component IDs, mechanic IDs, generated exports, and
catalog paths use stable plain names without embedded generation suffixes. The existing top-level
project format, Release Format, and Host API/capability requirements remain owned by their centralized
boundaries. They are not collected in a universal contract-version catalog. If Plotpoint later needs
schema or interface evolution, an Accepted ADR will add one centralized compatibility mechanism instead
of renaming every symbol.
