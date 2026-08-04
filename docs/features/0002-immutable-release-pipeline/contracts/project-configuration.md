# Contract: Project Configuration V1

## Compatibility Surface

An author project contains one strict `plotpoint.project.json` at its root. The file is UTF-8 JSON,
has no comments or duplicate keys, and uses `projectFormatVersion: 1`. Unknown fields are errors.
The compiler never executes this file and performs no package, directory, or glob discovery.

The declarations below describe required semantics. Exact TypeScript helper types may mirror them,
but the JSON document is the source of composition truth.

## Root Shape

```ts
interface ProjectConfigurationV1 {
  readonly projectFormatVersion: 1;
  readonly environment: "web";
  readonly hostApi: { readonly major: number; readonly minimumMinor: number };
  readonly entries: {
    readonly logic: SourceExport;
    readonly presentation: SourceExport;
  };
  readonly commands: readonly CommandRegistration[];
  readonly aggregateSchemas: readonly AggregateSchemaRegistration[];
  readonly schemas: readonly SchemaRegistration[];
  readonly progressions: readonly ProgressionRegistration[];
  readonly components: readonly ComponentRegistration[];
  readonly content: readonly ContentRegistration[];
  readonly assets: readonly AssetRegistration[];
}

interface SourceExport {
  readonly source: string;
  readonly export: string;
}
```

Arrays are author-readable but semantically unordered. The compiler rejects duplicate logical keys
and ordinally orders canonical registries before validation, generated entry creation, diagnostics,
manifest construction, and emission.

## Registrations

```ts
interface AggregateSchemaRegistration {
  readonly id: string;
  readonly kind: "player" | "team" | "session";
  readonly version: number;
  readonly path: string;
}

interface SchemaRegistration {
  readonly id: string;
  readonly path: string;
}

interface CommandRegistration {
  readonly id: string;
  readonly type: string;
  readonly definition: SourceExport;
  readonly aggregateSchema: string;
  readonly payloadSchema: string;
  readonly outcomeSchema: string;
}

interface ProgressionRegistration {
  readonly id: string;
  readonly version: number;
  readonly kind: "player" | "team" | "session";
  readonly definition: SourceExport;
  readonly aggregateSchema: string;
  readonly commands: readonly string[];
  readonly content: readonly string[];
  readonly components: readonly string[];
}

interface CapabilityRequirement {
  readonly id: string;
  readonly major: number;
  readonly minimumMinor: number;
}

interface ComponentRegistration {
  readonly id: string;
  readonly implementation: SourceExport;
  readonly commands: readonly string[];
  readonly content: readonly string[];
  readonly assets: readonly string[];
  readonly capabilities: readonly CapabilityRequirement[];
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
```

Command payload, outcome, and content schemas reference the general schema registry. Aggregate
schemas additionally carry aggregate kind and schema version. The config does not define a general third-party module
manifest; selected source modules are the statically reachable graph from configured exports.

## Identity Rules

- IDs and export names are non-empty printable ASCII and use one stable spelling.
- Capability IDs are namespaced, for example `plotpoint.location.foreground`.
- Source and data paths are project-relative forward-slash paths.
- Release paths use the canonical archive grammar defined by release-format v1.
- Absolute paths, empty segments, `.` or `..`, URL imports, NUL, backslash, symlink aliases, and
  project-boundary escapes are invalid.
- Case-equivalent source identities and release destinations are rejected even on a case-sensitive
  checkout so artifacts remain portable.
- Every referenced ID and source export resolves exactly once.

## Environment Policies

### Logic Graph

The logic graph may import project-local ESM, `@plotpoint/runtime`, and explicitly supported
first-party deterministic roots. It must not import Node built-ins, external packages, CommonJS
modules, URL modules, native addons, or non-literal dynamic imports. The compiler closes the import
graph; the future runtime host removes ambient clock, randomness, network, storage, DOM, and device
authority from the logic execution realm.

### Presentation Graph

The presentation graph may use browser rendering APIs. It must not import Node built-ins, external
packages, CommonJS modules, URL modules, native addons, or non-literal dynamic imports. Future host
policy restricts network, storage, and device authority and exposes declared capabilities through the
host contract; Gate 2 preserves distinct entry roles, host version, and capability requirements.

The compiler analyzes every reachable source before bundling and rejects any external import left in
final output. Static ESM cycles may bundle; the declarative registration/reference graph must be
acyclic.

## Definition Agreement

After import validation, the compiler inspects configured Gate 1 definition exports in a bounded
local subprocess without invoking handlers or predicates.

- A command registration's `id`, `type`, and aggregate kind must match the inspected definition and
  referenced aggregate schema.
- A progression registration's ID, version, kind, nodes, and static rules must match the inspected
  definition and referenced aggregate schema.
- Definition identities are globally unique; command types are unique within an aggregate kind.
- Component named exports must exist in the presentation graph.

## Schemas, Content, and Assets

- Schema files are strict JSON Schema 2020-12 and use Plotpoint's closed JSON-compatible durable
  subset. Compiler diagnostics normalize validation-library errors.
- Content files are strict canonicalizable JSON, may reference one registered schema, and resolve all
  configured links.
- Assets are non-empty regular files. Their bytes are preserved exactly.
- Every content, schema, component, progression, and asset destination is unique.

## Capability Derivation

The manifest capability list is the ordinal union of capability requirements on selected component
registrations. Equal IDs must have compatible majors; the compiler retains the highest minimum minor
within one major. Conflicting majors are invalid. There is no open-ended capability metadata map or
capability catalog in Gate 2.

## Frozen Input Set

Every selected config, source, resolved dependency, schema, content file, and asset is coherently
captured before validation and bundling. All later phases consume captured bytes. A file that changes
during its read invalidates capture; a later live edit cannot affect or invalidate the captured build.
Source absolute paths, filesystem metadata, dependency cache paths, output paths, and tool telemetry
never enter the artifact.

## Deliberate Exclusions

The project file cannot contain project identity, release label, channel, creation timestamp,
publication authorization, signing identity, output destination, or active-session migration data.
Those values belong to later registry or invocation records keyed by release identity.
