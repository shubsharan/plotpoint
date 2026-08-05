# Data Model: Immutable Release Pipeline

## Model Boundary

Gate 2 models author inputs, a frozen compilation snapshot, validated registries, emitted release
entries, a canonical manifest, a finalized artifact, and structured diagnostics. Registry records,
publication labels, channels, creation timestamps, player installations, and sessions are outside
this model and must not enter artifact bytes.

## Project Configuration

The strict data-only root document for one game project.

| Field                  | Type                                | Rules                                                          |
| ---------------------- | ----------------------------------- | -------------------------------------------------------------- |
| `projectFormatVersion` | positive integer                    | Exactly `1` for Gate 2                                         |
| `environment`          | enum                                | Exactly `web` for                                              |
| `hostApi`              | Host API requirement                | Exact major and non-negative minimum minor                     |
| `entries`              | Entry selection                     | Exactly one logic and one presentation source/export           |
| `commands`             | Command registration array          | Canonical unique IDs; ordinalized before use                   |
| `aggregateSchemas`     | Aggregate schema registration array | Unique schema identity/kind/version                            |
| `schemas`              | General schema registration array   | Unique IDs for command payload, outcome, or content validation |
| `progressions`         | Progression registration array      | Unique graph identity/version/kind                             |
| `components`           | Component registration array        | Unique IDs and resolvable presentation exports                 |
| `content`              | Content registration array          | Unique IDs and paths; optional schema reference                |
| `assets`               | Asset registration array            | Unique IDs and release destinations                            |

Unknown fields, implicit discovery, glob expressions, absolute paths, operational metadata, and
duplicate logical identities are invalid.

## Source Export Reference

Identifies one statically selected ESM export.

| Field    | Type                  | Rules                                                                  |
| -------- | --------------------- | ---------------------------------------------------------------------- |
| `source` | project-relative path | Canonical forward-slash path; regular contained file; no symlink alias |
| `export` | string                | Canonical non-empty named export; default export is not implicit       |

The pair must resolve exactly once in the correct logic or presentation graph.

## Compatibility Requirement

### Host API Requirement

| Field          | Type                 | Rules                                  |
| -------------- | -------------------- | -------------------------------------- |
| `major`        | positive integer     | Host major must equal this value       |
| `minimumMinor` | non-negative integer | Host minor must be at least this value |

### Aggregate Schema Registration

| Field     | Type                  | Rules                               |
| --------- | --------------------- | ----------------------------------- |
| `id`      | canonical ID          | Unique schema identity              |
| `kind`    | enum                  | `player`, `team`, or `session`      |
| `version` | positive integer      | Unique with `id` and `kind`         |
| `path`    | project-relative path | Strict JSON Schema 2020-12 document |

### General Schema Registration

Associates a canonical ID with one strict JSON Schema 2020-12 document used by command payloads,
outcomes, or content. Each ID and normalized path resolves exactly once.

## Registrations

### Command Registration

Links a Gate 1 command definition export to its aggregate plus registered payload and outcome schema documents.
The configured ID, command type, aggregate kind, and definition export metadata must agree. Command
definition IDs are globally unique; command types are unique within one aggregate kind.

### Progression Registration

Links a Gate 1 progression definition export to one aggregate schema and its referenced commands,
content, and components. Configured graph ID, version, kind, and nodes must agree with the inspected
definition. Inspection is validation evidence only; the durable descriptor contains the canonical
registration's ID, version, kind, aggregate schema, and command/content/component references. The
declarative reference graph must be acyclic; Gate 1 owns lifecycle-rule validation.

### Component Registration

Links a named presentation export to commands, content, assets, and namespaced capability
requirements it consumes. Component IDs are unique. The release-level capability list is the
ordinal union of selected component requirements, not a separately authored top-level list.

### Content Registration

Identifies strict canonicalizable JSON content, an optional content schema, and a canonical release
destination. Every logical reference resolves once.

### Asset Registration

Identifies a non-empty regular file and canonical release destination. Raw payload bytes are
preserved. Two source aliases, logical IDs, case-equivalent destinations, or normalized destinations
cannot claim the same release path.

## Compilation Snapshot

The immutable input set used by all compiler phases.

| Field    | Type                                 | Rules                                               |
| -------- | ------------------------------------ | --------------------------------------------------- |
| `config` | canonical project configuration      | Detached and immutable                              |
| `files`  | ordinal map of logical path to bytes | One entry per selected source/data/asset/dependency |

All parsing, definition inspection, bundling, and entry creation consume snapshot bytes. Pre/read/post
checks reject a torn individual capture; changes to live project files after coherent capture do not
alter or invalidate the snapshot.

## Import Graph

| Field         | Type                      | Rules                                      |
| ------------- | ------------------------- | ------------------------------------------ |
| `environment` | `logic` or `presentation` | Selects policy                             |
| `nodes`       | source module set         | Every node belongs to the snapshot         |
| `edges`       | static imports            | Resolved, literal, and environment-allowed |
| `entry`       | source export reference   | Exactly one generated root per graph       |

