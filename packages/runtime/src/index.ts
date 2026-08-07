export { canonicalizeValue, DEFAULT_CANONICAL_LIMITS } from "./canonical-json.js";
export type {
  CanonicalLimits,
  CanonicalizeResult,
  CanonicalValue,
  JsonObject,
  JsonPrimitive,
  JsonValue,
} from "./canonical-json.js";

export { AGGREGATE_AUTHORITIES, AGGREGATE_KINDS } from "./aggregates.js";
export type {
  Aggregate,
  AggregateAuthority,
  AggregateAuthorityForKind,
  AggregateKind,
} from "./aggregates.js";

export type {
  CommandBindingEvaluation,
  ExecutableAggregateModel,
  InitializationResult,
  ResolvedAggregateModel,
  ResolvedCommandBinding,
  RuntimeSchema,
  SchemaValidationResult,
} from "./aggregate-model.js";
export { bindExecutableAggregateModel, resolveCommandBinding } from "./model-wrappers.js";

export { defineCommand } from "./commands.js";
export type {
  AcceptedDecision,
  Command,
  CommandDefinition,
  CommandTarget,
  DomainEvent,
  EffectIntent,
  HandlerDecision,
  NoOpDecision,
  RejectedDecision,
  RuntimeCommand,
} from "./commands.js";

export { DIAGNOSTIC_CODES } from "./diagnostics.js";
export type { Diagnostic, DiagnosticCode } from "./diagnostics.js";

export type { Observation, ObservationConsumption, TransitionContext } from "./observations.js";
export { DEFAULT_RUNTIME_POLICY, executeCommand } from "./execute-command.js";
export type { ExecuteCommandInput } from "./execute-command.js";
export type {
  ExecutionRecord,
  ExecutionResult,
  PreflightInvalidExecution,
  RecordedExecution,
  RuntimePolicy,
} from "./execution-record.js";

export { PROGRESSION_STATUSES } from "./progression/state.js";
export type {
  ProgressionInstance,
  ProgressionIntent,
  ProgressionNodeState,
  ProgressionStatus,
  ProgressionTraceEntry,
} from "./progression/state.js";
export type {
  ProgressionDefinition,
  ProgressionFacts,
  ProgressionNodeDefinition,
  ProgressionTransition,
} from "./progression/graph.js";
export { defineProgression, initialProgression } from "./progression/graph.js";
