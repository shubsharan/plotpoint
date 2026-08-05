import { createCompilerDiagnostic } from "../diagnostics/create.js";
import type {
  AggregateSchemaRegistration,
  AssetRegistration,
  CanonicalProjectRegistries,
  CommandRegistration,
  ComponentRegistration,
  ContentRegistration,
  ProjectConfiguration,
  ProgressionRegistration,
  SchemaRegistration,
  SourceExport,
} from "../project/config.js";

export type BuildCanonicalRegistriesResult =
  | { readonly kind: "valid"; readonly registries: CanonicalProjectRegistries }
  | {
      readonly kind: "invalid";
      readonly diagnostics: readonly ReturnType<typeof createCompilerDiagnostic>[];
    };

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function copySourceExport(value: SourceExport): SourceExport {
  return Object.freeze({ source: value.source, export: value.export });
}

function copyCommand(value: CommandRegistration): CommandRegistration {
  return Object.freeze({ ...value, definition: copySourceExport(value.definition) });
}

function copyAggregateSchema(value: AggregateSchemaRegistration): AggregateSchemaRegistration {
  return Object.freeze({ ...value });
}

function copySchema(value: SchemaRegistration): SchemaRegistration {
  return Object.freeze({ ...value });
}

function copyProgression(value: ProgressionRegistration): ProgressionRegistration {
  return Object.freeze({
    ...value,
    definition: copySourceExport(value.definition),
    commands: Object.freeze([...value.commands].sort(compareOrdinal)),
    content: Object.freeze([...value.content].sort(compareOrdinal)),
    components: Object.freeze([...value.components].sort(compareOrdinal)),
  });
}

function copyComponent(value: ComponentRegistration): ComponentRegistration {
  return Object.freeze({
    ...value,
    implementation: copySourceExport(value.implementation),
    commands: Object.freeze([...value.commands].sort(compareOrdinal)),
    content: Object.freeze([...value.content].sort(compareOrdinal)),
    assets: Object.freeze([...value.assets].sort(compareOrdinal)),
    capabilities: Object.freeze(
      value.capabilities
        .map((capability) => Object.freeze({ ...capability }))
        .sort((left, right) => compareOrdinal(left.id, right.id)),
    ),
  });
}

function copyContent(value: ContentRegistration): ContentRegistration {
  return Object.freeze({ ...value });
}

function copyAsset(value: AssetRegistration): AssetRegistration {
  return Object.freeze({ ...value });
}

function canonicalRegistry<T extends { readonly id: string }>(
  registration: string,
  values: readonly T[],
  copy: (value: T) => T,
):
  | { readonly kind: "valid"; readonly values: readonly T[] }
  | { readonly kind: "invalid"; readonly duplicateId: string } {
  const ids = new Set<string>();
  const copied: T[] = [];
  for (const value of values) {
    if (ids.has(value.id)) return { kind: "invalid", duplicateId: value.id };
    ids.add(value.id);
    copied.push(copy(value));
  }
  copied.sort((left, right) => compareOrdinal(left.id, right.id));
  return { kind: "valid", values: Object.freeze(copied) };
}

export function buildCanonicalRegistries(
  config: ProjectConfiguration,
): BuildCanonicalRegistriesResult {
  const commands = canonicalRegistry("commands", config.commands, copyCommand);
  const aggregateSchemas = canonicalRegistry(
    "aggregateSchemas",
    config.aggregateSchemas,
    copyAggregateSchema,
  );
  const schemas = canonicalRegistry("schemas", config.schemas, copySchema);
  const progressions = canonicalRegistry("progressions", config.progressions, copyProgression);
  const components = canonicalRegistry("components", config.components, copyComponent);
  const content = canonicalRegistry("content", config.content, copyContent);
  const assets = canonicalRegistry("assets", config.assets, copyAsset);
  const results = [
    ["commands", commands],
    ["aggregateSchemas", aggregateSchemas],
    ["schemas", schemas],
    ["progressions", progressions],
    ["components", components],
    ["content", content],
    ["assets", assets],
  ] as const;

  for (const [registration, result] of results) {
    if (result.kind === "invalid") {
      return {
        kind: "invalid",
        diagnostics: Object.freeze([
          createCompilerDiagnostic({
            code: "composition-reference-duplicate",
            location: { kind: "registration", registration, id: result.duplicateId },
            details: { id: result.duplicateId },
          }),
        ]),
      };
    }
  }

  if (
    commands.kind !== "valid" ||
    aggregateSchemas.kind !== "valid" ||
    schemas.kind !== "valid" ||
    progressions.kind !== "valid" ||
    components.kind !== "valid" ||
    content.kind !== "valid" ||
    assets.kind !== "valid"
  ) {
    throw new Error("Unreachable invalid registry result");
  }

  return {
    kind: "valid",
    registries: Object.freeze({
      commands: commands.values,
      aggregateSchemas: aggregateSchemas.values,
      schemas: schemas.values,
      progressions: progressions.values,
      components: components.values,
      content: content.values,
      assets: assets.values,
    }),
  };
}