No graph may leave an unresolved/external import in an emitted bundle. Named export resolution
retains star-export relationships, honors explicit-export precedence, excludes `default` from star
forwarding, terminates cycles, and rejects ambiguous providers. Ordinary static ESM cycles may
bundle; cycles in the declarative composition/reference graph are invalid.

## Compiler Diagnostic

| Field      | Type                | Rules                                                                                                                             |
| ---------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `category` | fixed enum          | Configuration, import boundary, composition, command, schema, progression, component, content, asset, compatibility, or integrity |
| `code`     | canonical string    | Stable machine-facing failure identity                                                                                            |
| `severity` | literal             | `error` in Gate 2                                                                                                                 |
| `location` | structured location | Config pointer, normalized source line/column, logical reference, or artifact path                                                |
| `details`  | canonical object    | Stable values only; no stack, clock, cwd, or host prose                                                                           |
| `related`  | location array      | Optional independently relevant locations                                                                                         |

Diagnostics sort by fixed category rank, normalized path, pointer or line/column, code, and canonical
details. Human-readable messages are derived and are not compatibility data.

## Release Entry

One regular file inside the strict container.

| Field        | Type                         | Rules                                                                                               |
| ------------ | ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `path`       | canonical ASCII archive path | Unique; relative; no empty, dot, parent, or case-equivalent segment                                 |
| `kind`       | enum                         | Logic bundle, presentation bundle, content, progression, aggregate schema, component data, or asset |
| `bytes`      | byte sequence                | Final immutable payload                                                                             |
| `byteLength` | non-negative integer         | Exact payload length                                                                                |
| `digest`     | SHA-256 digest               | Digest of exact payload bytes                                                                       |

`manifest.json` is a required implicit container entry and is not a Release Entry in its own
inventory, avoiding self-reference.

Compiler-generated schema, progression, component, and content entry basenames are lowercase
hexadecimal encodings of UTF-8 logical IDs. Logical IDs remain unchanged in durable metadata.

## Release Manifest

| Field                  | Type                           | Rules                                       |
| ---------------------- | ------------------------------ | ------------------------------------------- |
| `releaseFormatVersion` | integer                        | Exactly `1`                                 |
| `hostApi`              | Host API requirement           | Independently assessable                    |
| `aggregateSchemas`     | ordered declarations           | Exact schema ID/kind/version/path           |
| `capabilities`         | ordered requirements           | Derived, namespaced, non-contradictory      |
| `entrypoints`          | role-to-path object            | Exactly logic and presentation bundle paths |
| `inventory`            | ordered Release Entry metadata | Exactly every non-manifest entry, once      |

The manifest is RFC 8785 canonical JSON. It contains no release identity, source path, build
metadata, project identity, label, channel, or timestamp.

## Release Artifact

The finalized strict ZIP-compatible byte sequence.

| Field       | Type             | Rules                                               |
| ----------- | ---------------- | --------------------------------------------------- |
| `bytes`     | immutable bytes  | Canonical store-only container                      |
| `manifest`  | Release Manifest | Parsed from canonical `manifest.json`               |
| `releaseId` | qualified digest | SHA-256 over every artifact byte; external to bytes |

## Release Construction Input

Protocol-owned input containing validated manifest metadata and material entries before inventory
digests and container bytes exist.

- Fields: host API requirement, aggregate schema requirements, normalized capabilities, fixed logic
  and presentation entrypoints, and material entries with path, kind, and immutable bytes.
- The protocol constructor validates roles and paths, derives inventory length/digest fields, emits the
  canonical manifest and strict container, and returns one self-verified Release Artifact.
- Raw container and canonicalization helpers are not public entities.

## Opened Release

A completely validated, non-executing view of a Release Artifact for installers and future players.

- Fields: computed release identity, validated manifest, and immutable copies of every inventory entry.
- Entry order equals manifest inventory order; no missing or additional entry can be exposed.
- Opening validates the same bounded container, canonical manifest, inventory, CRC, length, and digest
  rules as inspection and verification before returning bytes.
- Mutating bytes returned by one read cannot mutate the artifact or a later read.

### Lifecycle

```text
project discovered
  -> configuration valid
  -> snapshot captured
  -> graphs and registries valid
  -> definitions inspected
  -> bundles and material entries produced
  -> protocol manifest and artifact constructed
  -> artifact self-verified
  -> final path atomically published
```

Any failure before publication returns an invalid result and no release identity. Temporary remnants
remain non-release files. An existing destination is reused only when it independently verifies as
the exact expected release; otherwise it is not overwritten.

Runtime ambient-authority isolation is not a compilation lifecycle state. It is a Gate 3 installation
and execution prerequisite applied to the distinct logic and presentation entry roles.

## Release Identity and Trust

`ReleaseId` has the form `sha256:<64 lowercase hexadecimal characters>`. Structural verification
can prove that an artifact is well formed and internally consistent. Verification against a trusted
expected `ReleaseId` proves that the bytes match that known release. Neither operation proves
publisher identity; signing is outside Gate 2.
