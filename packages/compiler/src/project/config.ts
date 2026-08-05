import { CONTRACT_VERSIONS, type ReleaseId, type ReleaseManifest } from "@plotpoint/protocol";
import type { JsonObject } from "@plotpoint/runtime";

import type { CompilerDiagnosticCode } from "../diagnostics/codes.js";

export type ProjectEnvironment = "web";
export type AggregateKind = "player" | "team" | "session";

export interface HostApiRequirement {
  readonly major: number;
  readonly minimumMinor: number;
}

export interface SourceExport {
  readonly source: string;
  readonly export: string;
}

export interface AggregateSchemaRegistration {
  readonly id: string;
  readonly kind: AggregateKind;
  readonly version: number;
  readonly path: string;
}

export interface SchemaRegistration {
  readonly id: string;
  readonly path: string;
}

export interface CommandRegistration {
  readonly id: string;
  readonly type: string;
  readonly definition: SourceExport;
  readonly aggregateSchema: string;
  readonly payloadSchema: string;
  readonly outcomeSchema: string;
}

export interface ProgressionRegistration {
  readonly id: string;
  readonly version: number;
  readonly kind: AggregateKind;
  readonly definition: SourceExport;
  readonly aggregateSchema: string;
  readonly commands: readonly string[];
  readonly content: readonly string[];
  readonly components: readonly string[];
}

export interface CapabilityRequirement {
  readonly id: string;
  readonly major: number;
  readonly minimumMinor: number;
}

export interface ComponentRegistration {
  readonly id: string;
  readonly implementation: SourceExport;
  readonly commands: readonly string[];
  readonly content: readonly string[];
  readonly assets: readonly string[];
  readonly capabilities: readonly CapabilityRequirement[];
}

export interface ContentRegistration {
  readonly id: string;
  readonly path: string;
  readonly schema?: string;
}

export interface AssetRegistration {
  readonly id: string;
  readonly path: string;
  readonly releasePath: string;
}

export interface ProjectConfiguration {
  readonly projectFormatVersion: typeof CONTRACT_VERSIONS.projectConfiguration;
  readonly environment: ProjectEnvironment;
  readonly hostApi: HostApiRequirement;
  readonly entries: {
    readonly logic: SourceExport;
    readonly presentation: SourceExport;
  };
  readonly commands: readonly CommandRegistration[];
  readonly aggregateSchemas: readonly AggregateSchemaRegistration[];
  readonly schemas: readonly SchemaRegistration[];
  readonly progressions: readonly ProgressionRegistration[];
  readonly components: readonly ComponentRegistration[];
  readonly content: readonly ContentRegistration[];
  readonly assets: readonly AssetRegistration[];
}

export interface CanonicalProjectRegistries {
  readonly commands: readonly CommandRegistration[];
  readonly aggregateSchemas: readonly AggregateSchemaRegistration[];
  readonly schemas: readonly SchemaRegistration[];
  readonly progressions: readonly ProgressionRegistration[];
  readonly components: readonly ComponentRegistration[];
  readonly content: readonly ContentRegistration[];
  readonly assets: readonly AssetRegistration[];
}

export type SnapshotFileKind = "config" | "source" | "dependency" | "schema" | "content" | "asset";

export interface SnapshotFile {
  readonly kind: SnapshotFileKind;
  readonly projectPath: string;
  readonly bytes: Uint8Array;
}

export interface CompilationSnapshot {
  readonly config: ProjectConfiguration;
  readonly registries: CanonicalProjectRegistries;
  readonly files: ReadonlyMap<string, SnapshotFile>;
}

export interface ValidateProjectInput {
  readonly projectRoot: string;
  readonly configPath?: string;
}

export interface CompileProjectInput extends ValidateProjectInput {
  readonly outputFile: string;
}

export interface ConfigurationDiagnosticLocation {
  readonly kind: "configuration";
  readonly path: string;
  readonly pointer: string;
}

export interface SourceDiagnosticLocation {
  readonly kind: "source";
  readonly path: string;
  readonly line: number;
  readonly column: number;
}

export interface RegistrationDiagnosticLocation {
  readonly kind: "registration";
  readonly registration: string;
  readonly id: string;
  readonly field?: string;
}

export interface ArtifactDiagnosticLocation {
  readonly kind: "artifact";
  readonly path: string;
  readonly relationship?: string;
}

export type DiagnosticLocation =
  | ConfigurationDiagnosticLocation
  | SourceDiagnosticLocation
  | RegistrationDiagnosticLocation
  | ArtifactDiagnosticLocation;

export const COMPILER_DIAGNOSTIC_CATEGORIES = [
  "configuration",
  "import-boundary",
  "composition",
  "command",
  "schema",
  "progression",
  "component",
  "content",
  "asset",
  "compatibility",
  "integrity",
] as const;

export type CompilerDiagnosticCategory = (typeof COMPILER_DIAGNOSTIC_CATEGORIES)[number];

export interface CompilerDiagnostic {
  readonly category: CompilerDiagnosticCategory;
  readonly code: CompilerDiagnosticCode;
  readonly severity: "error";
  readonly location: DiagnosticLocation;
  readonly details: JsonObject;
  readonly related: readonly DiagnosticLocation[];
}

export interface ValidatedProject {
  readonly kind: "valid";
  readonly manifestPreview: ReleaseManifest;
}

export interface InvalidProject {
  readonly kind: "invalid";
  readonly diagnostics: readonly CompilerDiagnostic[];
}

export interface CompiledProject {
  readonly kind: "compiled";
  readonly outputFile: string;
  readonly releaseId: ReleaseId;
  readonly manifest: ReleaseManifest;
}

export type ValidateProjectResult = ValidatedProject | InvalidProject;
export type CompileProjectResult = CompiledProject | InvalidProject;
