import type { Aggregate, AggregateKind } from "./aggregates.js";
import type { JsonObject } from "./canonical-json.js";
import type { Command, DomainEvent, EffectIntent } from "./commands.js";
import type { Diagnostic } from "./diagnostics.js";
import type { Observation, ObservationConsumption } from "./observations.js";
import type { ProgressionTransition } from "./progression/state.js";

export interface RuntimePolicy {
  readonly maxCanonicalDepth: number;
  readonly maxCanonicalNodes: number;
  readonly maxAutomaticTransitions: number;
}

export interface ExecutionRecord<
  State extends JsonObject = JsonObject,
  Outcome extends JsonObject = JsonObject,
  Payload extends JsonObject = JsonObject,
  Kind extends AggregateKind = AggregateKind,
> {
  readonly definitionId: string;
  readonly policy: RuntimePolicy;
  readonly aggregateBefore: Aggregate<State, Kind>;
  readonly command: Command<Payload, Kind>;
  readonly observations: readonly Observation[];
  readonly observationTrace: readonly ObservationConsumption[];
  readonly terminal: "accepted" | "no-op" | "rejected" | "invalid";
  readonly aggregateAfter?: Aggregate<State, Kind>;
  readonly outcome?: Outcome;
  readonly domainEvents?: readonly DomainEvent[];
  readonly effectIntents?: readonly EffectIntent[];
  readonly progressionTrace: readonly ProgressionTransition[];
  readonly diagnostics: readonly Diagnostic[];
}

interface RecordedExecution<
  State extends JsonObject,
  Outcome extends JsonObject,
  Payload extends JsonObject,
  Kind extends AggregateKind = AggregateKind,
> {
  readonly aggregate: Aggregate<State, Kind>;
  readonly record: ExecutionRecord<State, Outcome, Payload, Kind>;
}

export interface PreflightInvalidExecution {
  readonly kind: "invalid";
  readonly phase: "preflight";
  readonly diagnostics: readonly Diagnostic[];
}

export interface AcceptedExecution<
  State extends JsonObject,
  Outcome extends JsonObject,
  Payload extends JsonObject = JsonObject,
  Kind extends AggregateKind = AggregateKind,
> extends RecordedExecution<State, Outcome, Payload, Kind> {
  readonly kind: "accepted";
  readonly outcome: Outcome;
  readonly domainEvents: readonly DomainEvent[];
  readonly effectIntents: readonly EffectIntent[];
  readonly progressionTrace: readonly ProgressionTransition[];
}

export interface NoOpExecution<
  State extends JsonObject,
  Outcome extends JsonObject,
  Payload extends JsonObject = JsonObject,
  Kind extends AggregateKind = AggregateKind,
> extends RecordedExecution<State, Outcome, Payload, Kind> {
  readonly kind: "no-op";
  readonly outcome: Outcome;
}

export interface RejectedExecution<
  State extends JsonObject,
  Outcome extends JsonObject,
  Payload extends JsonObject = JsonObject,
  Kind extends AggregateKind = AggregateKind,
> extends RecordedExecution<State, Outcome, Payload, Kind> {
  readonly kind: "rejected";
  readonly outcome: Outcome;
}

export interface InvalidExecution<
  State extends JsonObject,
  Payload extends JsonObject,
  Kind extends AggregateKind = AggregateKind,
> extends RecordedExecution<State, JsonObject, Payload, Kind> {
  readonly kind: "invalid";
  readonly phase: "execution";
  readonly diagnostics: readonly Diagnostic[];
  readonly attemptedProgressionTrace: readonly ProgressionTransition[];
}

export type RecordedExecutionResult<
  State extends JsonObject,
  Outcome extends JsonObject,
  Payload extends JsonObject = JsonObject,
  Kind extends AggregateKind = AggregateKind,
> =
  | AcceptedExecution<State, Outcome, Payload, Kind>
  | NoOpExecution<State, Outcome, Payload, Kind>
  | RejectedExecution<State, Outcome, Payload, Kind>
  | InvalidExecution<State, Payload, Kind>;

export type ExecutionResult<
  State extends JsonObject,
  Outcome extends JsonObject,
  Payload extends JsonObject = JsonObject,
  Kind extends AggregateKind = AggregateKind,
> = PreflightInvalidExecution | RecordedExecutionResult<State, Outcome, Payload, Kind>;
