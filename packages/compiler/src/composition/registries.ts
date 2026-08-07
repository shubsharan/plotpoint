import { createCompilerDiagnostic } from "../diagnostics/create.js";
import { orderCompilerDiagnostics } from "../diagnostics/order.js";
import type {
  AggregateModelRegistration,
  ApplicationRegistration,
  AssetRegistration,
  CanonicalProjectRegistries,
  CommandRegistration,
  ComponentRegistration,
  ContentRegistration,
  ProjectConfiguration,
  ProgressionRegistration,
  SchemaReference,
  SchemaRegistration,
  SourceExport,
  TrustedMechanicRegistration,
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

function copySchemaReference(value: SchemaReference): SchemaReference {
  return Object.freeze({ id: value.id });
}

function copyApplication(value: ApplicationRegistration): ApplicationRegistration {
  return Object.freeze({
    definition: copySourceExport(value.definition),
    components: Object.freeze([...value.components].sort(compareOrdinal)),
  });
}

function copyAggregateModel(value: AggregateModelRegistration): AggregateModelRegistration {
  const common = {
    id: value.id,
    stateSchema: value.stateSchema,
    initializationSchema: value.initializationSchema,
    events: Object.freeze(
      value.events
        .map((entry) => Object.freeze({ type: entry.type, schema: entry.schema }))
        .sort((left, right) => compareOrdinal(left.type, right.type)),
    ),
    effects: Object.freeze(
      value.effects
        .map((entry) => Object.freeze({ type: entry.type, schema: entry.schema }))
        .sort((left, right) => compareOrdinal(left.type, right.type)),
    ),
  } as const;
  if (value.authority === "server") {
    return Object.freeze({ ...common, authority: "server" as const, kind: value.kind });
  }
  return Object.freeze({
    ...common,
    authority: "local" as const,
    kind: "player" as const,
    initializer: copySourceExport(value.initializer),
    ...(value.initializationContent === undefined
      ? {}
      : { initializationContent: value.initializationContent }),
  });
}

function copyCommand(value: CommandRegistration): CommandRegistration {
  const common = {
    id: value.id,
    type: value.type,
    aggregateModel: value.aggregateModel,
    payloadSchema: value.payloadSchema,
    outcomeSchema: value.outcomeSchema,
  } as const;
  return value.execution === "local"
    ? Object.freeze({
        ...common,
        execution: "local" as const,
        definition: copySourceExport(value.definition),
      })
    : Object.freeze({ ...common, execution: "trusted-mechanic" as const });
}

function copySchema(value: SchemaRegistration): SchemaRegistration {
  return Object.freeze({ ...value });
}

function copyProgression(value: ProgressionRegistration): ProgressionRegistration {
  return Object.freeze({ ...value, definition: copySourceExport(value.definition) });
}

function copyComponent(value: ComponentRegistration): ComponentRegistration {
  return Object.freeze({
    id: value.id,
    implementation: copySourceExport(value.implementation),
    commands: Object.freeze([...value.commands].sort(compareOrdinal)),
    content: Object.freeze([...value.content].sort(compareOrdinal)),
    assets: Object.freeze([...value.assets].sort(compareOrdinal)),
    capabilities: Object.freeze(
      value.capabilities
        .map((capability) => Object.freeze({ ...capability }))
        .sort((left, right) => compareOrdinal(left.id, right.id)),
    ),
    ...(value.sharedProjection === undefined
      ? {}
      : { sharedProjection: copySchemaReference(value.sharedProjection) }),
  });
}

function copyContent(value: ContentRegistration): ContentRegistration {
  return Object.freeze({
    id: value.id,
    path: value.path,
    ...(value.schema === undefined ? {} : { schema: copySchemaReference(value.schema) }),
  });
}

function copyAsset(value: AssetRegistration): AssetRegistration {
  return Object.freeze({ ...value });
}

function copyTrustedMechanic(value: TrustedMechanicRegistration): TrustedMechanicRegistration {
  return Object.freeze({
    id: value.id,
    aggregateModel: value.aggregateModel,
    commands: Object.freeze([...value.commands].sort(compareOrdinal)),
    configuration: value.configuration,
    projectionSchema: copySchemaReference(value.projectionSchema),
    capabilities: Object.freeze(
      value.capabilities
        .map((capability) => Object.freeze({ ...capability }))
        .sort((left, right) => compareOrdinal(left.id, right.id)),
    ),
  });
}

function canonicalRegistry<T extends { readonly id: string }>(
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
  const aggregateModels = canonicalRegistry(config.aggregateModels, copyAggregateModel);
  const commands = canonicalRegistry(config.commands, copyCommand);
  const schemas = canonicalRegistry(config.schemas, copySchema);
  const progressions = canonicalRegistry(config.progressions, copyProgression);
  const components = canonicalRegistry(config.components, copyComponent);
  const content = canonicalRegistry(config.content, copyContent);
  const assets = canonicalRegistry(config.assets, copyAsset);
  const results = [
    ["aggregateModels", aggregateModels],
    ["commands", commands],
    ["schemas", schemas],
    ["progressions", progressions],
    ["components", components],
    ["content", content],
    ["assets", assets],
  ] as const;
  const diagnostics: ReturnType<typeof createCompilerDiagnostic>[] = [];

  for (const [registration, result] of results) {
    if (result.kind !== "invalid") continue;
    diagnostics.push(
      createCompilerDiagnostic({
        code: "configuration-identity-duplicate",
        location: { kind: "registration", registration, id: result.duplicateId },
        details: { id: result.duplicateId, registry: registration },
      }),
    );
  }
  if (diagnostics.length > 0) {
    return { kind: "invalid", diagnostics: orderCompilerDiagnostics(diagnostics) };
  }
  if (
    aggregateModels.kind !== "valid" ||
    commands.kind !== "valid" ||
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
      application: copyApplication(config.application),
      aggregateModels: aggregateModels.values,
      commands: commands.values,
      schemas: schemas.values,
      progressions: progressions.values,
      components: components.values,
      content: content.values,
      assets: assets.values,
      ...(config.trustedMechanic === undefined
        ? {}
        : { trustedMechanic: copyTrustedMechanic(config.trustedMechanic) }),
    }),
  };
}
