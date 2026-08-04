export { assessCompatibility } from "./release/compatibility.js";
export { createReleaseArtifact } from "./release/create.js";
export { computeReleaseId, isReleaseId } from "./release/identity.js";
export { inspectRelease, DEFAULT_RELEASE_INSPECTION_LIMITS } from "./release/inspect.js";
export type { ReleaseInspectionLimits } from "./release/inspect.js";
export { openRelease } from "./release/open.js";
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
  OpenedRelease,
  ReleaseArtifact,
  ReleaseBinaryMaterialEntry,
  ReleaseConstructionInput,
  ReleaseDiagnostic,
  ReleaseDiagnosticCategory,
  ReleaseEntry,
  ReleaseEntryKind,
  ReleaseId,
  ReleaseInventoryEntry,
  ReleaseJsonMaterialEntry,
  ReleaseManifestV1,
  ReleaseMaterialEntry,
  Sha256Digest,
  StructurallyVerifiedRelease,
  VerifyReleaseInput,
  VerifiedRelease,
} from "./release/types.js";
