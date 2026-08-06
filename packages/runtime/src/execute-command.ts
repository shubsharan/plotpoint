import {
  isAggregateKind,
  validateAggregate,
  type Aggregate,
  type AggregateKind,
} from "./aggregates.js";
import {
  canonicalEquals,
  canonicalizeValue,
  DEFAULT_CANONICAL_LIMITS,
  type JsonObject,
  type JsonValue,
} from "./canonical-json.js";
import type {
  Command,
  CommandDefinition,
  DomainEvent,
  EffectIntent,
  HandlerDecision,
} from "./commands.js";
import { createDiagnostic, type Diagnostic } from "./diagnostics.js";
import type {
  ExecutionRecord,
  ExecutionResult,
  PreflightInvalidExecution,
  RecordedExecution,
  RuntimePolicy,
} from "./execution-record.js";
import {
  createObservationCursor,
  ObservationFault,
  type Observation,
  type ObservationConsumption,
  type TransitionContext,
} from "./observations.js";
import { evaluateProgression } from "./progression/evaluate-progression.js";
import type { ProgressionDefinition } from "./progression/graph.js";
import type { ProgressionTraceEntry } from "./progression/state.js";

export interface ExecuteCommandInput<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
  Kind extends AggregateKind = AggregateKind,
> {
  readonly definition: CommandDefinition<State, Payload, Outcome, Kind>;
  readonly aggregate: Aggregate<State, Kind>;
  readonly command: Command<Payload, Kind>;
  readonly observations: readonly Observation[];
  readonly policy?: Partial<RuntimePolicy>;
  readonly progression?: ProgressionDefinition<State, Kind>;
}

export type EvaluatedCommand<State extends JsonObject, Outcome extends JsonObject> =
  | { readonly kind: "decision"; readonly decision: HandlerDecision<State, Outcome> }
  | { readonly kind: "invalid"; readonly diagnostics: readonly Diagnostic[] };

export interface ExecuteCommandWithEvaluatorInput<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
  Kind extends AggregateKind = AggregateKind,
> {
  readonly definitionId: string;
  readonly commandType: string;
  readonly aggregateKind: Kind;
  readonly aggregate: Aggregate<State, Kind>;
  readonly command: Command<Payload, Kind>;
  readonly observations: readonly Observation[];
  readonly policy?: Partial<RuntimePolicy>;
  readonly progression?: ProgressionDefinition<State, Kind>;
  evaluate(
    aggregate: Aggregate<State, Kind>,
    command: Command<Payload, Kind>,
    context: TransitionContext,
  ): EvaluatedCommand<State, Outcome>;
}

export const DEFAULT_RUNTIME_POLICY: RuntimePolicy = Object.freeze({
  maxCanonicalDepth: DEFAULT_CANONICAL_LIMITS.maxCanonicalDepth,
  maxCanonicalNodes: DEFAULT_CANONICAL_LIMITS.maxCanonicalNodes,
  maxAutomaticTransitions: 100,
});

function resolvePolicy(policy: Partial<RuntimePolicy> | undefined): RuntimePolicy | Diagnostic {
  const resolved = {
    maxCanonicalDepth: policy?.maxCanonicalDepth ?? DEFAULT_RUNTIME_POLICY.maxCanonicalDepth,
    maxCanonicalNodes: policy?.maxCanonicalNodes ?? DEFAULT_RUNTIME_POLICY.maxCanonicalNodes,
    maxAutomaticTransitions:
      policy?.maxAutomaticTransitions ?? DEFAULT_RUNTIME_POLICY.maxAutomaticTransitions,
  };
  for (const field of [
    "maxCanonicalDepth",
    "maxCanonicalNodes",
    "maxAutomaticTransitions",
  ] as const) {
    if (!Number.isSafeInteger(resolved[field]) || resolved[field] < 0) {
      return createDiagnostic("runtime-policy-invalid", {
        field,
        reason: "non-negative-safe-integer-required",
      });
    }
  }
  return Object.freeze(resolved as RuntimePolicy);
}

function canonicalClone(value: unknown, policy: RuntimePolicy): JsonValue | Diagnostic {
  const result = canonicalizeValue(value, policy);
  return result.kind === "valid" ? result.canonical.value : result.diagnostic;
}

