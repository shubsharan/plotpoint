import { randomBytes } from "node:crypto";

import type { ReleaseArtifact } from "@plotpoint/protocol";

import { bundleDefinitionInspection, bundleRelease } from "./bundle/bundle-release.js";
import { inspectDefinitionBundle } from "./composition/inspect-definitions.js";
import {
  validateDefinitionMetadata,
  validateDefinitionExports,
  validateReferences,
} from "./composition/validate-references.js";
import { createCompilerDiagnostic } from "./diagnostics/create.js";
import { orderCompilerDiagnostics } from "./diagnostics/order.js";
import { resolveImportGraph } from "./imports/resolve-graph.js";
import type {
  CompileProjectInput,
  CompileProjectResult,
  CompilerDiagnostic,
  InvalidProject,
  ValidateProjectInput,
  ValidateProjectResult,
} from "./project/config.js";
import { loadProject } from "./project/load-project.js";
import { ProjectPathPolicyError, validateReleaseOutputPath } from "./project/path-policy.js";
import { captureProjectSnapshot } from "./project/snapshot.js";
import { assembleRelease } from "./release/assemble.js";
import {
  OutputCollisionError,
  publishReleaseAtomically,
  TemporaryCleanupError,
} from "./release/atomic-output.js";
import { validateAssets } from "./validation/assets.js";
import {
  validateCapabilities,
  validateCompatibilityRequirements,
} from "./validation/capabilities.js";
import { validateCommands } from "./validation/commands.js";
import { validateComponents } from "./validation/components.js";
import { validateContent, validateDefaultInitializationInputs } from "./validation/content.js";
import { validateProgressions } from "./validation/progression.js";
import { validateRuntimeSchemaRoots, validateSchemas } from "./validation/schemas.js";

interface PreparedProject {
  readonly kind: "prepared";
  readonly artifact: ReleaseArtifact;
}

type PrepareProjectResult = PreparedProject | InvalidProject;

function invalid(diagnostics: readonly CompilerDiagnostic[]): InvalidProject {
  return Object.freeze({ kind: "invalid", diagnostics: orderCompilerDiagnostics(diagnostics) });
}

function outputDiagnostic(
  code: "output-path-invalid" | "output-collision" | "temporary-cleanup-failed",
  outputFile: string,
  reason: string,
): CompilerDiagnostic {
  return createCompilerDiagnostic({
    code,
    location: { kind: "artifact", path: outputFile },
    details: { reason },
  });
}

async function prepareProject(input: ValidateProjectInput): Promise<PrepareProjectResult> {
  const loaded = await loadProject(input);
  if (loaded.kind === "invalid") return loaded;
  const captured = await captureProjectSnapshot(loaded);
  if (captured.kind === "invalid") return captured;
  const { snapshot } = captured;

  const references = validateReferences(snapshot.registries);
  if (references.length > 0) return invalid(references);
  const localModel = snapshot.registries.aggregateModels.find(
    (model) => model.authority === "local",
  );
  if (localModel === undefined) {
    throw new Error("Reference validation did not require one local model");
  }
  const logic = resolveImportGraph(snapshot, localModel.initializer, "logic");
  const presentation = resolveImportGraph(
    snapshot,
    snapshot.registries.application.definition,
    "presentation",
  );
  if (logic.kind === "invalid" || presentation.kind === "invalid") {
    return invalid([
      ...(logic.kind === "invalid" ? logic.diagnostics : []),
      ...(presentation.kind === "invalid" ? presentation.diagnostics : []),
    ]);
  }

  const definitionExports = validateDefinitionExports([
    {
      registration: "application",
      id: "application",
      selected: snapshot.registries.application.definition,
      graph: presentation.graph,
    },
    ...snapshot.registries.aggregateModels.flatMap((model) =>
      model.authority === "local"
        ? [
            {
              registration: "aggregateModels",
              id: model.id,
              selected: model.initializer,
              graph: logic.graph,
            },
          ]
        : [],
    ),
    ...snapshot.registries.commands.flatMap((command) =>
      command.execution === "local"
        ? [
            {
              registration: "commands",
              id: command.id,
              selected: command.definition,
              graph: logic.graph,
            },
          ]
        : [],
    ),
    ...snapshot.registries.progressions.map((progression) => ({
      registration: "progressions",
      id: progression.id,
      selected: progression.definition,
      graph: logic.graph,
    })),
    ...snapshot.registries.components.map((component) => ({
      registration: "components",
      id: component.id,
      selected: component.implementation,
      graph: presentation.graph,
    })),
  ]);
  if (definitionExports.length > 0) return invalid(definitionExports);

  const components = validateComponents(snapshot, presentation.graph);
  const capabilities = validateCapabilities(snapshot);
  const compatibility = validateCompatibilityRequirements(snapshot);
  if (
    components.kind === "invalid" ||
    capabilities.kind === "invalid" ||
    compatibility.length > 0
  ) {
    return invalid([
      ...(components.kind === "invalid" ? components.diagnostics : []),
      ...(capabilities.kind === "invalid" ? capabilities.diagnostics : []),
      ...compatibility,
    ]);
  }

  const schemas = validateSchemas(snapshot);
  if (schemas.kind === "invalid") return schemas;
  const runtimeSchemaRoots = validateRuntimeSchemaRoots(snapshot.registries, schemas.schemas);
  if (runtimeSchemaRoots.length > 0) return invalid(runtimeSchemaRoots);
  const content = validateContent(snapshot, schemas.schemas);
  const initializationInputs = validateDefaultInitializationInputs(snapshot, schemas.schemas);
  const assets = validateAssets(snapshot);
  if (content.kind === "invalid" || assets.kind === "invalid" || initializationInputs.length > 0) {
    return invalid([
      ...(content.kind === "invalid" ? content.diagnostics : []),
      ...(assets.kind === "invalid" ? assets.diagnostics : []),
      ...initializationInputs,
    ]);
  }

  const inspectionBundle = await bundleDefinitionInspection(snapshot);
  if (inspectionBundle.kind === "invalid") return inspectionBundle;
  const definitions = await inspectDefinitionBundle(inspectionBundle.bytes);
  if (definitions.kind === "invalid") return invalid([definitions.diagnostic]);
  const definitionDiagnostics = [
    ...validateDefinitionMetadata(snapshot.registries, definitions.metadata),
    ...validateCommands(snapshot.registries, definitions.metadata),
    ...validateProgressions(snapshot.registries, definitions.metadata),
  ];
  if (definitionDiagnostics.length > 0) return invalid(definitionDiagnostics);

  const bundled = await bundleRelease({
    logic: logic.graph,
    presentation: presentation.graph,
    registries: snapshot.registries,
    schemas: schemas.schemas,
  });
  if (bundled.kind === "invalid") return bundled;

  const assembled = await assembleRelease({
    snapshot,
    bundles: { logic: bundled.logic, presentation: bundled.presentation },
    schemas: schemas.schemas,
    content: content.content,
    assets: assets.assets,
    capabilities: capabilities.capabilities,
  });
  if (assembled.kind === "invalid") return assembled;
  return Object.freeze({ kind: "prepared", artifact: assembled.artifact });
}

