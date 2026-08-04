export {
  decodeCanonicalJson,
  DEFAULT_CANONICAL_JSON_LIMITS,
  encodeCanonicalJson,
} from "./release/canonical-json.js";
export type {
  CanonicalJsonDocument,
  CanonicalJsonLimits,
  CanonicalJsonResult,
} from "./release/canonical-json.js";

export { assessCompatibility } from "./release/compatibility.js";

export {
  computeReleaseId,
  crc32,
  isReleaseId,
  isSha256Digest,
  sha256Digest,
} from "./release/identity.js";
export { inspectRelease, DEFAULT_RELEASE_INSPECTION_LIMITS } from "./release/inspect.js";
export type { ReleaseInspectionLimits } from "./release/inspect.js";
export { validateReleaseManifest } from "./release/manifest.js";
export type { ManifestValidationResult } from "./release/manifest.js";
export { compareOrdinal, isCanonicalArchivePath, validateArchivePath } from "./release/paths.js";
export type { ArchivePathResult } from "./release/paths.js";
export { DEFAULT_STORED_ZIP_LIMITS, writeStoredZip } from "./release/zip-profile.js";
export type { StoredZipEntry, StoredZipLimits, ZipWriteResult } from "./release/zip-profile.js";
export { verifyRelease } from "./release/verify.js";

export type {
  AggregateKind,
  AggregateSchemaRequirement,
  CanonicalJsonObject,
  CanonicalJsonPrimitive,
  CanonicalJsonValue,
  CapabilityRequirement,
  CompatibilityAssessment,
  CompatibleRelease,
  HostApiRequirement,
  HostReleaseSupport,
  IncompatibleRelease,
  InspectedRelease,
  InvalidRelease,
  KnownReleaseMatch,
  ReleaseArtifact,
  ReleaseDiagnostic,
  ReleaseDiagnosticCategory,
  ReleaseEntry,
  ReleaseEntryKind,
  ReleaseId,
  ReleaseInventoryEntry,
  ReleaseManifestV1,
  Sha256Digest,
  StructurallyVerifiedRelease,
  VerifyReleaseInput,
  VerifiedRelease,
} from "./release/types.js";
