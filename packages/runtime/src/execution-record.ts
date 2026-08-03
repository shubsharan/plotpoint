import type { Aggregate } from "./aggregates.js";
import type { JsonObject } from "./canonical-json.js";
import type { Command, DomainEvent, EffectIntent } from "./commands.js";
import type { Diagnostic } from "./diagnostics.js";
import type { Observation, ObservationConsumption } from "./observations.js";
import type { ProgressionTransition } from "./progression/state.js";

export interface RuntimePolicy {
  readonly contractVersion: 1;
  readonly maxCanonicalDepth: number;
  readonly maxCanonicalNodes: number;
  readonly maxAutomaticTransitions: number;
}

export interface ExecutionRecord<
  State extends JsonObject = JsonObject,
  Outcome extends JsonObject = JsonObject,
> {
  readonly formatVersion: 1;
  readonly definitionId: string;
  readonly policy: RuntimePolicy;
  readonly aggregateBefore: Aggregate<State>;
  readonly command: Command;
  readonly observations: readonly Observation[];
  readonly observationTrace: readonly ObservationConsumption[];
  readonly terminal: "accepted" | "no-op" | "rejected" | "invalid";
  readonly aggregateAfter?: Aggregate<State>;
  readonly outcome?: Outcome;
  readonly domainEvents?: readonly DomainEvent[];
  readonly effectIntents?: readonly EffectIntent[];
  readonly progressionTrace: readonly ProgressionTransition[];
  readonly diagnostics: readonly Diagnostic[];
}

interface ExecutionBase<State extends JsonObject, Outcome extends JsonObject> {
  readonly aggregate: Aggregate<State>;
  readonly record: ExecutionRecord<State, Outcome>;
}

export interface AcceptedExecution<
  State extends JsonObject,
  Outcome extends JsonObject,
> extends ExecutionBase<State, Outcome> {
  readonly kind: "accepted";
  readonly outcome: Outcome;
  readonly domainEvents: readonly DomainEvent[];
  readonly effectIntents: readonly EffectIntent[];
  readonly progressionTrace: readonly ProgressionTransition[];
}

export interface NoOpExecution<
  State extends JsonObject,
  Outcome extends JsonObject,
> extends ExecutionBase<State, Outcome> {
  readonly kind: "no-op";
  readonly outcome: Outcome;
}

export interface RejectedExecution<
  State extends JsonObject,
  Outcome extends JsonObject,
> extends ExecutionBase<State, Outcome> {
  readonly kind: "rejected";
  readonly outcome: Outcome;
}

export interface InvalidExecution<State extends JsonObject> extends ExecutionBase<
  State,
  JsonObject
> {
  readonly kind: "invalid";
  readonly diagnostics: readonly Diagnostic[];
  readonly attemptedProgressionTrace: readonly ProgressionTransition[];
}

export type ExecutionResult<State extends JsonObject, Outcome extends JsonObject> =
  | AcceptedExecution<State, Outcome>
  | NoOpExecution<State, Outcome>
  | RejectedExecution<State, Outcome>
  | InvalidExecution<State>;