export async function validateProject(input: ValidateProjectInput): Promise<ValidateProjectResult> {
  const prepared = await prepareProject(input);
  if (prepared.kind === "invalid") return prepared;
  return Object.freeze({ kind: "valid", manifestPreview: prepared.artifact.manifest });
}

export async function compileProject(input: CompileProjectInput): Promise<CompileProjectResult> {
  let outputFile: string;
  try {
    outputFile = validateReleaseOutputPath(input.outputFile);
  } catch (error) {
    if (!(error instanceof ProjectPathPolicyError)) throw error;
    return invalid([outputDiagnostic("output-path-invalid", input.outputFile, error.reason)]);
  }

  const prepared = await prepareProject(input);
  if (prepared.kind === "invalid") return prepared;
  try {
    const published = await publishReleaseAtomically({
      outputFile,
      bytes: prepared.artifact.bytes,
      token: randomBytes(12).toString("hex"),
    });
    return Object.freeze({
      kind: "compiled",
      outputFile: published.outputFile,
      releaseId: prepared.artifact.releaseId,
      manifest: prepared.artifact.manifest,
    });
  } catch (error) {
    if (error instanceof OutputCollisionError) {
      return invalid([
        outputDiagnostic("output-collision", outputFile, "different-existing-bytes"),
      ]);
    }
    if (error instanceof TemporaryCleanupError) {
      return invalid([
        outputDiagnostic("temporary-cleanup-failed", outputFile, "temporary-cleanup-failed"),
      ]);
    }
    throw error;
  }
}

export type {
  AggregateAuthority,
  AggregateKind,
  AggregateModelRegistration,
  ApplicationRegistration,
  ArtifactDiagnosticLocation,
  AssetRegistration,
  CapabilityRequirement,
  CommandRegistration,
  CompileProjectInput,
  CompileProjectResult,
  CompiledProject,
  CompilerDiagnostic,
  CompilerDiagnosticCategory,
  ConfigurationDiagnosticLocation,
  ComponentRegistration,
  ContentRegistration,
  DiagnosticLocation,
  HostApiRequirement,
  InvalidProject,
  LocalAggregateModelRegistration,
  LocalCommandRegistration,
  ModelSchemaRegistration,
  ProgressionRegistration,
  ProjectConfiguration,
  ProjectEnvironment,
  RegistrationDiagnosticLocation,
  SchemaRegistration,
  SchemaReference,
  ServerAggregateModelContract,
  SourceDiagnosticLocation,
  SourceExport,
  TrustedCommandContract,
  TrustedMechanicRegistration,
  ValidateProjectInput,
  ValidateProjectResult,
  ValidatedProject,
} from "./project/config.js";
export { PROJECT_FORMAT_VERSION } from "./project/config.js";
export type { CompilerDiagnosticCode } from "./diagnostics/codes.js";
export { privateIpv4Addresses, serveRelease } from "./serve/serve-release.js";
export type { RunningReleaseServer, ServeReleaseInput } from "./serve/serve-release.js";
