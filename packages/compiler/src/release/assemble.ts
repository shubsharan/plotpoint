import {
  compareOrdinal,
  encodeCanonicalJson,
  inspectRelease,
  sha256Digest,
  writeStoredZip,
  type CapabilityRequirement,
  type ReleaseArtifact,
  type ReleaseEntryKind,
  type ReleaseInventoryEntry,
  type ReleaseManifestV1,
  type StoredZipEntry,
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
}

export type AssembleReleaseResult =
  | { readonly kind: "assembled"; readonly artifact: ReleaseArtifact }
  | { readonly kind: "invalid"; readonly diagnostics: readonly CompilerDiagnostic[] };

interface MaterialEntry extends StoredZipEntry {
  readonly kind: ReleaseEntryKind;
}

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

function encodeData(value: unknown): Uint8Array | null {
  const encoded = encodeCanonicalJson(value);
  return encoded.kind === "valid" ? encoded.document.bytes : null;
}

function deriveCapabilities(
  snapshot: CompilationSnapshot,
): readonly CapabilityRequirement[] | null {
  const byId = new Map<string, CapabilityRequirement>();
  for (const component of snapshot.registries.components) {
    for (const requirement of component.capabilities) {
      const previous = byId.get(requirement.id);
      if (previous !== undefined && previous.major !== requirement.major) return null;
      byId.set(
        requirement.id,
        Object.freeze({
          id: requirement.id,
          major: requirement.major,
          minimumMinor: Math.max(previous?.minimumMinor ?? 0, requirement.minimumMinor),
        }),
      );
    }
  }
  return Object.freeze([...byId.values()].sort((left, right) => compareOrdinal(left.id, right.id)));
}

function pushDataEntry(
  entries: MaterialEntry[],
  path: string,
  kind: ReleaseEntryKind,
  value: unknown,
): boolean {
  const bytes = encodeData(value);
  if (bytes === null) return false;
  entries.push(Object.freeze({ path, kind, bytes }));
  return true;
}

function buildEntries(input: AssembleReleaseInput): readonly MaterialEntry[] | null {
  const entries: MaterialEntry[] = [
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
    if (
      !pushDataEntry(
        entries,
        `progressions/${progression.registrationId}.json`,
        "progression",
        progression,
      )
    ) {
      return null;
    }
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
    if (!pushDataEntry(entries, `components/${component.id}.json`, "component-data", descriptor)) {
      return null;
    }
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
  entries.sort((left, right) => compareOrdinal(left.path, right.path));
  return Object.freeze(entries);
}

function inventory(entries: readonly MaterialEntry[]): readonly ReleaseInventoryEntry[] {
  return Object.freeze(
    entries.map((entry) =>
      Object.freeze({
        path: entry.path,
        kind: entry.kind,
        byteLength: entry.bytes.byteLength,
        digest: sha256Digest(entry.bytes),
      }),
    ),
  );
}

export async function assembleRelease(input: AssembleReleaseInput): Promise<AssembleReleaseResult> {
  const entries = buildEntries(input);
  if (entries === null) return invalid("material-encoding-failed");
  const capabilities = deriveCapabilities(input.snapshot);
  if (capabilities === null) return invalid("capability-major-conflict");

  const manifest: ReleaseManifestV1 = {
    releaseFormatVersion: 1,
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
    capabilities,
    entrypoints: Object.freeze({
      logic: "bundles/logic.js",
      presentation: "bundles/presentation.js",
    }),
    inventory: inventory(entries),
  };
  const encodedManifest = encodeCanonicalJson(manifest);
  if (encodedManifest.kind === "invalid") return invalid("manifest-encoding-failed");
  const written = writeStoredZip([
    ...entries.map(({ path, bytes }) => ({ path, bytes })),
    { path: "manifest.json", bytes: encodedManifest.document.bytes },
  ]);
  if (written.kind === "invalid") return invalid("container-write-failed");
  const inspected = await inspectRelease(written.bytes);
  if (inspected.kind === "invalid") {
    return {
      kind: "invalid",
      diagnostics: Object.freeze([
        createCompilerDiagnostic({
          code: "release-self-verification-failed",
          location: { kind: "artifact", path: "manifest.json" },
          details: { reason: inspected.diagnostics[0]?.code ?? "invalid-release" },
        }),
      ]),
    };
  }
  return {
    kind: "assembled",
    artifact: Object.freeze({
      bytes: written.bytes,
      manifest: inspected.manifest,
      releaseId: inspected.releaseId,
    }),
  };
}