function isDiagnostic(value: unknown): value is Diagnostic {
  return value !== null && typeof value === "object" && "code" in value && "details" in value;
}

function buildRecord<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
  Kind extends AggregateKind,
>(
  record: ExecutionRecord<State, Outcome, Payload, Kind>,
): ExecutionRecord<State, Outcome, Payload, Kind> {
  return Object.freeze({
    ...record,
    observations: Object.freeze([...record.observations]),
    observationTrace: Object.freeze([...record.observationTrace]),
    ...(record.domainEvents === undefined
      ? {}
      : { domainEvents: Object.freeze([...record.domainEvents]) }),
    ...(record.effectIntents === undefined
      ? {}
      : { effectIntents: Object.freeze([...record.effectIntents]) }),
    progressionTrace: Object.freeze([...record.progressionTrace]),
    diagnostics: Object.freeze([...record.diagnostics]),
  });
}

interface RecordContext<
  State extends JsonObject,
  Payload extends JsonObject,
  Kind extends AggregateKind,
> {
  readonly definitionId: string;
  readonly policy: RuntimePolicy;
  readonly aggregate: Aggregate<State, Kind>;
  readonly command: Command<Payload, Kind>;
  readonly observations: readonly Observation[];
  readonly observationTrace: readonly ObservationConsumption[];
}

export function preflightInvalidResult(
  diagnostics: Diagnostic | readonly Diagnostic[],
): PreflightInvalidExecution {
  return Object.freeze({
    kind: "preflight-invalid",
    diagnostics: Object.freeze(Array.isArray(diagnostics) ? [...diagnostics] : [diagnostics]),
  });
}

function invalidResult<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
  Kind extends AggregateKind,
>(
  context: RecordContext<State, Payload, Kind>,
  diagnostics: readonly Diagnostic[],
  attemptedProgressionTrace: readonly ProgressionTraceEntry[] = [],
): RecordedExecution<State, Outcome, Payload, Kind> {
  const record = buildRecord<State, Payload, Outcome, Kind>({
    definitionId: context.definitionId,
    policy: context.policy,
    aggregateBefore: context.aggregate,
    command: context.command,
    observations: context.observations,
    observationTrace: context.observationTrace,
    terminal: "invalid",
    progressionTrace: attemptedProgressionTrace,
    diagnostics,
  });
  return Object.freeze({
    kind: "recorded",
    aggregate: context.aggregate,
    record,
  });
}

function recordedResult<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
  Kind extends AggregateKind,
>(
  aggregate: Aggregate<State, Kind>,
  record: ExecutionRecord<State, Outcome, Payload, Kind>,
): RecordedExecution<State, Outcome, Payload, Kind> {
  return Object.freeze({ kind: "recorded", aggregate, record });
}

function validateCommandShape(value: unknown): Diagnostic | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return createDiagnostic("command-invalid", { field: "command", reason: "not-object" });
  }
  const command = value as Record<string, unknown>;
  if (typeof command.id !== "string" || command.id.length === 0) {
    return createDiagnostic("command-invalid", { field: "id", reason: "empty" });
  }
  if (typeof command.type !== "string" || command.type.length === 0) {
    return createDiagnostic("command-invalid", { field: "type", reason: "empty" });
  }
  if (
    command.target === null ||
    typeof command.target !== "object" ||
    Array.isArray(command.target)
  ) {
    return createDiagnostic("command-invalid", { field: "target", reason: "not-object" });
  }
  const target = command.target as Record<string, unknown>;
  if (!isAggregateKind(target.kind)) {
    return createDiagnostic("command-invalid", { field: "target.kind", reason: "invalid-kind" });
  }
  if (typeof target.id !== "string" || target.id.length === 0) {
    return createDiagnostic("command-invalid", { field: "target.id", reason: "empty" });
  }
  if (
    !Number.isSafeInteger(command.expectedStateVersion) ||
    (command.expectedStateVersion as number) < 0
  ) {
    return createDiagnostic("command-invalid", {
      field: "expectedStateVersion",
      reason: "invalid-version",
    });
  }
  if (
    command.payload === null ||
    typeof command.payload !== "object" ||
    Array.isArray(command.payload)
  ) {
    return createDiagnostic("command-invalid", { field: "payload", reason: "not-object" });
  }
  const allowed = new Set(["id", "type", "target", "expectedStateVersion", "payload"]);
  const unexpected = Object.keys(command).find((field) => !allowed.has(field));
  if (unexpected !== undefined) {
    return createDiagnostic("command-invalid", { field: unexpected, reason: "unexpected-field" });
  }
  return null;
}

