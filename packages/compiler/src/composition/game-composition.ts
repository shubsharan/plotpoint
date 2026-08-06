import type {
  GameCapabilityRequirement,
  GameComposition,
  ResourceBinding,
} from "@plotpoint/protocol";

import type { CanonicalProjectRegistries, CapabilityRequirement } from "../project/config.js";
import { generatedReleaseEntryPath } from "../release/entry-paths.js";

export interface GeneratedAggregateModelContract {
  readonly id: string;
  readonly commandTypes: readonly string[];
  readonly progressionId?: string;
}

export interface GeneratedRootContract {
  readonly aggregateModels: readonly GeneratedAggregateModelContract[];
  readonly components: readonly string[];
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function schemaReference(id: string) {
  return Object.freeze({ id });
}

function canonicalCapabilities(
  values: readonly CapabilityRequirement[],
): readonly GameCapabilityRequirement[] | null {
  const byId = new Map<string, GameCapabilityRequirement>();
  for (const value of values) {
    const prior = byId.get(value.id);
    if (prior !== undefined && prior.major !== value.major) return null;
    if (prior === undefined || prior.minimumMinor < value.minimumMinor) {
      byId.set(value.id, Object.freeze({ ...value }));
    }
  }
  return Object.freeze([...byId.values()].sort((left, right) => compareOrdinal(left.id, right.id)));
}

export function gameCompositionCapabilities(
  composition: GameComposition,
): readonly GameCapabilityRequirement[] | null {
  return canonicalCapabilities([
    ...composition.components.flatMap((component) => component.capabilities),
    ...(composition.trustedMechanic?.capabilities ?? []),
  ]);
}

export function capabilitiesEqual(
  composition: GameComposition,
  manifestCapabilities: readonly CapabilityRequirement[],
): boolean {
  const expected = gameCompositionCapabilities(composition);
  const actual = canonicalCapabilities(manifestCapabilities);
  return (
    expected !== null &&
    actual !== null &&
    expected.length === actual.length &&
    expected.every((requirement, index) => {
      const candidate = actual[index];
      return (
        candidate !== undefined &&
        requirement.id === candidate.id &&
        requirement.major === candidate.major &&
        requirement.minimumMinor === candidate.minimumMinor
      );
    })
  );
}

export function buildGameComposition(registries: CanonicalProjectRegistries): GameComposition {
  const aggregateModels = registries.aggregateModels.map((model) => {
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
  const commands = registries.commands.map((command) =>
    Object.freeze({
      id: command.id,
      type: command.type,
      aggregateModel: command.aggregateModel,
      payloadSchema: schemaReference(command.payloadSchema),
      outcomeSchema: schemaReference(command.outcomeSchema),
      execution: command.execution,
    }),
  );
  const progressions = registries.progressions.map((progression) =>
    Object.freeze({ id: progression.id, aggregateModel: progression.aggregateModel }),
  );
  const components = registries.components.map((component) => {
    const capabilities = canonicalCapabilities(component.capabilities);
    if (capabilities === null) {
      throw new Error("Canonical registries contain conflicting component capabilities");
    }
    return Object.freeze({
      id: component.id,
      commands: component.commands,
      content: component.content,
      assets: component.assets,
      capabilities,
      ...(component.sharedProjection === undefined
        ? {}
        : { sharedProjection: schemaReference(component.sharedProjection.id) }),
    });
  });
  const stateSchemas = new Set(registries.aggregateModels.map(({ stateSchema }) => stateSchema));
  const resources: ResourceBinding[] = [
    ...registries.schemas.map((schema) =>
      Object.freeze({
        id: schema.id,
        role: "schema" as const,
        path: generatedReleaseEntryPath(
          stateSchemas.has(schema.id) ? "aggregate-schema" : "schema",
          schema.id,
        ),
      }),
    ),
    ...registries.content.map((content) =>
      Object.freeze({
        id: content.id,
        role: "content" as const,
        path: generatedReleaseEntryPath("content", content.id),
        ...(content.schema === undefined ? {} : { schema: schemaReference(content.schema.id) }),
      }),
    ),
    ...registries.assets.map((asset) =>
      Object.freeze({ id: asset.id, role: "asset" as const, path: asset.releasePath }),
    ),
    ...registries.progressions.map((progression) =>
      Object.freeze({
        id: progression.id,
        role: "progression-descriptor" as const,
        path: generatedReleaseEntryPath("progression", progression.id),
      }),
    ),
    ...registries.components.map((component) =>
      Object.freeze({
        id: component.id,
        role: "component-descriptor" as const,
        path: generatedReleaseEntryPath("component", component.id),
      }),
    ),
  ];
  resources.sort((left, right) =>
    compareOrdinal(
      `${left.id}\0${left.role}\0${left.path}`,
      `${right.id}\0${right.role}\0${right.path}`,
    ),
  );
  const mechanic = registries.trustedMechanic;
  const mechanicCapabilities =
    mechanic === undefined ? undefined : canonicalCapabilities(mechanic.capabilities);
  if (mechanicCapabilities === null) {
    throw new Error("Canonical registries contain conflicting trusted-mechanic capabilities");
  }
  return Object.freeze({
    application: Object.freeze({ components: registries.application.components }),
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
            capabilities: mechanicCapabilities ?? Object.freeze([]),
          }),
        }),
  });
}

export function gameCompositionMatchesGeneratedRoots(
  composition: GameComposition,
  generated: GeneratedRootContract,
): boolean {
  const expectedModels = composition.aggregateModels
    .filter((model) => model.authority === "local")
    .map((model) => {
      const progression = composition.progressions.find(
        (candidate) => candidate.aggregateModel === model.id,
      );
      return {
        id: model.id,
        commandTypes: composition.commands
          .filter((command) => command.execution === "local" && command.aggregateModel === model.id)
          .map(({ type }) => type),
        ...(progression === undefined ? {} : { progressionId: progression.id }),
      };
    });
  return (
    JSON.stringify(expectedModels) === JSON.stringify(generated.aggregateModels) &&
    JSON.stringify(composition.components.map(({ id }) => id)) ===
      JSON.stringify(generated.components)
  );
}
