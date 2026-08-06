import {
  createReleaseArtifact,
  GAME_COMPOSITION_PATH,
  type CapabilityRequirement,
  type GameComposition,
  type ReleaseArtifact,
  type ReleaseEntryKind,
  type ReleaseMaterialEntry,
} from "@plotpoint/protocol";

import { createCompilerDiagnostic } from "../diagnostics/create.js";
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

function canonicalCapabilities(
  values: readonly CapabilityRequirement[],
): readonly CapabilityRequirement[] {
  const byId = new Map<string, CapabilityRequirement>();
  for (const value of values) {
    const prior = byId.get(value.id);
    if (prior === undefined || prior.minimumMinor < value.minimumMinor) {
      byId.set(value.id, Object.freeze({ ...value }));
    }
  }
  return Object.freeze([...byId.values()].sort((left, right) => compareOrdinal(left.id, right.id)));
}

function buildGameComposition(snapshot: CompilationSnapshot): GameComposition {
  const aggregateModels = snapshot.registries.aggregateModels.map((model) => {
    const common = {
      id: model.id,
      stateSchema: schemaReference(model.stateSchema),
      initializationSchema: schemaReference(model.initializationSchema),
      events: Object.freeze(
        model.events.map((entry) =>
          Object.freeze({ type: entry.type, schema: schemaReference(entry.schema) }),
        ),
      ),
      effects: Object.freeze(
        model.effects.map((entry) =>
          Object.freeze({ type: entry.type, schema: schemaReference(entry.schema) }),
        ),
      ),
    } as const;
    return model.authority === "local"
      ? Object.freeze({
          ...common,
          authority: "local" as const,
          kind: "player" as const,
          ...(model.initializationContent === undefined
            ? {}
            : { initializationContent: model.initializationContent }),
        })
      : Object.freeze({
          ...common,
          authority: "server" as const,
          kind: model.kind,
        });
  });
  const commands = snapshot.registries.commands.map((command) =>
    Object.freeze({
      id: command.id,
      type: command.type,
      aggregateModel: command.aggregateModel,
      payloadSchema: schemaReference(command.payloadSchema),
      outcomeSchema: schemaReference(command.outcomeSchema),
      execution: command.execution,
    }),
  );
  const progressions = snapshot.registries.progressions.map((progression) =>
    Object.freeze({ id: progression.id, aggregateModel: progression.aggregateModel }),
  );
  const components = snapshot.registries.components.map((component) =>
    Object.freeze({
      id: component.id,
      commands: component.commands,
      content: component.content,
      assets: component.assets,
      capabilities: canonicalCapabilities(component.capabilities),
      ...(component.sharedProjection === undefined
        ? {}
        : { sharedProjection: schemaReference(component.sharedProjection.id) }),
    }),
  );
  const stateSchemas = new Set(
    snapshot.registries.aggregateModels.map(({ stateSchema }) => stateSchema),
  );
  const resources = [
    ...snapshot.registries.schemas.map((schema) =>
      Object.freeze({
        id: schema.id,
        role: "schema" as const,
        path: generatedReleaseEntryPath(
          stateSchemas.has(schema.id) ? "aggregate-schema" : "schema",
          schema.id,
        ),
      }),
    ),
    ...snapshot.registries.content.map((content) =>
      Object.freeze({
        id: content.id,
        role: "content" as const,
        path: generatedReleaseEntryPath("content", content.id),
        ...(content.schema === undefined ? {} : { schema: schemaReference(content.schema.id) }),
      }),
    ),
    ...snapshot.registries.assets.map((asset) =>
      Object.freeze({ id: asset.id, role: "asset" as const, path: asset.releasePath }),
    ),
    ...snapshot.registries.progressions.map((progression) =>
      Object.freeze({
        id: progression.id,
        role: "progression-descriptor" as const,
        path: generatedReleaseEntryPath("progression", progression.id),
      }),
    ),
    ...snapshot.registries.components.map((component) =>
      Object.freeze({
        id: component.id,
        role: "component-descriptor" as const,
        path: generatedReleaseEntryPath("component", component.id),
      }),
    ),
  ].sort((left, right) =>
    compareOrdinal(
      `${left.id}\0${left.role}\0${left.path}`,
      `${right.id}\0${right.role}\0${right.path}`,
    ),
  );
  const mechanic = snapshot.registries.trustedMechanic;
  return Object.freeze({
    application: Object.freeze({ components: snapshot.registries.application.components }),
    aggregateModels: Object.freeze(aggregateModels),
    commands: Object.freeze(commands),
    progressions: Object.freeze(progressions),
    components: Object.freeze(components),
    resources: Object.freeze(resources),
    ...(mechanic === undefined
      ? {}
      : {
          trustedMechanic: Object.freeze({
            id: mechanic.id,
            aggregateModel: mechanic.aggregateModel,
            commands: mechanic.commands,
            configuration: mechanic.configuration,
            projectionSchema: schemaReference(mechanic.projectionSchema.id),
            capabilities: canonicalCapabilities(mechanic.capabilities),
          }),
        }),
  });
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
  pushDataEntry(entries, GAME_COMPOSITION_PATH, "content", buildGameComposition(input.snapshot));
  entries.sort((left, right) => compareOrdinal(left.path, right.path));
  return Object.freeze(entries);
}

export async function assembleRelease(input: AssembleReleaseInput): Promise<AssembleReleaseResult> {
  const entries = buildEntries(input);
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
            version: 1,
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
  if (JSON.stringify(artifact.manifest.capabilities) !== JSON.stringify(input.capabilities)) {
    return invalid("manifest-capability-mismatch");
  }
  return { kind: "assembled", artifact };
}