function isCanonicalObject(value: unknown): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateDecision<State extends JsonObject, Outcome extends JsonObject>(
  value: unknown,
): value is HandlerDecision<State, Outcome> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const decision = value as Record<string, unknown>;
  if (decision.kind === "rejected" || decision.kind === "no-op") {
    return (
      decision.outcome !== null &&
      typeof decision.outcome === "object" &&
      !Array.isArray(decision.outcome) &&
      Object.keys(decision).every((key) => key === "kind" || key === "outcome")
    );
  }
  if (decision.kind !== "accepted") return false;
  const nextStateValid =
    decision.nextState === undefined ||
    (decision.nextState !== null &&
      typeof decision.nextState === "object" &&
      !Array.isArray(decision.nextState));
  return (
    nextStateValid &&
    decision.outcome !== null &&
    typeof decision.outcome === "object" &&
    !Array.isArray(decision.outcome) &&
    Array.isArray(decision.domainEvents) &&
    decision.domainEvents.every(isCanonicalObject) &&
    Array.isArray(decision.effectIntents) &&
    decision.effectIntents.every(isCanonicalObject) &&
    Array.isArray(decision.progressionIntents) &&
    decision.progressionIntents.every(isCanonicalObject) &&
    Object.keys(decision).every((key) =>
      [
        "kind",
        "nextState",
        "outcome",
        "domainEvents",
        "effectIntents",
        "progressionIntents",
      ].includes(key),
    )
  );
}

export function executeCommandWithEvaluator<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
  Kind extends AggregateKind,
