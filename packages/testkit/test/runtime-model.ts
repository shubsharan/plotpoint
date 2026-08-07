import {
  bindExecutableAggregateModel,
  type AggregateAuthorityForKind,
  type AggregateKind,
  type JsonObject,
  type ProgressionDefinition,
  type ResolvedAggregateModel,
  type ResolvedCommandBinding,
  type RuntimeSchema,
} from "@plotpoint/runtime";

const TEST_SCHEMA_DIGEST =
  "sha256:0000000000000000000000000000000000000000000000000000000000000000" as const;

export function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function runtimeSchema<Value extends JsonObject>(
  id: string,
  validate: (value: unknown) => value is Value,
): RuntimeSchema<Value> {
  return Object.freeze({
    id,
    schemaDigest: TEST_SCHEMA_DIGEST,
    validate(value: unknown) {
      return validate(value)
        ? { valid: true as const, value }
        : { valid: false as const, diagnostics: [] };
    },
  });
}

export function modelFixture<Kind extends AggregateKind, State extends JsonObject>(input: {
  readonly modelId: string;
  readonly aggregateKind: Kind;
  readonly authority: AggregateAuthorityForKind<Kind>;
  readonly stateSchema: RuntimeSchema<State>;
  readonly initializeState: (input: JsonObject) => State;
  readonly commandsByType?: Readonly<Record<string, ResolvedCommandBinding<State, Kind>>>;
  readonly eventSchemas?: Readonly<Record<string, RuntimeSchema<JsonObject>>>;
  readonly effectSchemas?: Readonly<Record<string, RuntimeSchema<JsonObject>>>;
  readonly progression?: Kind extends "player" ? ProgressionDefinition<State, Kind> : never;
}) {
  const initializationSchema = runtimeSchema(`${input.modelId}.initialization`, isJsonObject);
  const model: ResolvedAggregateModel<Kind, State> = {
    modelId: input.modelId,
    aggregateKind: input.aggregateKind,
    authority: input.authority,
    stateSchema: input.stateSchema,
    initializationSchema,
    initializeState: input.initializeState,
    commandsByType: input.commandsByType ?? {},
    eventSchemas: input.eventSchemas ?? {},
    effectSchemas: input.effectSchemas ?? {},
    ...(input.progression === undefined ? {} : { progression: input.progression }),
  };
  return bindExecutableAggregateModel(model);
}
