export { assessCompatibility } from "./release/compatibility.js";
export { createReleaseArtifact } from "./release/create.js";
export { computeReleaseId, isReleaseId } from "./release/identity.js";
export {
  inspectGameRelease,
  inspectRelease,
  DEFAULT_RELEASE_INSPECTION_LIMITS,
} from "./release/inspect.js";
export type { ReleaseInspectionLimits } from "./release/inspect.js";
export { openRelease } from "./release/open.js";
export { GAME_COMPOSITION_PATH } from "./release/paths.js";
export { verifyRelease } from "./release/verify.js";
export { parseGameComposition } from "./release/game-composition.js";
export type {
  AggregateModelDescriptor,
  CommandDescriptor,
  ComponentDescriptor,
  DependencySelection,
  EventOrEffectDescriptor,
  GameCapabilityRequirement,
  GameComposition,
  GameCompositionParseResult,
  GameReleaseInspection,
  LocalAggregateModelDescriptor,
  ProgressionDescriptor,
  ResourceBinding,
  SchemaReference,
  ServerAggregateModelDescriptor,
  TrustedMechanicBinding,
} from "./release/game-composition.js";

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
  ReleaseManifest,
  ReleaseMaterialEntry,
  Sha256Digest,
  StructurallyVerifiedRelease,
  VerifyReleaseInput,
  VerifiedRelease,
} from "./release/types.js";
export { RELEASE_FORMAT_VERSION } from "./release/types.js";

export {
  MAX_RELEASE_BYTES,
  RELEASE_DOWNLOAD_TIMEOUT_MS,
  isEligibleInstallUrl,
  parseInstallDescriptor,
} from "./player/install.js";
export type { InstallDescriptorResult, InstallDescriptor } from "./player/install.js";
export {
  createHostRuntimeClient,
  parseHostBridgeEnvelope,
  HOST_API_VERSION,
  HOST_BRIDGE_VERSION,
} from "./player/bridge.js";
export type {
  AggregateTarget,
  AnyHostBridgeEnvelope,
  CapabilityRequestEnvelope,
  CapabilityRequest,
  CapabilityResultEnvelope,
  CapabilityResult,
  CapabilityVersion,
  HostBridgeDirection,
  HostBridgeEnvelope,
  HostBridgeMessageType,
  HostBridgeParseResult,
  HostBridgeTransport,
  HostCapabilityOutputValidator,
  HostErrorEnvelope,
  HostError,
  HostRuntimeClient,
  HostToWebBridgeEnvelope,
  HostToWebMessageType,
  LocalAggregateView,
  ProgressionInstance,
  ProgressionNodeState,
  ProgressionStatus,
  ProgressionTransitionRecord,
  RuntimeBootstrapEnvelope,
  RuntimeBootstrap,
  RuntimeReadyEnvelope,
  TransitionCandidate,
  TransitionCommitEnvelope,
  TransitionResultEnvelope,
  TransitionResult,
  TypedRecord,
  WebToHostBridgeEnvelope,
  WebToHostMessageType,
} from "./player/bridge.js";
export {
  FOREGROUND_LOCATION_CAPABILITY,
  accuracyBand,
  isGamePlayReport,
  isLocationReportProjection,
  isLocationObservation,
  isLocationRequestInput,
  parseReportSafeDiagnosticCode,
  projectLocationObservation,
  recencyBand,
} from "./player/report.js";
export { createSharedPlayClient } from "./shared/client.js";
export {
  isAuthorizedSnapshot,
  isSharedAggregateTarget,
  isSharedCommandIntent,
  isSharedCommandStatus,
  isSharedPlayView,
  isSharedProjection,
  isSyncCommandResult,
  isSyncCommand,
  isSyncPull,
} from "./shared/validation.js";
export type {
  AuthorizedSnapshot,
  SharedActionTerminal,
  SharedAggregateKind,
  SharedAggregateTarget,
  SharedCommandIntent,
  SharedCommandStatus,
  SharedPlayClient,
  SharedPlayTransport,
  SharedPlayView,
  SharedProjection,
  SharedTerminal,
  SyncCommandResult,
  SyncCommand,
  SyncPull,
} from "./shared/types.js";
export type { SharedHuntReportEvent, SharedHuntReport } from "./shared/report.js";
export type {
  AccuracyBand,
  GamePlayReport,
  GamePlayReportEvent,
  LocationAvailability,
  LocationObservation,
  LocationReportProjection,
  LocationRequestInput,
  RecencyBand,
  ReportSafeDiagnosticCode,
} from "./player/report.js";
