import type {
  CompatibleRelease,
  CompatibilityAssessment,
  GameComposition,
  GamePlayReport,
  GameReleaseInspection,
  HostReleaseSupport,
  IncompatibleRelease,
  InspectedRelease,
  OpenedRelease,
  ReleaseConstructionInput,
  ReleaseManifest,
  RuntimeBootstrap,
  TransitionCandidate,
  TransitionResult,
  VerifiedRelease,
} from "@plotpoint/protocol";

// @ts-expect-error the universal version registry is not a supported public contract
import type { ContractName } from "@plotpoint/protocol";

// @ts-expect-error the superseded report name is removed instead of aliased
import type { PlayReport } from "@plotpoint/protocol";

type RemovedContractName = ContractName;
type RemovedPlayReport = PlayReport;
void (undefined as unknown as RemovedContractName);
void (undefined as unknown as RemovedPlayReport);

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

const inspectedRelease: InspectedRelease = {
  kind: "inspected",
  releaseId: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  manifest,
};
void inspectedRelease;

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

const gameComposition: GameComposition = {
  application: { components: ["field-map"] },
  aggregateModels: [
    {
      id: "field-player",
      authority: "local",
      kind: "player",
      stateSchema: { id: "field-state" },
      initializationSchema: { id: "field-initialization" },
      events: [{ type: "checkpoint-reached", schema: { id: "checkpoint-event" } }],
      effects: [],
    },
  ],
  commands: [
    {
      id: "complete-checkpoint",
      type: "complete-checkpoint",
      aggregateModel: "field-player",
      payloadSchema: { id: "checkpoint-command" },
      outcomeSchema: { id: "checkpoint-outcome" },
      execution: "local",
    },
  ],
  progressions: [{ id: "field-route", aggregateModel: "field-player" }],
  components: [
    {
      id: "field-map",
      commands: ["complete-checkpoint"],
      content: ["field-copy"],
      assets: [],
      capabilities: [],
    },
  ],
  resources: [
    { id: "field-state", role: "schema", path: "schemas/field-state.json" },
    {
      id: "field-copy",
      role: "content",
      path: "content/field-copy.json",
      schema: { id: "field-copy-schema" },
    },
    {
      id: "field-route",
      role: "progression-descriptor",
      path: "composition/progressions/field-route.json",
    },
    {
      id: "field-map",
      role: "component-descriptor",
      path: "composition/components/field-map.json",
    },
  ],
};
void gameComposition;

const invalidVersionedComposition: GameComposition = {
  // @ts-expect-error Game Composition is plain and has no independent generation field
  version: 1,
  ...gameComposition,
};
void invalidVersionedComposition;

const gameInspection: GameReleaseInspection = {
  release: inspectedRelease,
  gameComposition,
};
void gameInspection;

const bootstrap: RuntimeBootstrap = {
  runId: "run-1",
  releaseId: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  aggregate: {
    modelId: "field-player",
    aggregateId: "player-1",
    aggregateKind: "player",
    schemaId: "field-state",
    stateVersion: 0,
    state: {},
  },
};
void bootstrap;

const invalidVersionedBootstrap: RuntimeBootstrap = {
  ...bootstrap,
  aggregate: {
    ...bootstrap.aggregate,
    // @ts-expect-error schema identity is digest-bound and carries no repeated generation counter
    schemaVersion: 1,
  },
};
void invalidVersionedBootstrap;

const transitionCandidate: TransitionCandidate = {
  commandId: "command-1",
  modelId: "field-player",
  commandType: "complete-checkpoint",
  payload: {},
  target: {
    aggregateId: "player-1",
    aggregateKind: "player",
    schemaId: "field-state",
  },
  expectedStateVersion: 0,
  observationIds: [],
  terminal: "accepted",
  nextState: { checkpoint: 1 },
  outcome: {},
  domainEvents: [],
  effectIntents: [],
  progressionTrace: [],
};
void transitionCandidate;

const invalidVersionedTransition: TransitionCandidate = {
  ...transitionCandidate,
  // @ts-expect-error the corrected Host API uses expectedStateVersion only
  expectedVersion: 0,
};
void invalidVersionedTransition;

const transitionResult: TransitionResult = {
  commandId: "command-1",
  disposition: "committed",
  terminal: "accepted",
  resultingStateVersion: 1,
  outcome: {},
};
void transitionResult;

const gamePlayReport: GamePlayReport = {
  releaseId: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  platform: "ios",
  durationMs: 0,
  events: [],
};
void gamePlayReport;

const invalidVersionedReport: GamePlayReport = {
  // @ts-expect-error Game Play Report is plain and has no per-report version
  version: 1,
  ...gamePlayReport,
};
void invalidVersionedReport;

const invalidRunIdentifiedReport: GamePlayReport = {
  // @ts-expect-error the run is the report owner, not serialized report evidence
  runId: "run-1",
  ...gamePlayReport,
};
void invalidRunIdentifiedReport;
