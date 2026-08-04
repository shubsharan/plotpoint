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

export {
  INSTALL_DESCRIPTOR_VERSION,
  MAX_RELEASE_BYTES,
  RELEASE_DOWNLOAD_TIMEOUT_MS,
  isEligibleInstallUrl,
  parseInstallDescriptor,
} from "./player/install.js";
export type { InstallDescriptorResult, InstallDescriptorV1 } from "./player/install.js";
export { HOST_BRIDGE_VERSION, parseHostBridgeEnvelope } from "./player/bridge.js";
export type {
  HostBridgeEnvelope,
  HostBridgeMessageType,
  HostBridgeParseResult,
  HostToWebMessageType,
  WebToHostMessageType,
} from "./player/bridge.js";
export { FOREGROUND_LOCATION_CAPABILITY, accuracyBand } from "./player/report.js";
export type {
  AccuracyBand,
  LocationAvailability,
  LocationObservationV1,
  PlayReportCommandV1,
  PlayReportObservationV1,
  PlayReportV1,
} from "./player/report.js";
