import type {
  CommandBindingEvaluation,
  ExecutableAggregateModel,
  InitializationResult,
  ResolvedAggregateModel,
  ResolvedCommandBinding,
  RuntimeSchema,
  SchemaValidationResult,
} from "./aggregate-model.js";
import {
  isAggregateAuthority,
  isAggregateKind,
  validateAggregate,
  type Aggregate,
  type AggregateKind,
} from "./aggregates.js";
import { canonicalizeValue, type JsonObject } from "./canonical-json.js";
import type { Command, CommandDefinition, HandlerDecision } from "./commands.js";
import { createDiagnostic } from "./diagnostics.js";
import {
  executeCommandWithEvaluator,
  preflightInvalidResult,
  type EvaluatedCommand,
} from "./execute-command.js";
import {
  createObservationCursor,
  type Observation,
  type TransitionContext,
} from "./observations.js";
import { initialProgression } from "./progression/graph.js";

const commandBindingEvaluator = Symbol("commandBindingEvaluator");

interface ConstructedCommandBinding<
  State extends JsonObject,
  Kind extends AggregateKind,
> extends ResolvedCommandBinding<State, Kind> {
  [commandBindingEvaluator](
    aggregate: Aggregate<State, Kind>,
    command: Command<JsonObject, Kind>,
    context: TransitionContext,
  ): EvaluatedCommand<State, JsonObject>;
}

function isConstructedCommandBinding<State extends JsonObject, Kind extends AggregateKind>(
  binding: ResolvedCommandBinding<State, Kind>,
): binding is ConstructedCommandBinding<State, Kind> {
  return commandBindingEvaluator in binding;
}

function isValidSchema(value: unknown): value is RuntimeSchema<JsonObject> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const schema = value as Record<string | symbol, unknown>;
  return (
    typeof schema.id === "string" &&
    schema.id.length > 0 &&
    typeof schema.schemaDigest === "string" &&
    /^sha256:[0-9a-f]{64}$/.test(schema.schemaDigest) &&
    typeof schema.validate === "function" &&
    Object.keys(schema).every(
      (field) => field === "id" || field === "schemaDigest" || field === "validate",
    )
  );
}

function eraseSchema<Value extends JsonObject>(
  schema: RuntimeSchema<Value>,
): RuntimeSchema<JsonObject> {
  const validate = schema.validate;
  return Object.freeze({
    id: schema.id,
    schemaDigest: schema.schemaDigest,
    validate(value: unknown): SchemaValidationResult<JsonObject> {
      const result = validate(value);
      return result.valid
        ? { valid: true, value: result.value }
        : { valid: false, diagnostics: result.diagnostics };
    },
  });
}

function snapshotSchema<Value extends JsonObject>(
  schema: RuntimeSchema<Value>,
): RuntimeSchema<Value> {
  const validate = schema.validate;
  return Object.freeze({
    id: schema.id,
    schemaDigest: schema.schemaDigest,
    validate(value: unknown): SchemaValidationResult<Value> {
      return validate(value);
    },
  });
}

function snapshotSchemaMap(
  schemas: Readonly<Record<string, RuntimeSchema<JsonObject>>>,
): Readonly<Record<string, RuntimeSchema<JsonObject>>> {
  const snapshots: Record<string, RuntimeSchema<JsonObject>> = Object.create(null);
  for (const [type, schema] of Object.entries(schemas)) {
    snapshots[type] = eraseSchema(schema);
  }
  return Object.freeze(snapshots);
}

function ownSchema(
  schemas: Readonly<Record<string, RuntimeSchema<JsonObject>>>,
  type: string,
): RuntimeSchema<JsonObject> | undefined {
  return Object.hasOwn(schemas, type) ? schemas[type] : undefined;
}

function invalidPayload<State extends JsonObject>(
  registrationId: string,
  commandId: string,
  schema: RuntimeSchema<JsonObject>,
): EvaluatedCommand<State, JsonObject> {
  return {
    kind: "invalid",
    diagnostics: [
      createDiagnostic("command-payload-invalid", {
        commandId,
        registrationId,
        schemaId: schema.id,
      }),
    ],
  };
}

