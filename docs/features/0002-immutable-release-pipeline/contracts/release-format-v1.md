# Contract: Release Format V1

## Compatibility Surface

A Plotpoint release is one `.pprelease` file. Version 1 uses a strict deterministic ZIP-compatible
profile and a canonical `manifest.json`. A conforming implementation must reject archive features
outside this profile rather than silently normalizing them.

The artifact can be inspected and verified without extracting entries or executing game code.

## Strict Container Profile

| Property | V1 rule |
| --- | --- |
| Entry type | Regular files only; no directory or symlink entries |
| Compression | Stored/uncompressed only |
| Encoding | UTF-8 flag set; canonical ASCII entry names |
| Ordering | Local entries and central directory both sort by ordinal path |
| Metadata | Fixed compiler-owned version, flags, DOS epoch timestamp, and regular-file mode |
| Forbidden | Encryption, comments, extra fields, data descriptors, ZIP64, ownership, source permissions, absolute paths, trailing bytes |
| Integrity | Standard CRC-32 plus manifest SHA-256 for every non-manifest payload |
| Limits | Non-ZIP64 32-bit sizes/offsets and standard entry-count bound; verifier policy may impose lower operational limits |

Canonical archive paths:

- contain printable lowercase ASCII letters, digits, `.`, `_`, `-`, and `/` only;
- are relative and have no leading or trailing slash;
- contain no empty, `.` or `..` segment;
- contain no backslash, drive prefix, URL syntax, NUL, percent alias, or normalization alias;
- are globally unique; duplicate and case-equivalent alternatives are invalid.

The compiler assigns generated bundle paths and validates author-selected asset destinations against
this grammar. Source paths and filenames need not become archive paths.

## Manifest Encoding

The archive contains exactly one `manifest.json`, encoded as RFC 8785 canonical JSON in UTF-8 with no
BOM or trailing newline. Re-encoding the parsed value must reproduce the exact bytes; otherwise the
artifact is invalid.

```ts
interface ReleaseManifestV1 {
  readonly releaseFormatVersion: 1;
  readonly hostApi: {
    readonly major: number;
    readonly minimumMinor: number;
  };
  readonly aggregateSchemas: readonly AggregateSchemaRequirement[];
  readonly capabilities: readonly CapabilityRequirement[];
  readonly entrypoints: {
    readonly logic: string;
    readonly presentation: string;
  };
  readonly inventory: readonly ReleaseInventoryEntry[];
}

interface AggregateSchemaRequirement {
  readonly id: string;
  readonly kind: "player" | "team" | "session";
  readonly version: number;
  readonly path: string;
}

interface CapabilityRequirement {
  readonly id: string;
  readonly major: number;
  readonly minimumMinor: number;
}

type ReleaseEntryKind =
  | "logic-bundle"
  | "presentation-bundle"
  | "aggregate-schema"
  | "command-schema"
  | "progression"
  | "component-data"
  | "content"
  | "asset";

interface ReleaseInventoryEntry {
  readonly path: string;
  readonly kind: ReleaseEntryKind;
  readonly byteLength: number;
  readonly digest: `sha256:${string}`;
}
```

All arrays are in canonical ordinal key order. Required entrypoint and aggregate schema paths appear
exactly once in inventory with the correct kind. Manifest values are closed: unknown fields,
duplicate keys, unsupported versions, unsafe integers, non-canonical IDs, and unrecognized kinds are
invalid.

`manifest.json` is implicit and does not list or hash itself. The whole-artifact identity covers it.

## Exact Inventory

The archive path multiset must equal `manifest.json` plus every inventory path exactly once. A
verifier rejects:

- a missing or additional entry;
- duplicate local or central-directory names;
- local and central header disagreement;
- reordered local or central entries;
- an entry kind or role mismatch;
- byte length, CRC-32, or SHA-256 mismatch;
- overlapping, truncated, trailing, or out-of-bounds entry data;
- any unsupported container feature.

Verification computes digests from stored bytes and does not trust archive metadata alone.

## Release Identity

```ts
type ReleaseId = `sha256:${string}`;
```

The value is SHA-256 over every byte from the beginning through the end of the finalized artifact,
rendered as 64 lowercase hexadecimal characters. It includes container headers, manifest bytes,
payloads, central directory, and end record.

The release ID is never embedded in artifact bytes. A compiler result, registry record, installation
request, artifact filename, or other external trusted channel supplies it. Labels, channels, project
identity, creation timestamps, compiler telemetry, output paths, and source paths are absent from
artifact bytes and therefore cannot change content identity.

## Portable API

`@plotpoint/protocol` exposes package-root types and operations conceptually equivalent to:

```ts
interface InspectedRelease {
  readonly kind: "inspected";
  readonly releaseId: ReleaseId;
  readonly manifest: ReleaseManifestV1;
}

interface InvalidRelease {
  readonly kind: "invalid";
  readonly diagnostics: readonly ReleaseDiagnostic[];
}

export function inspectRelease(bytes: Uint8Array): Promise<InspectedRelease | InvalidRelease>;

export function verifyRelease(input: {
  readonly bytes: Uint8Array;
  readonly expectedReleaseId?: ReleaseId;
}): Promise<VerifiedRelease | InvalidRelease>;

export function assessCompatibility(
  manifest: ReleaseManifestV1,
  support: HostReleaseSupport,
): CompatibilityAssessment;
```

`inspectRelease` parses bounded structure, validates canonical manifest and exact inventory, computes
digests and release ID, and never runs an entry. `verifyRelease` performs the same work and records
whether an expected identity was supplied and matched. Implementations may stream internally, but
must not extract entries to a filesystem as a prerequisite.

## Trust Semantics

- **Structurally valid**: Container, manifest, inventory, lengths, CRCs, and entry hashes agree.
- **Known release match**: Structurally valid and the computed ID equals a trusted expected ID.
- **Publisher authentic**: Not established by v1. Signing and publisher trust are outside Gate 2.

A coordinated rewrite of payloads and manifest can produce a structurally valid artifact with a new
release ID. It is rejected as tampering only when checked against the original expected ID. APIs and
diagnostics must not call internal consistency alone authenticity.

## Compatibility Assessment

```ts
interface HostReleaseSupport {
  readonly releaseFormatVersions: readonly number[];
  readonly hostApi: { readonly major: number; readonly minor: number };
  readonly aggregateSchemas: readonly {
    readonly id: string;
    readonly kind: "player" | "team" | "session";
    readonly versions: readonly number[];
  }[];
  readonly capabilities: readonly {
    readonly id: string;
    readonly major: number;
    readonly minor: number;
  }[];
}
```

Assessment succeeds only when:

1. The exact release-format version is supported.
2. Host API major equals the requirement and host minor is at least the minimum.
3. Every aggregate schema identity and kind supports the exact required version.
4. Every capability ID and major exists and its minor is at least the minimum.

Each surface reports its own mismatch. No global version, implicit upgrade, prerelease rule, or
best-effort fallback exists in v1.

## Diagnostic Contract

Release diagnostics contain a stable code, category (`format`, `manifest`, `inventory`, `integrity`,
`identity`, or `compatibility`), affected path or relationship, and canonical details. They contain no
stack, timing, host path, parser-library prose, or game data beyond the minimum identifying context.
Expected malformed or incompatible artifacts return invalid results rather than throwing.

## Format Evolution

Compression, ZIP64, path-grammar changes, additional manifest fields, new required entry roles, a
different digest algorithm, or changed compatibility semantics require a new release-format version.
Optional application content may evolve as ordinary inventoried entries without changing the
container contract.
