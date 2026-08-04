import {
  createReleaseArtifact,
  type CapabilityRequirement,
  type ReleaseArtifact,
  type ReleaseEntryKind,
  type ReleaseMaterialEntry,
} from "@plotpoint/protocol";

import type { DefinitionInspectionMetadata } from "../composition/inspect-definitions.js";
import { createCompilerDiagnostic } from "../diagnostics/create.js";
import type { CompilationSnapshot, CompilerDiagnostic } from "../project/config.js";
import type { ValidatedAsset } from "../validation/assets.js";
import type { ValidatedContent } from "../validation/content.js";
import type { ValidatedSchema } from "../validation/schemas.js";

export interface CompiledBundles {
  readonly logic: Uint8Array;
  readonly presentation: Uint8Array;
}

export interface AssembleReleaseInput {
  readonly snapshot: CompilationSnapshot;
  readonly bundles: CompiledBundles;
  readonly definitions: DefinitionInspectionMetadata;
  readonly aggregateSchemas: ReadonlyMap<string, ValidatedSchema>;
  readonly schemas: ReadonlyMap<string, ValidatedSchema>;
  readonly content: readonly ValidatedContent[];
  readonly assets: readonly ValidatedAsset[];
  readonly capabilities: readonly CapabilityRequirement[];
}

export type AssembleReleaseResult =
  | { readonly kind: "assembled"; readonly artifact: ReleaseArtifact }
  | { readonly kind: "invalid"; readonly diagnostics: readonly CompilerDiagnostic[] };

function invalid(reason: string): AssembleReleaseResult {
  return {
    kind: "invalid",
    diagnostics: Object.freeze([
      createCompilerDiagnostic({
        code: "release-assembly-failed",
        location: { kind: "artifact", path: "manifest.json" },
        details: { reason },
      }),
    ]),
  };
}

function pushDataEntry(
  entries: ReleaseMaterialEntry[],
  path: string,
  kind: ReleaseEntryKind,
  value: unknown,
): void {
  entries.push(Object.freeze({ path, kind, value }));
}

function buildEntries(input: AssembleReleaseInput): readonly ReleaseMaterialEntry[] | null {
  const entries: ReleaseMaterialEntry[] = [
    Object.freeze({ path: "bundles/logic.js", kind: "logic-bundle", bytes: input.bundles.logic }),
    Object.freeze({
      path: "bundles/presentation.js",
      kind: "presentation-bundle",
      bytes: input.bundles.presentation,
    }),
  ];

  for (const registration of input.snapshot.registries.aggregateSchemas) {
    const schema = input.aggregateSchemas.get(registration.id);
    if (schema === undefined) return null;
    entries.push(
      Object.freeze({
        path: `schemas/aggregate/${registration.id}.json`,
        kind: "aggregate-schema",
        bytes: schema.canonicalBytes,
      }),
    );
  }
  for (const registration of input.snapshot.registries.schemas) {
    const schema = input.schemas.get(registration.id);
    if (schema === undefined) return null;
    entries.push(
      Object.freeze({
        path: `schemas/general/${registration.id}.json`,
        kind: "command-schema",
        bytes: schema.canonicalBytes,
      }),
    );
  }
  for (const progression of input.definitions.progressions) {
    pushDataEntry(
      entries,
      `progressions/${progression.registrationId}.json`,
      "progression",
      progression,
    );
  }
  for (const component of input.snapshot.registries.components) {
    const descriptor = {
      id: component.id,
      export: component.implementation.export,
      commands: component.commands,
      content: component.content,
      assets: component.assets,
      capabilities: component.capabilities,
    };
    pushDataEntry(entries, `components/${component.id}.json`, "component-data", descriptor);
  }
  for (const content of input.content) {
    entries.push(
      Object.freeze({
        path: `content/${content.id}.json`,
        kind: "content",
        bytes: content.canonicalBytes,
      }),
    );
  }
  for (const asset of input.assets) {
    entries.push(Object.freeze({ path: asset.releasePath, kind: "asset", bytes: asset.bytes }));
  }
  entries.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  return Object.freeze(entries);
}

export async function assembleRelease(input: AssembleReleaseInput): Promise<AssembleReleaseResult> {
  const entries = buildEntries(input);
  if (entries === null) return invalid("material-encoding-failed");
  const artifact = await createReleaseArtifact({
    hostApi: input.snapshot.config.hostApi,
    aggregateSchemas: Object.freeze(
      input.snapshot.registries.aggregateSchemas.map((registration) =>
        Object.freeze({
          id: registration.id,
          kind: registration.kind,
          version: registration.version,
          path: `schemas/aggregate/${registration.id}.json`,
        }),
      ),
    ),
    capabilities: input.capabilities,
    entrypoints: Object.freeze({
      logic: "bundles/logic.js",
      presentation: "bundles/presentation.js",
    }),
    entries,
  });
  if ("diagnostics" in artifact) {
    return {
      kind: "invalid",
      diagnostics: Object.freeze([
        createCompilerDiagnostic({
          code: "release-self-verification-failed",
          location: { kind: "artifact", path: "manifest.json" },
          details: { reason: artifact.diagnostics[0]?.code ?? "invalid-release" },
        }),
      ]),
    };
  }
  return {
    kind: "assembled",
    artifact,
  };
}