>(
  input: ExecuteCommandWithEvaluatorInput<State, Payload, Outcome, Kind>,
): ExecutionResult<State, Outcome, Payload, Kind> {
  const resolvedPolicy = resolvePolicy(input.policy);
  if (isDiagnostic(resolvedPolicy)) return preflightInvalidResult(resolvedPolicy);

  const canonicalAggregate = canonicalClone(input.aggregate, resolvedPolicy);
  if (isDiagnostic(canonicalAggregate)) return preflightInvalidResult(canonicalAggregate);
  const aggregateDiagnostic = validateAggregate(canonicalAggregate);
  if (aggregateDiagnostic !== null) return preflightInvalidResult(aggregateDiagnostic);
  const aggregateClone = canonicalAggregate as unknown as Aggregate<State, Kind>;

  const canonicalCommand = canonicalClone(input.command, resolvedPolicy);
  if (isDiagnostic(canonicalCommand)) return preflightInvalidResult(canonicalCommand);
  const commandDiagnostic = validateCommandShape(canonicalCommand);
  if (commandDiagnostic !== null) return preflightInvalidResult(commandDiagnostic);
  const commandClone = canonicalCommand as unknown as Command<Payload, Kind>;

  const canonicalObservations = canonicalClone(input.observations, resolvedPolicy);
  if (isDiagnostic(canonicalObservations)) return preflightInvalidResult(canonicalObservations);
  if (!Array.isArray(canonicalObservations)) {
    return preflightInvalidResult(
      createDiagnostic("canonical-value-invalid", {
        path: "/observations",
        reason: "not-array",
      }),
    );
  }
  const observationsClone = canonicalObservations as readonly unknown[];
  const invalidObservationIndex = observationsClone.findIndex((observation) => {
    if (observation === null || typeof observation !== "object" || Array.isArray(observation)) {
      return true;
    }
    const candidate = observation as Record<string, unknown>;
    return (
      typeof candidate.kind !== "string" ||
      candidate.kind.length === 0 ||
      typeof candidate.key !== "string" ||
      candidate.key.length === 0 ||
      !("value" in candidate)
    );
  });
  if (invalidObservationIndex !== -1) {
    return preflightInvalidResult(
      createDiagnostic("canonical-value-invalid", {
        path: `/observations/${invalidObservationIndex}`,
        reason: "invalid-observation-identity",
      }),
    );
  }
  const canonicalObservationScript = observationsClone as readonly Observation[];
  const contextBase = {
    definitionId: input.definitionId,
    policy: resolvedPolicy,
    aggregate: aggregateClone,
    command: commandClone,
    observations: canonicalObservationScript,
    observationTrace: [],
  };

  if (
    commandClone.type !== input.commandType ||
    commandClone.target.kind !== input.aggregateKind ||
    commandClone.target.kind !== aggregateClone.aggregateKind ||
    commandClone.target.id !== aggregateClone.aggregateId
  ) {
    return invalidResult<State, Payload, Outcome, Kind>(contextBase, [
      createDiagnostic("command-target-mismatch", {
        aggregateId: aggregateClone.aggregateId,
        aggregateKind: aggregateClone.aggregateKind,
        commandId: commandClone.id,
        targetId: commandClone.target.id,
        targetKind: commandClone.target.kind,
      }),
    ]);
  }
  if (commandClone.expectedStateVersion !== aggregateClone.stateVersion) {
    return invalidResult<State, Payload, Outcome, Kind>(contextBase, [
      createDiagnostic("stale-aggregate-version", {
        actual: aggregateClone.stateVersion,
        commandId: commandClone.id,
        expected: commandClone.expectedStateVersion,
      }),
    ]);
  }

  const cursor = createObservationCursor(canonicalObservationScript);
  let evaluated: EvaluatedCommand<State, Outcome>;
  try {
    evaluated = input.evaluate(aggregateClone, commandClone, cursor.context);
  } catch (error) {
    const diagnostic =
      error instanceof ObservationFault
        ? error.diagnostic
        : createDiagnostic("handler-threw", {
            commandId: commandClone.id,
            definitionId: input.definitionId,
          });
    return invalidResult<State, Payload, Outcome, Kind>(
      { ...contextBase, observationTrace: cursor.trace },
      [diagnostic],
    );
  }
  if (evaluated.kind === "invalid") {
    return invalidResult<State, Payload, Outcome, Kind>(
      { ...contextBase, observationTrace: cursor.trace },
      evaluated.diagnostics,
    );
  }

  const canonicalDecision = canonicalClone(evaluated.decision, resolvedPolicy);
  if (isDiagnostic(canonicalDecision) || !validateDecision<State, Outcome>(canonicalDecision)) {
    return invalidResult<State, Payload, Outcome, Kind>(
      { ...contextBase, observationTrace: cursor.trace },
      [
        createDiagnostic("handler-result-invalid", {
          commandId: commandClone.id,
          reason: isDiagnostic(canonicalDecision) ? canonicalDecision.code : "invalid-shape",
        }),
      ],
    );
  }
  const decisionClone = canonicalDecision;
  const recordContext = { ...contextBase, observationTrace: cursor.trace };

  if (decisionClone.kind === "rejected" || decisionClone.kind === "no-op") {
    const record = buildRecord<State, Payload, Outcome, Kind>({
      definitionId: input.definitionId,
      policy: resolvedPolicy,
      aggregateBefore: aggregateClone,
      command: commandClone,
      observations: canonicalObservationScript,
      observationTrace: cursor.trace,
      terminal: decisionClone.kind,
      aggregateAfter: aggregateClone,
      outcome: decisionClone.outcome,
      progressionTrace: [],
      diagnostics: [],
    });
    return recordedResult(aggregateClone, record);
  }

  if ((input.progression === undefined) !== (aggregateClone.progression === undefined)) {
    return invalidResult<State, Payload, Outcome, Kind>(recordContext, [
      createDiagnostic("progression-graph-invalid", {
        commandId: commandClone.id,
        reason: "definition-instance-pair-required",
      }),
    ]);
  }
  const nextState = decisionClone.nextState ?? aggregateClone.state;
  let progressionAfter = aggregateClone.progression;
  let progressionTrace: readonly ProgressionTraceEntry[] = [];
  if (input.progression !== undefined && aggregateClone.progression !== undefined) {
    if (input.progression.aggregateKind !== aggregateClone.aggregateKind) {
      return invalidResult<State, Payload, Outcome, Kind>(recordContext, [
        createDiagnostic("progression-graph-invalid", {
          actualAggregateKind: input.progression.aggregateKind,
          commandId: commandClone.id,
          expectedAggregateKind: aggregateClone.aggregateKind,
          graphId: input.progression.graphId,
          reason: "aggregate-kind-mismatch",
        }),
      ]);
    }
    const evaluation = evaluateProgression({
      definition: input.progression,
      progression: aggregateClone.progression,
      intents: decisionClone.progressionIntents,
      aggregateState: nextState,
      commandId: commandClone.id,
      domainEvents: decisionClone.domainEvents,
      maxAutomaticTransitions: resolvedPolicy.maxAutomaticTransitions,
    });
    if (evaluation.kind === "invalid") {
      return invalidResult<State, Payload, Outcome, Kind>(
        recordContext,
        [evaluation.diagnostic],
        evaluation.attemptedTrace,
      );
    }
    progressionAfter = evaluation.progression;
    progressionTrace = evaluation.trace;
  } else if (decisionClone.progressionIntents.length > 0) {
    return invalidResult<State, Payload, Outcome, Kind>(recordContext, [
      createDiagnostic("progression-intent-invalid", {
        commandId: commandClone.id,
        reason: "missing-progression",
      }),
    ]);
  }

  const stateChanged = !canonicalEquals(aggregateClone.state, nextState);
  const progressionChanged =
    aggregateClone.progression !== undefined && progressionAfter !== undefined
      ? !canonicalEquals(
          aggregateClone.progression as unknown as JsonObject,
          progressionAfter as unknown as JsonObject,
        )
      : false;
  const durableFactCount =
    decisionClone.domainEvents.length +
    decisionClone.effectIntents.length +
    (stateChanged || progressionChanged ? 1 : 0);
  if (durableFactCount === 0) {
    return invalidResult<State, Payload, Outcome, Kind>(recordContext, [
      createDiagnostic("no-op-output-invalid", {
        commandId: commandClone.id,
        reason: "accepted-without-durable-fact",
      }),
    ]);
  }

  if (aggregateClone.stateVersion === Number.MAX_SAFE_INTEGER) {
    return invalidResult<State, Payload, Outcome, Kind>(recordContext, [
      createDiagnostic("state-version-overflow", {
        aggregateId: aggregateClone.aggregateId,
        stateVersion: aggregateClone.stateVersion,
      }),
    ]);
  }
  const canonicalAggregateAfter = canonicalClone(
    {
      ...aggregateClone,
      stateVersion: aggregateClone.stateVersion + 1,
      state: nextState,
      ...(progressionAfter === undefined ? {} : { progression: progressionAfter }),
    },
    resolvedPolicy,
  );
  if (isDiagnostic(canonicalAggregateAfter)) {
    return invalidResult<State, Payload, Outcome, Kind>(recordContext, [canonicalAggregateAfter]);
  }
  const aggregateAfterDiagnostic = validateAggregate(canonicalAggregateAfter);
  if (aggregateAfterDiagnostic !== null) {
    return invalidResult<State, Payload, Outcome, Kind>(recordContext, [aggregateAfterDiagnostic]);
  }
  const aggregateAfter = canonicalAggregateAfter as unknown as Aggregate<State, Kind>;

  const domainEvents = decisionClone.domainEvents as readonly DomainEvent[];
  const effectIntents = decisionClone.effectIntents as readonly EffectIntent[];
  const record = buildRecord<State, Payload, Outcome, Kind>({
    definitionId: input.definitionId,
    policy: resolvedPolicy,
    aggregateBefore: aggregateClone,
    command: commandClone,
    observations: canonicalObservationScript,
    observationTrace: cursor.trace,
    terminal: "accepted",
    aggregateAfter,
    outcome: decisionClone.outcome,
    domainEvents,
    effectIntents,
    progressionTrace,
    diagnostics: [],
  });
  return recordedResult(aggregateAfter, record);
}

export function executeCommand<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
  Kind extends AggregateKind,
>(
  input: ExecuteCommandInput<State, Payload, Outcome, Kind>,
): ExecutionResult<State, Outcome, Payload, Kind> {
  return executeCommandWithEvaluator({
    definitionId: input.definition.definitionId,
    commandType: input.definition.commandType,
    aggregateKind: input.definition.aggregateKind,
    aggregate: input.aggregate,
    command: input.command,
    observations: input.observations,
    ...(input.policy === undefined ? {} : { policy: input.policy }),
    ...(input.progression === undefined ? {} : { progression: input.progression }),
    evaluate(aggregate, command, context) {
      return { kind: "decision", decision: input.definition.handle(aggregate, command, context) };
    },
  });
}
