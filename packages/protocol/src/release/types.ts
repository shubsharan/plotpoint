export type Sha256Digest = `sha256:${string}`;
export type ReleaseId = Sha256Digest;

export type AggregateKind = "player" | "team" | "session";

export interface HostApiRequirement {
  readonly major: number;
  readonly minimumMinor: number;
}

export interface AggregateSchemaRequirement {
  readonly id: string;
  readonly kind: AggregateKind;
  readonly version: number;
  readonly path: string;
}

export interface CapabilityRequirement {
  readonly id: string;
  readonly major: number;
  readonly minimumMinor: number;
}

export type ReleaseEntryKind =
  | "logic-bundle"
  | "presentation-bundle"
  | "aggregate-schema"
  | "command-schema"
  | "progression"
  | "component-data"
  | "content"
  | "asset";

export interface ReleaseInventoryEntry {
  readonly path: string;
  readonly kind: ReleaseEntryKind;
  readonly byteLength: number;
  readonly digest: Sha256Digest;
}

export interface ReleaseManifestV1 {
  readonly releaseFormatVersion: 1;
  readonly hostApi: HostApiRequirement;
  readonly aggregateSchemas: readonly AggregateSchemaRequirement[];
  readonly capabilities: readonly CapabilityRequirement[];
  readonly entrypoints: {
    readonly logic: string;
    readonly presentation: string;
  };
  readonly inventory: readonly ReleaseInventoryEntry[];
}

export interface ReleaseEntry extends ReleaseInventoryEntry {
  readonly bytes: Uint8Array;
}

export interface ReleaseArtifact {
  readonly bytes: Uint8Array;
  readonly manifest: ReleaseManifestV1;
  readonly releaseId: ReleaseId;
}

export type CanonicalJsonPrimitive = null | boolean | number | string;
export type CanonicalJsonObject = { readonly [key: string]: CanonicalJsonValue };
export type CanonicalJsonValue =
  | CanonicalJsonPrimitive
  | CanonicalJsonObject
  | readonly CanonicalJsonValue[];

export type ReleaseDiagnosticCategory =
  | "format"
  | "manifest"
  | "inventory"
  | "integrity"
  | "identity"
  | "compatibility";

export interface ReleaseDiagnostic {
  readonly code: string;
  readonly category: ReleaseDiagnosticCategory;
  readonly path?: string;
  readonly relationship?: string;
  readonly details: CanonicalJsonObject;
}

export interface InspectedRelease {
  readonly kind: "inspected";
  readonly releaseId: ReleaseId;
  readonly manifest: ReleaseManifestV1;
}

export interface InvalidRelease {
  readonly kind: "invalid";
  readonly diagnostics: readonly ReleaseDiagnostic[];
}

export interface StructurallyVerifiedRelease {
  readonly kind: "verified";
  readonly trust: "structurally-valid";
  readonly releaseId: ReleaseId;
  readonly manifest: ReleaseManifestV1;
  readonly expectedReleaseId?: never;
}

export interface KnownReleaseMatch {
  readonly kind: "verified";
  readonly trust: "known-release-match";
  readonly releaseId: ReleaseId;
  readonly expectedReleaseId: ReleaseId;
  readonly manifest: ReleaseManifestV1;
}

export type VerifiedRelease = StructurallyVerifiedRelease | KnownReleaseMatch;

export interface VerifyReleaseInput {
  readonly bytes: Uint8Array;
  readonly expectedReleaseId?: ReleaseId;
}

export interface HostReleaseSupport {
  readonly releaseFormatVersions: readonly number[];
  readonly hostApi: { readonly major: number; readonly minor: number };
  readonly aggregateSchemas: readonly {
    readonly id: string;
    readonly kind: AggregateKind;
    readonly versions: readonly number[];
  }[];
  readonly capabilities: readonly {
    readonly id: string;
    readonly major: number;
    readonly minor: number;
  }[];
}

export interface CompatibleRelease {
  readonly kind: "compatible";
}

export interface IncompatibleRelease {
  readonly kind: "incompatible";
  readonly diagnostics: readonly ReleaseDiagnostic[];
}

export type CompatibilityAssessment = CompatibleRelease | IncompatibleRelease;
