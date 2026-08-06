import type {
  AggregateModelRegistration,
  CompileProjectResult,
  CompiledProject,
  ProgressionRegistration,
  ValidateProjectResult,
} from "@plotpoint/compiler";

// @ts-expect-error compiler deep imports are not a supported package surface
import type { ProjectConfiguration as DeepProjectConfiguration } from "@plotpoint/compiler/project/config";

type DeepImportMustRemainUnavailable = DeepProjectConfiguration;
void (undefined as unknown as DeepImportMustRemainUnavailable);

// @ts-expect-error local aggregate models are player-owned
const invalidAggregate: AggregateModelRegistration = {
  id: "puzzle.organization",
  authority: "local",
  kind: "team",
  stateSchema: "puzzle.state",
  initializationSchema: "puzzle.initialization",
  initializer: { source: "src/initialize.ts", export: "initialize" },
  events: [],
  effects: [],
};
void invalidAggregate;

const invalidProgression: ProgressionRegistration = {
  id: "puzzle.progression",
  definition: { source: "src/progression.ts", export: "progression" },
  aggregateModel: "puzzle.player",
  // @ts-expect-error entry-specific versions are not part of the author contract
  version: 1,
};
void invalidProgression;

const invalidCompiled: CompiledProject = {
  // @ts-expect-error compiled results have one exact success discriminant
  kind: "valid",
  outputFile: "release.pprelease",
  releaseId: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  manifest: {
    releaseFormatVersion: 1,
    hostApi: { major: 1, minimumMinor: 0 },
    aggregateSchemas: [],
    capabilities: [],
    entrypoints: { logic: "bundles/logic.js", presentation: "bundles/presentation.js" },
    inventory: [],
  },
};
void invalidCompiled;

const invalidCompileResult: CompileProjectResult = {
  // @ts-expect-error compile results cannot use validation's success discriminant
  kind: "valid",
  manifestPreview: invalidCompiled.manifest,
};
void invalidCompileResult;

const invalidValidateResult: ValidateProjectResult = {
  // @ts-expect-error validation results cannot use compilation's success discriminant
  kind: "compiled",
  outputFile: "release.pprelease",
  releaseId: invalidCompiled.releaseId,
  manifest: invalidCompiled.manifest,
};
void invalidValidateResult;
