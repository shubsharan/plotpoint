import {
  bindExecutableAggregateModel,
  defineCommand,
  resolveCommandBinding,
  type Aggregate,
  type Command,
  type CommandDefinition,
  type ExecutableAggregateModel,
  type JsonObject,
  type ResolvedAggregateModel,
  type ResolvedCommandBinding,
  type RuntimeSchema,
} from "@plotpoint/runtime";

type State = JsonObject & { readonly value: number };
type Payload = JsonObject & { readonly amount: number };
type Outcome = JsonObject & { readonly result: string };

const stateSchema: RuntimeSchema<State> = {
  id: "counter.state",
  schemaDigest: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
  validate(value) {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "value" in value &&
      typeof value.value === "number"
    ) {
      return { valid: true, value: { value: value.value } };
    }
    return { valid: false, diagnostics: [] };
  },
};

const initializationSchema: RuntimeSchema<JsonObject> = {
  id: "counter.initialization",
  schemaDigest: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
  validate(value) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return { valid: true, value: {} };
    }
    return { valid: false, diagnostics: [] };
  },
};

const payloadSchema: RuntimeSchema<Payload> = {
  id: "counter.increment.payload",
  schemaDigest: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
  validate(value) {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "amount" in value &&
      typeof value.amount === "number"
    ) {
      return { valid: true, value: { amount: value.amount } };
    }
    return { valid: false, diagnostics: [] };
  },
};

const outcomeSchema: RuntimeSchema<Outcome> = {
  id: "counter.increment.outcome",
  schemaDigest: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
  validate(value) {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "result" in value &&
      typeof value.result === "string"
    ) {
      return { valid: true, value: { result: value.result } };
    }
    return { valid: false, diagnostics: [] };
  },
};

const aggregate: Aggregate<State, "player"> = {
  aggregateId: "player-1",
  modelId: "counter.player",
  aggregateKind: "player",
  schemaId: "counter.state",
  stateVersion: 0,
  state: { value: 1 },
};

// @ts-expect-error aggregate kinds are closed and aggregate state is readonly
aggregate.aggregateKind = "player";
// @ts-expect-error fixture and aggregate state is readonly
aggregate.state.value = 2;

const supersededAggregateSchemaIdentity: Aggregate<State, "player"> = {
  ...aggregate,
  // @ts-expect-error schema generations were replaced by release-pinned schema digests
  schemaVersion: 1,
};
void supersededAggregateSchemaIdentity;

const duplicatedSchemaIdentity: RuntimeSchema<State> = {
  ...stateSchema,
  // @ts-expect-error a runtime schema has one digest-bound identity, not a generation counter
  generation: 1,
};
void duplicatedSchemaIdentity;

const command: Command<Payload, "player"> = {
  id: "command-1",
  type: "increment",
  target: { kind: "player", id: "player-1" },
  expectedStateVersion: 0,
  payload: { amount: 1 },
};

// @ts-expect-error command targets are readonly
command.target.id = "team-1";

const definition = defineCommand<"player", State, Payload, Outcome>({
  definitionId: "counter.increment",
  commandType: "increment",
  aggregateKind: "player",
  handle(target, input) {
    return {
      kind: "accepted",
      nextState: { value: target.state.value + input.payload.amount },
      outcome: { result: "incremented" },
      domainEvents: [],
      effectIntents: [],
      progressionIntents: [],
    };
  },
});

// @ts-expect-error a typed definition cannot be widened into an erased handler registry
const unsafelyErasedDefinition: CommandDefinition<JsonObject, JsonObject, JsonObject, "player"> =
  definition;
void unsafelyErasedDefinition;

const commandBinding = resolveCommandBinding({
  registrationId: "counter.increment",
  definition,
  payloadSchema,
  outcomeSchema,
});
commandBinding satisfies ResolvedCommandBinding<State, "player">;

const erasedCommand: Command<JsonObject, "player"> = command;
const narrowedEvaluation = commandBinding.evaluate({
  aggregate,
  command: erasedCommand,
  observations: [],
});
void narrowedEvaluation;

const playerModel: ResolvedAggregateModel<"player", State> = {
  modelId: "counter.player",
  aggregateKind: "player",
  authority: "local",
  stateSchema,
  initializationSchema,
  initializeState: () => ({ value: 0 }),
  commandsByType: { increment: commandBinding },
  eventSchemas: {},
  effectSchemas: {},
};

const executablePlayerModel = bindExecutableAggregateModel(playerModel);
executablePlayerModel satisfies ExecutableAggregateModel<"player">;

// @ts-expect-error a state-specific model must cross the constructed erased-model boundary
const unsafelyErasedModel: ExecutableAggregateModel<"player"> = playerModel;
void unsafelyErasedModel;

declare const erasedAggregate: Aggregate<JsonObject, "player">;
executablePlayerModel.execute({
  aggregate: erasedAggregate,
  command: erasedCommand,
  observations: [],
});

const duplicatedModelSchemaIdentity: ResolvedAggregateModel<"player", State> = {
  ...playerModel,
  // @ts-expect-error the state schema is the model's sole schema identity source
  schemaDigest: stateSchema.schemaDigest,
};
void duplicatedModelSchemaIdentity;

const serverTeamModel: ResolvedAggregateModel<"team", State> = {
  modelId: "counter.team",
  aggregateKind: "team",
  authority: "server",
  stateSchema,
  initializationSchema,
  initializeState: () => ({ value: 0 }),
  commandsByType: {},
  eventSchemas: {},
  effectSchemas: {},
};
serverTeamModel satisfies ResolvedAggregateModel<"team", State>;

const serverSessionModel: ResolvedAggregateModel<"session", State> = {
  modelId: "counter.session",
  aggregateKind: "session",
  authority: "server",
  stateSchema,
  initializationSchema,
  initializeState: () => ({ value: 0 }),
  commandsByType: {},
  eventSchemas: {},
  effectSchemas: {},
};
serverSessionModel satisfies ResolvedAggregateModel<"session", State>;

const localTeamModel: ResolvedAggregateModel<"team", State> = {
  modelId: "counter.team",
  aggregateKind: "team",
  // @ts-expect-error local authority is restricted to player aggregates
  authority: "local",
  stateSchema,
  initializationSchema,
  initializeState: () => ({ value: 0 }),
  commandsByType: {},
  eventSchemas: {},
  effectSchemas: {},
};
void localTeamModel;

const serverPlayerModel: ResolvedAggregateModel<"player", State> = {
  modelId: "counter.server-player",
  aggregateKind: "player",
  // @ts-expect-error server authority is restricted to team or session aggregates
  authority: "server",
  stateSchema,
  initializationSchema,
  initializeState: () => ({ value: 0 }),
  commandsByType: {},
  eventSchemas: {},
  effectSchemas: {},
};
void serverPlayerModel;
