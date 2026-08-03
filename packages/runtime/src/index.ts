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
export type { Aggregate, AggregateAuthority, AggregateKind } from "./aggregates.js";

export { defineCommand } from "./commands.js";
export type {
  AcceptedDecision,
  Command,
  CommandDefinition,
  CommandTarget,
  DomainEvent,
  EffectIntent,
  HandlerDecision,
  RejectedDecision,
} from "./commands.js";

export { DIAGNOSTIC_CODES } from "./diagnostics.js";
export type { Diagnostic, DiagnosticCode } from "./diagnostics.js";

export type { Observation, ObservationConsumption, TransitionContext } from "./observations.js";
export { DEFAULT_RUNTIME_POLICY, executeCommand } from "./execute-command.js";
export type { ExecuteCommandInput } from "./execute-command.js";
export type {
  AcceptedExecution,
  ExecutionRecord,
  ExecutionResult,
  InvalidExecution,
  NoOpExecution,
  PreflightInvalidExecution,
  RecordedExecutionResult,
  RejectedExecution,
  RuntimePolicy,
} from "./execution-record.js";

export { PROGRESSION_STATUSES } from "./progression/state.js";
export type {
  ProgressionInstance,
  ProgressionIntent,
  ProgressionNodeState,
  ProgressionStatus,
  ProgressionTransition,
} from "./progression/state.js";
export type {
  AutomaticRule,
  DefinedProgression,
  ProgressionDefinition,
  ProgressionNodeDefinition,
  ProgressionRuleInput,
} from "./progression/graph.js";
export { defineProgression } from "./progression/graph.js";
