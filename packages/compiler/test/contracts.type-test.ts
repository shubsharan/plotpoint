import type {
  AggregateSchemaRegistration,
  CompileProjectResult,
  CompiledProject,
  ProgressionRegistration,
  ValidateProjectResult,
} from "@plotpoint/compiler";

// @ts-expect-error compiler deep imports are not a supported package surface
import type { ProjectConfiguration as DeepProjectConfiguration } from "@plotpoint/compiler/project/config";

type DeepImportMustRemainUnavailable = DeepProjectConfiguration;
void (undefined as unknown as DeepImportMustRemainUnavailable);

const invalidAggregate: AggregateSchemaRegistration = {
  id: "puzzle.organization",
  // @ts-expect-error aggregate registration kinds are closed
  kind: "organization",
  version: 1,
  path: "schemas/organization.json",
};
void invalidAggregate;

const invalidProgression: ProgressionRegistration = {
  id: "puzzle.progression",
  version: 1,
  // @ts-expect-error progression registration kinds use aggregate kinds only
  kind: "global",
  definition: { source: "src/progression.ts", export: "progression" },
  aggregateSchema: "puzzle.player",
  commands: [],
  content: [],
  components: [],
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