function invalidOutput<State extends JsonObject>(input: {
  readonly commandId: string;
  readonly registrationId: string;
  readonly output: "state" | "outcome" | "domain-event" | "effect-intent";
  readonly reason: "schema-missing" | "schema-rejected" | "schema-output-type-mismatch";
  readonly schemaId?: string;
  readonly type?: string;
}): EvaluatedCommand<State, JsonObject> {
  return {
    kind: "invalid",
    diagnostics: [
      createDiagnostic("handler-result-invalid", {
        commandId: input.commandId,
        registrationId: input.registrationId,
        output: input.output,
        reason: input.reason,
        ...(input.schemaId === undefined ? {} : { schemaId: input.schemaId }),
        ...(input.type === undefined ? {} : { type: input.type }),
      }),
    ],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateResolvedDecisionOutputs<
  State extends JsonObject,
  Kind extends AggregateKind,
>(input: {
  readonly decision: HandlerDecision<State, JsonObject>;
  readonly commandId: string;
  readonly binding: ConstructedCommandBinding<State, Kind>;
  readonly stateSchema: RuntimeSchema<State>;
  readonly eventSchemas: Readonly<Record<string, RuntimeSchema<JsonObject>>>;
  readonly effectSchemas: Readonly<Record<string, RuntimeSchema<JsonObject>>>;
}): EvaluatedCommand<State, JsonObject> {
  const decision = input.decision;
  if (
    !isRecord(decision) ||
    (decision.kind !== "accepted" && decision.kind !== "no-op" && decision.kind !== "rejected") ||
    !Object.hasOwn(decision, "outcome")
  ) {
    return { kind: "decision", decision };
  }
  const decisionFields = Object.keys(decision);
  if (decision.kind === "no-op" || decision.kind === "rejected") {
    if (
      decisionFields.length !== 2 ||
      !decisionFields.includes("kind") ||
      !decisionFields.includes("outcome")
    ) {
      return { kind: "decision", decision };
    }
  } else {
    const requiredFields = [
      "kind",
      "outcome",
      "domainEvents",
      "effectIntents",
      "progressionIntents",
    ];
    if (
      requiredFields.some((field) => !decisionFields.includes(field)) ||
      decisionFields.some((field) => !requiredFields.includes(field) && field !== "nextState")
    ) {
      return { kind: "decision", decision };
    }
  }

  const outcome = input.binding.outcomeSchema.validate(decision.outcome);
  if (!outcome.valid) {
    return invalidOutput({
      commandId: input.commandId,
      registrationId: input.binding.registrationId,
      output: "outcome",
      reason: "schema-rejected",
      schemaId: input.binding.outcomeSchema.id,
    });
  }
  if (decision.kind === "no-op" || decision.kind === "rejected") {
    return { kind: "decision", decision: { kind: decision.kind, outcome: outcome.value } };
  }
  if (
    !Array.isArray(decision.domainEvents) ||
    !Array.isArray(decision.effectIntents) ||
    !Array.isArray(decision.progressionIntents)
  ) {
    return { kind: "decision", decision };
  }

  let nextState: State | undefined;
  if (decision.nextState !== undefined) {
    const state = input.stateSchema.validate(decision.nextState);
    if (!state.valid) {
      return invalidOutput({
        commandId: input.commandId,
        registrationId: input.binding.registrationId,
        output: "state",
        reason: "schema-rejected",
        schemaId: input.stateSchema.id,
      });
    }
    nextState = state.value;
  }

  const domainEvents: JsonObject[] = [];
  for (const event of decision.domainEvents) {
    if (!isRecord(event) || typeof event.type !== "string" || event.type.length === 0) {
      return { kind: "decision", decision };
    }
    const schema = ownSchema(input.eventSchemas, event.type);
    if (schema === undefined) {
      return invalidOutput({
        commandId: input.commandId,
        registrationId: input.binding.registrationId,
        output: "domain-event",
        reason: "schema-missing",
        type: event.type,
      });
    }
    const validated = schema.validate(event);
    if (!validated.valid) {
      return invalidOutput({
        commandId: input.commandId,
        registrationId: input.binding.registrationId,
        output: "domain-event",
        reason: "schema-rejected",
        schemaId: schema.id,
        type: event.type,
      });
    }
    if (validated.value.type !== event.type) {
      return invalidOutput({
        commandId: input.commandId,
        registrationId: input.binding.registrationId,
        output: "domain-event",
        reason: "schema-output-type-mismatch",
        schemaId: schema.id,
        type: event.type,
      });
    }
    domainEvents.push(validated.value);
  }

  const effectIntents: JsonObject[] = [];
  for (const effect of decision.effectIntents) {
    if (!isRecord(effect) || typeof effect.type !== "string" || effect.type.length === 0) {
      return { kind: "decision", decision };
    }
    const schema = ownSchema(input.effectSchemas, effect.type);
    if (schema === undefined) {
      return invalidOutput({
        commandId: input.commandId,
        registrationId: input.binding.registrationId,
        output: "effect-intent",
        reason: "schema-missing",
        type: effect.type,
      });
    }
    const validated = schema.validate(effect);
    if (!validated.valid) {
      return invalidOutput({
        commandId: input.commandId,
        registrationId: input.binding.registrationId,
        output: "effect-intent",
        reason: "schema-rejected",
        schemaId: schema.id,
        type: effect.type,
      });
    }
    if (validated.value.type !== effect.type) {
      return invalidOutput({
        commandId: input.commandId,
        registrationId: input.binding.registrationId,
        output: "effect-intent",
        reason: "schema-output-type-mismatch",
        schemaId: schema.id,
        type: effect.type,
      });
    }
    effectIntents.push(validated.value);
  }

  return {
    kind: "decision",
    decision: {
      kind: "accepted",
      ...(nextState === undefined ? {} : { nextState }),
      outcome: outcome.value,
      domainEvents,
      effectIntents,
      progressionIntents: decision.progressionIntents,
    },
  };
}

export function resolveCommandBinding<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
  Kind extends AggregateKind,
>(input: {
  readonly registrationId: string;
  readonly definition: CommandDefinition<State, Payload, Outcome, Kind>;
  readonly payloadSchema: RuntimeSchema<Payload>;
  readonly outcomeSchema: RuntimeSchema<Outcome>;
}): ResolvedCommandBinding<State, Kind> {
  if (typeof input.registrationId !== "string" || input.registrationId.length === 0) {
    throw new TypeError("Command binding registration identity must be non-empty");
  }
  if (!isValidSchema(input.payloadSchema) || !isValidSchema(input.outcomeSchema)) {
    throw new TypeError("Command binding schemas must have digest-bound runtime identities");
  }

  const payloadSchema = eraseSchema(input.payloadSchema);
  const outcomeSchema = eraseSchema(input.outcomeSchema);
  const evaluate = (
    aggregate: Aggregate<State, Kind>,
    command: Command<JsonObject, Kind>,
    context: TransitionContext,
  ): EvaluatedCommand<State, JsonObject> => {
    const payload = input.payloadSchema.validate(command.payload);
    if (!payload.valid) {
      return invalidPayload(input.registrationId, command.id, payloadSchema);
    }
    const narrowedCommand: Command<Payload, Kind> = Object.freeze({
      ...command,
      payload: payload.value,
    });
    const decision: HandlerDecision<State, Outcome> = input.definition.handle(
      aggregate,
      narrowedCommand,
      context,
    );
    return { kind: "decision", decision };
  };
  const binding: ConstructedCommandBinding<State, Kind> = Object.freeze({
    registrationId: input.registrationId,
    commandType: input.definition.commandType,
    payloadSchema,
    outcomeSchema,
    evaluate(evaluationInput: {
      readonly aggregate: Aggregate<State, Kind>;
      readonly command: Command<JsonObject, Kind>;
      readonly observations: readonly Observation[];
    }): CommandBindingEvaluation<State> {
      const cursor = createObservationCursor(evaluationInput.observations);
      const result = evaluate(evaluationInput.aggregate, evaluationInput.command, cursor.context);
      return result.kind === "invalid"
        ? { kind: "invalid-payload", diagnostics: result.diagnostics }
        : { kind: "decision", decision: result.decision };
    },
    [commandBindingEvaluator]: evaluate,
  });
  return binding;
}

function initializationInvalid<Kind extends AggregateKind>(
  code:
    | "initialization-input-invalid"
    | "initializer-threw"
    | "initialized-state-invalid"
    | "initial-progression-invalid",
  modelId: string,
  details: JsonObject = {},
): InitializationResult<Kind> {
  return Object.freeze({
    kind: "invalid",
    diagnostics: Object.freeze([createDiagnostic(code, { modelId, ...details })]),
  });
}

export function bindExecutableAggregateModel<Kind extends AggregateKind, State extends JsonObject>(
  model: ResolvedAggregateModel<Kind, State>,
): ExecutableAggregateModel<Kind> {
  if (
    typeof model.modelId !== "string" ||
    model.modelId.length === 0 ||
    !isAggregateKind(model.aggregateKind) ||
    !isAggregateAuthority(model.authority) ||
    (model.aggregateKind === "player" ? model.authority !== "local" : model.authority !== "server")
  ) {
    throw new TypeError("Aggregate model identity, kind, or authority is invalid");
  }
  if (!isValidSchema(model.stateSchema) || !isValidSchema(model.initializationSchema)) {
    throw new TypeError("Aggregate model schemas must have digest-bound runtime identities");
  }
  if (typeof model.initializeState !== "function") {
    throw new TypeError("Aggregate model initializer must be synchronous function data");
  }
  if (model.aggregateKind !== "player" && model.progression !== undefined) {
    throw new TypeError("Server aggregate models cannot own progression");
  }
  if (model.progression !== undefined && model.progression.aggregateKind !== model.aggregateKind) {
    throw new TypeError("Aggregate model progression kind must match the model kind");
  }
  const modelFields = new Set([
    "modelId",
    "aggregateKind",
    "authority",
    "stateSchema",
    "initializationSchema",
    "initializeState",
    "commandsByType",
    "eventSchemas",
    "effectSchemas",
    "progression",
  ]);
  if (Object.keys(model).some((field) => !modelFields.has(field))) {
    throw new TypeError("Aggregate model contains an unsupported field");
  }
  for (const schema of [
    ...Object.values(model.eventSchemas),
    ...Object.values(model.effectSchemas),
  ]) {
    if (!isValidSchema(schema)) {
      throw new TypeError("Aggregate model event and effect schemas must be digest-bound");
    }
  }

  const modelId = model.modelId;
  const aggregateKind = model.aggregateKind;
  const authority = model.authority;
  const stateSchema = snapshotSchema(model.stateSchema);
  const initializationSchema = snapshotSchema(model.initializationSchema);
  const initializeState = model.initializeState;
  const progression = model.progression;
  const eventSchemas = snapshotSchemaMap(model.eventSchemas);
  const effectSchemas = snapshotSchemaMap(model.effectSchemas);

  const commandContracts: Record<
    string,
    {
      readonly registrationId: string;
      readonly payloadSchema: RuntimeSchema<JsonObject>;
      readonly outcomeSchema: RuntimeSchema<JsonObject>;
    }
  > = Object.create(null);
  const bindingsByType: Record<string, ConstructedCommandBinding<State, Kind>> = Object.create(
    null,
  );
  for (const [commandType, binding] of Object.entries(model.commandsByType)) {
    if (commandType !== binding.commandType || !isConstructedCommandBinding(binding)) {
      throw new TypeError(
        "Aggregate model command bindings must be resolved and keyed by command type",
      );
    }
    commandContracts[commandType] = Object.freeze({
      registrationId: binding.registrationId,
      payloadSchema: binding.payloadSchema,
      outcomeSchema: binding.outcomeSchema,
    });
    bindingsByType[commandType] = binding;
  }
  const resolvedBindings = Object.freeze(bindingsByType);

  const executable: ExecutableAggregateModel<Kind> = {
    modelId,
    aggregateKind,
    authority,
    stateSchema: eraseSchema(stateSchema),
    initializationSchema: eraseSchema(initializationSchema),
    commandContracts: Object.freeze(commandContracts),
    eventSchemas,
    effectSchemas,
    ...(progression === undefined
      ? {}
      : { progression: Object.freeze({ graphId: progression.graphId }) }),
    initialize(input): InitializationResult<Kind> {
      const canonicalInput = canonicalizeValue(input);
      if (
        canonicalInput.kind === "invalid" ||
        canonicalInput.canonical.value === null ||
        Array.isArray(canonicalInput.canonical.value) ||
        typeof canonicalInput.canonical.value !== "object"
      ) {
        return initializationInvalid("initialization-input-invalid", modelId, {
          schemaId: initializationSchema.id,
        });
      }
      const validatedInput = initializationSchema.validate(canonicalInput.canonical.value);
      if (!validatedInput.valid) {
        return initializationInvalid("initialization-input-invalid", modelId, {
          schemaId: initializationSchema.id,
        });
      }

      let initializedState: State;
      try {
        initializedState = initializeState(validatedInput.value);
      } catch {
        return initializationInvalid("initializer-threw", modelId);
      }
      const canonicalState = canonicalizeValue(initializedState);
      if (
        canonicalState.kind === "invalid" ||
        canonicalState.canonical.value === null ||
        Array.isArray(canonicalState.canonical.value) ||
        typeof canonicalState.canonical.value !== "object"
      ) {
        return initializationInvalid("initialized-state-invalid", modelId, {
          schemaId: stateSchema.id,
        });
      }
      const validatedState = stateSchema.validate(canonicalState.canonical.value);
      if (!validatedState.valid) {
        return initializationInvalid("initialized-state-invalid", modelId, {
          schemaId: stateSchema.id,
        });
      }

      let initializedProgression;
      try {
        initializedProgression =
          progression === undefined ? undefined : initialProgression(progression);
      } catch {
        return initializationInvalid("initial-progression-invalid", modelId, {
          graphId: progression?.graphId ?? "",
        });
      }
      const aggregate: Aggregate<State, Kind> = Object.freeze({
        aggregateId: modelId,
        modelId,
        aggregateKind,
        schemaId: stateSchema.id,
        stateVersion: 0,
        state: validatedState.value,
        ...(initializedProgression === undefined ? {} : { progression: initializedProgression }),
      });
      const aggregateDiagnostic = validateAggregate(aggregate);
      if (aggregateDiagnostic !== null) {
        return initializationInvalid("initialized-state-invalid", modelId, {
          schemaId: stateSchema.id,
        });
      }
      return Object.freeze({ kind: "initialized", aggregate });
    },
    execute(input) {
      if (
        input.aggregate.modelId !== modelId ||
        input.aggregate.aggregateKind !== aggregateKind ||
        input.aggregate.schemaId !== stateSchema.id
      ) {
        return preflightInvalidResult(
          createDiagnostic("aggregate-model-mismatch", {
            actualAggregateKind: input.aggregate.aggregateKind,
            actualModelId: input.aggregate.modelId,
            actualSchemaId: input.aggregate.schemaId,
            expectedAggregateKind: aggregateKind,
            expectedModelId: modelId,
            expectedSchemaId: stateSchema.id,
          }),
        );
      }
      const state = stateSchema.validate(input.aggregate.state);
      if (!state.valid) {
        return preflightInvalidResult(
          createDiagnostic("aggregate-state-invalid", {
            aggregateId: input.aggregate.aggregateId,
            modelId,
            schemaId: stateSchema.id,
          }),
        );
      }
      const binding = resolvedBindings[input.command.type];
      if (binding === undefined || !isConstructedCommandBinding(binding)) {
        return preflightInvalidResult(
          createDiagnostic("command-binding-missing", {
            commandType: input.command.type,
            modelId,
          }),
        );
      }
      const aggregate: Aggregate<State, Kind> = Object.freeze({
        ...input.aggregate,
        state: state.value,
      });
      return executeCommandWithEvaluator({
        definitionId: binding.registrationId,
        commandType: binding.commandType,
        aggregateKind,
        aggregate,
        command: input.command,
        observations: input.observations,
        ...(progression === undefined ? {} : { progression }),
        evaluate(target, command, context) {
          const evaluated = binding[commandBindingEvaluator](target, command, context);
          return evaluated.kind === "invalid"
            ? evaluated
            : validateResolvedDecisionOutputs({
                decision: evaluated.decision,
                commandId: command.id,
                binding,
                stateSchema,
                eventSchemas,
                effectSchemas,
              });
        },
      });
    },
  };
  return Object.freeze(executable);
}
