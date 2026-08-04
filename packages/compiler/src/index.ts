import { randomBytes } from "node:crypto";

import type { ReleaseArtifact } from "@plotpoint/protocol";

import { bundleDefinitionInspection, bundleRelease } from "./bundle/bundle-release.js";
import { inspectDefinitionBundle } from "./composition/inspect-definitions.js";
import {
  validateLogicDefinitionExports,
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
import { captureProjectSnapshot, verifySnapshotUnchanged } from "./project/snapshot.js";
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
import { validateContent } from "./validation/content.js";
import { validateProgressions } from "./validation/progression.js";
import { validateSchemas } from "./validation/schemas.js";

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
  const logic = resolveImportGraph(snapshot, snapshot.config.entries.logic, "logic");
  const presentation = resolveImportGraph(
    snapshot,
    snapshot.config.entries.presentation,
    "presentation",
  );
  if (logic.kind === "invalid" || presentation.kind === "invalid") {
    return invalid([
      ...(logic.kind === "invalid" ? logic.diagnostics : []),
      ...(presentation.kind === "invalid" ? presentation.diagnostics : []),
    ]);
  }

  const logicDefinitions = validateLogicDefinitionExports(snapshot.registries, logic.graph);
  if (logicDefinitions.length > 0) return invalid(logicDefinitions);

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
  const content = validateContent(snapshot, schemas.schemas);
  const assets = validateAssets(snapshot);
  if (content.kind === "invalid" || assets.kind === "invalid") {
    return invalid([
      ...(content.kind === "invalid" ? content.diagnostics : []),
      ...(assets.kind === "invalid" ? assets.diagnostics : []),
    ]);
  }

  const inspectionBundle = await bundleDefinitionInspection(snapshot);
  if (inspectionBundle.kind === "invalid") return inspectionBundle;
  const definitions = await inspectDefinitionBundle(inspectionBundle.bytes);
  if (definitions.kind === "invalid") return invalid([definitions.diagnostic]);
  const definitionDiagnostics = [
    ...validateCommands(snapshot.registries, definitions.metadata),
    ...validateProgressions(snapshot.registries, definitions.metadata),
  ];
  if (definitionDiagnostics.length > 0) return invalid(definitionDiagnostics);

  const bundled = await bundleRelease({ logic: logic.graph, presentation: presentation.graph });
  if (bundled.kind === "invalid") return bundled;
  const changedBeforeAssembly = await verifySnapshotUnchanged(snapshot);
  if (changedBeforeAssembly.length > 0) return invalid(changedBeforeAssembly);

  const assembled = await assembleRelease({
    snapshot,
    bundles: { logic: bundled.logic, presentation: bundled.presentation },
    definitions: definitions.metadata,
    aggregateSchemas: schemas.aggregateSchemas,
    schemas: schemas.schemas,
    content: content.content,
    assets: assets.assets,
  });
  if (assembled.kind === "invalid") return assembled;
  const changedBeforeSuccess = await verifySnapshotUnchanged(snapshot);
  if (changedBeforeSuccess.length > 0) return invalid(changedBeforeSuccess);
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
  AggregateKind,
  AggregateSchemaRegistration,
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
  ProgressionRegistration,
  ProjectConfigurationV1,
  ProjectEnvironment,
  RegistrationDiagnosticLocation,
  SchemaRegistration,
  SourceDiagnosticLocation,
  SourceExport,
  ValidateProjectInput,
  ValidateProjectResult,
  ValidatedProject,
} from "./project/config.js";
export type { CompilerDiagnosticCode } from "./diagnostics/codes.js";
