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
  InvalidExecution,
  PreflightInvalidExecution,
  RuntimePolicy,
} from "./execution-record.js";
import {
  createObservationCursor,
  ObservationFault,
  type Observation,
  type ObservationConsumption,
} from "./observations.js";
import type { DefinedProgression } from "./progression/graph.js";
import { evaluateProgression } from "./progression/evaluate-progression.js";
import type { ProgressionTransition } from "./progression/state.js";

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
  readonly progression?: DefinedProgression<State, Payload, Outcome, Kind>;
}

export const DEFAULT_RUNTIME_POLICY: RuntimePolicy = Object.freeze({
  contractVersion: 1,
  maxCanonicalDepth: DEFAULT_CANONICAL_LIMITS.maxCanonicalDepth,
  maxCanonicalNodes: DEFAULT_CANONICAL_LIMITS.maxCanonicalNodes,
  maxAutomaticTransitions: 100,
});

function resolvePolicy(policy: Partial<RuntimePolicy> | undefined): RuntimePolicy | Diagnostic {
  const resolved = {
    contractVersion: policy?.contractVersion ?? DEFAULT_RUNTIME_POLICY.contractVersion,
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
      return createDiagnostic("runtime-policy-invalid", { field, value: resolved[field] });
    }
  }
  if (resolved.contractVersion !== 1) {
    return createDiagnostic("runtime-policy-invalid", {
      field: "contractVersion",
      value: resolved.contractVersion,
    });
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

function preflightInvalid(diagnostic: Diagnostic): PreflightInvalidExecution {
  return Object.freeze({
    kind: "invalid",
    phase: "preflight",
    diagnostics: Object.freeze([diagnostic]),
  });
}

function invalidResult<
  State extends JsonObject,
  Payload extends JsonObject,
  Kind extends AggregateKind,
>(
  context: RecordContext<State, Payload, Kind>,
  diagnostics: readonly Diagnostic[],
  attemptedProgressionTrace: readonly ProgressionTransition[] = [],
): InvalidExecution<State, Payload, Kind> {
  const record = buildRecord<State, Payload, JsonObject, Kind>({
    formatVersion: 1,
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
    kind: "invalid",
    phase: "execution",
    aggregate: context.aggregate,
    diagnostics: Object.freeze([...diagnostics]),
    attemptedProgressionTrace: Object.freeze([...attemptedProgressionTrace]),
    record,
  });
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
  if (decision.kind === "rejected") {
    return (
      decision.outcome !== null &&
      typeof decision.outcome === "object" &&
      !Array.isArray(decision.outcome) &&
      Object.keys(decision).every((key) => key === "kind" || key === "outcome")
    );
  }
  if (decision.kind !== "accepted") return false;
  return (
    decision.nextState !== null &&
    typeof decision.nextState === "object" &&
    !Array.isArray(decision.nextState) &&
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

export function executeCommand<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
  Kind extends AggregateKind,
>(
  input: ExecuteCommandInput<State, Payload, Outcome, Kind>,
): ExecutionResult<State, Outcome, Payload, Kind> {
  const resolvedPolicy = resolvePolicy(input.policy);
  if (isDiagnostic(resolvedPolicy)) {
    return preflightInvalid(resolvedPolicy);
  }

  const canonicalAggregate = canonicalClone(input.aggregate, resolvedPolicy);
  if (isDiagnostic(canonicalAggregate)) {
    return preflightInvalid(canonicalAggregate);
  }
  const aggregateDiagnostic = validateAggregate(canonicalAggregate);
  if (aggregateDiagnostic !== null) return preflightInvalid(aggregateDiagnostic);
  const aggregateClone = canonicalAggregate as unknown as Aggregate<State, Kind>;

  const canonicalCommand = canonicalClone(input.command, resolvedPolicy);
  if (isDiagnostic(canonicalCommand)) return preflightInvalid(canonicalCommand);
  const commandDiagnostic = validateCommandShape(canonicalCommand);
  if (commandDiagnostic !== null) return preflightInvalid(commandDiagnostic);
  const commandClone = canonicalCommand as unknown as Command<Payload, Kind>;

  const canonicalObservations = canonicalClone(input.observations, resolvedPolicy);
  if (isDiagnostic(canonicalObservations)) return preflightInvalid(canonicalObservations);
  if (!Array.isArray(canonicalObservations)) {
    return preflightInvalid(
      createDiagnostic("canonical-value-invalid", {
        path: "/observations",
        reason: "not-array",
      }),
    );
  }
  const observationsClone = canonicalObservations as readonly unknown[];
  const invalidObservationIndex = observationsClone.findIndex((observation) => {
    if (observation === null || typeof observation !== "object" || Array.isArray(observation))
      return true;
    const candidate = observation as unknown as Record<string, unknown>;
    return (
      typeof candidate.kind !== "string" ||
      candidate.kind.length === 0 ||
      typeof candidate.key !== "string" ||
      candidate.key.length === 0 ||
      !("value" in candidate)
    );
  });
  if (invalidObservationIndex !== -1) {
    return preflightInvalid(
      createDiagnostic("canonical-value-invalid", {
        path: `/observations/${invalidObservationIndex}`,
        reason: "invalid-observation-identity",
      }),
    );
  }
  const canonicalObservationScript = observationsClone as readonly Observation[];
  const contextBase = {
    definitionId: input.definition.definitionId,
    policy: resolvedPolicy,
    aggregate: aggregateClone,
    command: commandClone,
    observations: canonicalObservationScript,
    observationTrace: [],
  };

  if (
    commandClone.type !== input.definition.commandType ||
    commandClone.target.kind !== input.definition.aggregateKind ||
    commandClone.target.kind !== aggregateClone.kind ||
    commandClone.target.id !== aggregateClone.id
  ) {
    return invalidResult(contextBase, [
      createDiagnostic("command-target-mismatch", {
        aggregateId: aggregateClone.id,
        aggregateKind: aggregateClone.kind,
        commandId: commandClone.id,
        targetId: commandClone.target.id,
        targetKind: commandClone.target.kind,
      }),
    ]);
  }
  if (commandClone.expectedStateVersion !== aggregateClone.stateVersion) {
    return invalidResult(contextBase, [
      createDiagnostic("stale-aggregate-version", {
        actual: aggregateClone.stateVersion,
        commandId: commandClone.id,
        expected: commandClone.expectedStateVersion,
      }),
    ]);
  }

  const cursor = createObservationCursor(canonicalObservationScript);
  let rawDecision: unknown;
  try {
    rawDecision = input.definition.handle(aggregateClone, commandClone, cursor.context);
  } catch (error) {
    const diagnostic =
      error instanceof ObservationFault
        ? error.diagnostic
        : createDiagnostic("handler-threw", {
            commandId: commandClone.id,
            definitionId: input.definition.definitionId,
          });
    return invalidResult({ ...contextBase, observationTrace: cursor.trace }, [diagnostic]);
  }

  const canonicalDecision = canonicalClone(rawDecision, resolvedPolicy);
  if (isDiagnostic(canonicalDecision) || !validateDecision<State, Outcome>(canonicalDecision)) {
    return invalidResult({ ...contextBase, observationTrace: cursor.trace }, [
      createDiagnostic("handler-result-invalid", {
        commandId: commandClone.id,
        reason: isDiagnostic(canonicalDecision) ? canonicalDecision.code : "invalid-shape",
      }),
    ]);
  }
  const decisionClone = canonicalDecision;

  const recordContext = { ...contextBase, observationTrace: cursor.trace };
  if (decisionClone.kind === "rejected") {
    const record = buildRecord<State, Payload, Outcome, Kind>({
      formatVersion: 1,
      definitionId: input.definition.definitionId,
      policy: resolvedPolicy,
      aggregateBefore: aggregateClone,
      command: commandClone,
      observations: canonicalObservationScript,
      observationTrace: cursor.trace,
      terminal: "rejected",
      aggregateAfter: aggregateClone,
      outcome: decisionClone.outcome,
      progressionTrace: [],
      diagnostics: [],
    });
    return Object.freeze({
      kind: "rejected",
      aggregate: aggregateClone,
      outcome: decisionClone.outcome,
      record,
    });
  }

  if ((input.progression === undefined) !== (aggregateClone.progression === undefined)) {
    return invalidResult(recordContext, [
      createDiagnostic("progression-graph-invalid", {
        commandId: commandClone.id,
        reason: "definition-instance-pair-required",
      }),
    ]);
  }
  let progressionAfter = aggregateClone.progression;
  let progressionTrace: readonly ProgressionTransition[] = [];
  if (input.progression !== undefined && aggregateClone.progression !== undefined) {
    const evaluation = evaluateProgression({
      definition: input.progression,
      progression: aggregateClone.progression,
      intents: decisionClone.progressionIntents,
      aggregateState: decisionClone.nextState,
      command: commandClone,
      outcome: decisionClone.outcome,
      domainEvents: decisionClone.domainEvents,
      observationTrace: cursor.trace,
      maxAutomaticTransitions: resolvedPolicy.maxAutomaticTransitions,
    });
    if (evaluation.kind === "invalid") {
      return invalidResult(recordContext, [evaluation.diagnostic], evaluation.attemptedTrace);
    }
    progressionAfter = evaluation.progression;
    progressionTrace = evaluation.trace;
  } else if (decisionClone.progressionIntents.length > 0) {
    return invalidResult(recordContext, [
      createDiagnostic("progression-intent-invalid", {
        commandId: commandClone.id,
        reason: "missing-progression",
      }),
    ]);
  }

  const stateChanged = !canonicalEquals(aggregateClone.state, decisionClone.nextState);
  const progressionChanged =
    aggregateClone.progression !== undefined && progressionAfter !== undefined
      ? !canonicalEquals(
          aggregateClone.progression as unknown as JsonObject,
          progressionAfter as unknown as JsonObject,
        )
      : false;
  if (!stateChanged && !progressionChanged) {
    if (
      decisionClone.domainEvents.length > 0 ||
      decisionClone.effectIntents.length > 0 ||
      progressionTrace.length > 0
    ) {
      return invalidResult(recordContext, [
        createDiagnostic("no-op-output-invalid", {
          commandId: commandClone.id,
          domainEventCount: decisionClone.domainEvents.length,
          effectIntentCount: decisionClone.effectIntents.length,
          progressionTransitionCount: progressionTrace.length,
        }),
      ]);
    }
    const record = buildRecord<State, Payload, Outcome, Kind>({
      formatVersion: 1,
      definitionId: input.definition.definitionId,
      policy: resolvedPolicy,
      aggregateBefore: aggregateClone,
      command: commandClone,
      observations: canonicalObservationScript,
      observationTrace: cursor.trace,
      terminal: "no-op",
      aggregateAfter: aggregateClone,
      outcome: decisionClone.outcome,
      progressionTrace,
      diagnostics: [],
    });
    return Object.freeze({
      kind: "no-op",
      aggregate: aggregateClone,
      outcome: decisionClone.outcome,
      record,
    });
  }

  if (aggregateClone.stateVersion === Number.MAX_SAFE_INTEGER) {
    return invalidResult(recordContext, [
      createDiagnostic("state-version-overflow", {
        aggregateId: aggregateClone.id,
        stateVersion: aggregateClone.stateVersion,
      }),
    ]);
  }
  const canonicalAggregateAfter = canonicalClone(
    {
      ...aggregateClone,
      stateVersion: aggregateClone.stateVersion + 1,
      state: decisionClone.nextState,
      ...(progressionAfter === undefined ? {} : { progression: progressionAfter }),
    },
    resolvedPolicy,
  );
  if (isDiagnostic(canonicalAggregateAfter)) {
    return invalidResult(recordContext, [canonicalAggregateAfter]);
  }
  const aggregateAfterDiagnostic = validateAggregate(canonicalAggregateAfter);
  if (aggregateAfterDiagnostic !== null) {
    return invalidResult(recordContext, [aggregateAfterDiagnostic]);
  }
  const aggregateAfter = canonicalAggregateAfter as unknown as Aggregate<State, Kind>;

  const domainEvents = decisionClone.domainEvents as readonly DomainEvent[];
  const effectIntents = decisionClone.effectIntents as readonly EffectIntent[];
  const record = buildRecord<State, Payload, Outcome, Kind>({
    formatVersion: 1,
    definitionId: input.definition.definitionId,
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
  return Object.freeze({
    kind: "accepted",
    aggregate: aggregateAfter,
    outcome: decisionClone.outcome,
    domainEvents,
    effectIntents,
    progressionTrace,
    record,
  });
}
