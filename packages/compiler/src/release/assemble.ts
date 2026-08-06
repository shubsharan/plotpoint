import {
  createReleaseArtifact,
  GAME_COMPOSITION_PATH,
  type CapabilityRequirement,
  type ReleaseArtifact,
  type ReleaseEntryKind,
  type ReleaseMaterialEntry,
} from "@plotpoint/protocol";

import { createCompilerDiagnostic } from "../diagnostics/create.js";
import { buildGameComposition, capabilitiesEqual } from "../composition/game-composition.js";
import type { CompilationSnapshot, CompilerDiagnostic } from "../project/config.js";
import type { ValidatedAsset } from "../validation/assets.js";
import type { ValidatedContent } from "../validation/content.js";
import type { ValidatedSchema } from "../validation/schemas.js";
import { generatedReleaseEntryPath } from "./entry-paths.js";

export interface CompiledBundles {
  readonly logic: Uint8Array;
  readonly presentation: Uint8Array;
}

export interface AssembleReleaseInput {
  readonly snapshot: CompilationSnapshot;
  readonly bundles: CompiledBundles;
  readonly schemas: ReadonlyMap<string, ValidatedSchema>;
  readonly content: readonly ValidatedContent[];
  readonly assets: readonly ValidatedAsset[];
  readonly capabilities: readonly CapabilityRequirement[];
}

export type AssembleReleaseResult =
  | { readonly kind: "assembled"; readonly artifact: ReleaseArtifact }
  | { readonly kind: "invalid"; readonly diagnostics: readonly CompilerDiagnostic[] };

function invalid(reason: string, path = "manifest.json"): AssembleReleaseResult {
  return {
    kind: "invalid",
    diagnostics: Object.freeze([
      createCompilerDiagnostic({
        code: "release-assembly-failed",
        location: { kind: "artifact", path },
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

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function schemaReference(id: string) {
  return Object.freeze({ id });
}

function buildEntries(
  input: AssembleReleaseInput,
  composition: ReturnType<typeof buildGameComposition>,
): readonly ReleaseMaterialEntry[] | null {
  const entries: ReleaseMaterialEntry[] = [
    Object.freeze({ path: "bundles/logic.js", kind: "logic-bundle", bytes: input.bundles.logic }),
    Object.freeze({
      path: "bundles/presentation.js",
      kind: "presentation-bundle",
      bytes: input.bundles.presentation,
    }),
  ];
  const stateSchemas = new Set(
    input.snapshot.registries.aggregateModels.map(({ stateSchema }) => stateSchema),
  );
  for (const registration of input.snapshot.registries.schemas) {
    const schema = input.schemas.get(registration.id);
    if (schema === undefined) return null;
    const aggregate = stateSchemas.has(registration.id);
    entries.push(
      Object.freeze({
        path: generatedReleaseEntryPath(aggregate ? "aggregate-schema" : "schema", registration.id),
        kind: aggregate ? "aggregate-schema" : "command-schema",
        bytes: schema.canonicalBytes,
      }),
    );
  }
  for (const progression of input.snapshot.registries.progressions) {
    pushDataEntry(
      entries,
      generatedReleaseEntryPath("progression", progression.id),
      "progression",
      { id: progression.id, aggregateModel: progression.aggregateModel },
    );
  }
  for (const component of input.snapshot.registries.components) {
    pushDataEntry(entries, generatedReleaseEntryPath("component", component.id), "component-data", {
      id: component.id,
      commands: component.commands,
      content: component.content,
      assets: component.assets,
      capabilities: component.capabilities,
      ...(component.sharedProjection === undefined
        ? {}
        : { sharedProjection: schemaReference(component.sharedProjection.id) }),
    });
  }
  for (const content of input.content) {
    entries.push(
      Object.freeze({
        path: generatedReleaseEntryPath("content", content.id),
        kind: "content",
        bytes: content.canonicalBytes,
      }),
    );
  }
  for (const asset of input.assets) {
    entries.push(Object.freeze({ path: asset.releasePath, kind: "asset", bytes: asset.bytes }));
  }
  pushDataEntry(entries, GAME_COMPOSITION_PATH, "content", composition);
  entries.sort((left, right) => compareOrdinal(left.path, right.path));
  return Object.freeze(entries);
}

export async function assembleRelease(input: AssembleReleaseInput): Promise<AssembleReleaseResult> {
  const composition = buildGameComposition(input.snapshot.registries);
  if (!capabilitiesEqual(composition, input.capabilities)) {
    return invalid("manifest-capability-mismatch");
  }
  const entries = buildEntries(input, composition);
  if (entries === null) return invalid("material-encoding-failed");
  const modelSchemas = new Map<
    string,
    { readonly id: string; readonly kind: "player" | "team" | "session" }
  >();
  for (const model of input.snapshot.registries.aggregateModels) {
    const prior = modelSchemas.get(model.stateSchema);
    if (prior !== undefined && prior.kind !== model.kind) {
      return invalid("aggregate-schema-kind-conflict", GAME_COMPOSITION_PATH);
    }
    modelSchemas.set(model.stateSchema, { id: model.stateSchema, kind: model.kind });
  }
  const artifact = await createReleaseArtifact({
    hostApi: input.snapshot.config.hostApi,
    aggregateSchemas: Object.freeze(
      [...modelSchemas.values()]
        .sort((left, right) => compareOrdinal(left.id, right.id))
        .map((registration) =>
          Object.freeze({
            id: registration.id,
            kind: registration.kind,
            path: generatedReleaseEntryPath("aggregate-schema", registration.id),
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
  return { kind: "assembled", artifact };
}
