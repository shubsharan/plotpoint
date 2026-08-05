import type {
  CompatibleRelease,
  CompatibilityAssessment,
  HostReleaseSupport,
  IncompatibleRelease,
  InspectedRelease,
  OpenedRelease,
  ReleaseConstructionInput,
  ReleaseManifest,
  VerifiedRelease,
} from "@plotpoint/protocol";

// @ts-expect-error protocol deep imports are not a supported package surface
import type { ReleaseManifest as DeepReleaseManifest } from "@plotpoint/protocol/release/types";

type DeepImportMustRemainUnavailable = DeepReleaseManifest;
void (undefined as unknown as DeepImportMustRemainUnavailable);

const manifest: ReleaseManifest = {
  releaseFormatVersion: 1,
  hostApi: { major: 1, minimumMinor: 0 },
  aggregateSchemas: [],
  capabilities: [],
  entrypoints: { logic: "bundles/logic.js", presentation: "bundles/presentation.js" },
  inventory: [],
};

const invalidManifestVersion: ReleaseManifest = {
  ...manifest,
  // @ts-expect-error release-format versions are exact discriminants
  releaseFormatVersion: 2,
};
void invalidManifestVersion;

const invalidInspection: InspectedRelease = {
  // @ts-expect-error inspection success cannot use the invalid-result discriminant
  kind: "invalid",
  releaseId: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  manifest,
};
void invalidInspection;

const construction: ReleaseConstructionInput = {
  hostApi: { major: 1, minimumMinor: 0 },
  aggregateSchemas: [],
  capabilities: [],
  entrypoints: { logic: "logic.js", presentation: "presentation.js" },
  entries: [
    { path: "logic.js", kind: "logic-bundle", bytes: new Uint8Array() },
    { path: "content.json", kind: "content", value: { stable: true } },
  ],
};
void construction;

const opened: OpenedRelease = {
  kind: "opened",
  releaseId: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  manifest,
  entries: [],
};
void opened;

const invalidVerification: VerifiedRelease = {
  kind: "verified",
  trust: "structurally-valid",
  releaseId: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  manifest,
  // @ts-expect-error structural verification cannot claim a trusted expected identity
  expectedReleaseId: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
};
void invalidVerification;

const invalidCompatible: CompatibleRelease = {
  kind: "compatible",
  // @ts-expect-error compatible assessments contain no mismatch diagnostics
  diagnostics: [],
};
void invalidCompatible;

// @ts-expect-error incompatible assessments require diagnostics
const invalidIncompatible: IncompatibleRelease = { kind: "incompatible" };
void invalidIncompatible;

const invalidAssessment: CompatibilityAssessment = {
  // @ts-expect-error compatibility result discriminants are closed
  kind: "partially-compatible",
};
void invalidAssessment;

const invalidSupport: HostReleaseSupport = {
  releaseFormatVersions: [1],
  hostApi: { major: 1, minor: 0 },
  aggregateSchemas: [],
  capabilities: [
    {
      id: "plotpoint.media.playback",
      major: 1,
      // @ts-expect-error host support declares an available minor, not a minimum requirement
      minimumMinor: 0,
    },
  ],
};
void invalidSupport;
