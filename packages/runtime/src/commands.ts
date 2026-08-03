import { isAggregateKind, type Aggregate, type AggregateKind } from "./aggregates.js";
import type { JsonObject } from "./canonical-json.js";
import type { TransitionContext } from "./observations.js";
import type { ProgressionIntent } from "./progression/state.js";

export interface CommandTarget {
  readonly kind: AggregateKind;
  readonly id: string;
}

export interface Command<Payload extends JsonObject = JsonObject> {
  readonly id: string;
  readonly type: string;
  readonly target: CommandTarget;
  readonly expectedStateVersion: number;
  readonly payload: Payload;
}

export type DomainEvent = JsonObject;
export type EffectIntent = JsonObject;

export interface AcceptedDecision<State extends JsonObject, Outcome extends JsonObject> {
  readonly kind: "accepted";
  readonly nextState: State;
  readonly outcome: Outcome;
  readonly domainEvents: readonly DomainEvent[];
  readonly effectIntents: readonly EffectIntent[];
  readonly progressionIntents: readonly ProgressionIntent[];
}

export interface RejectedDecision<Outcome extends JsonObject> {
  readonly kind: "rejected";
  readonly outcome: Outcome;
}

export type HandlerDecision<State extends JsonObject, Outcome extends JsonObject> =
  | AcceptedDecision<State, Outcome>
  | RejectedDecision<Outcome>;

export interface CommandDefinition<
  State extends JsonObject = JsonObject,
  Payload extends JsonObject = JsonObject,
  Outcome extends JsonObject = JsonObject,
> {
  readonly definitionId: string;
  readonly commandType: string;
  readonly aggregateKind: AggregateKind;
  readonly handle: (
    aggregate: Readonly<Aggregate<State>>,
    command: Readonly<Command<Payload>>,
    context: TransitionContext,
  ) => HandlerDecision<State, Outcome>;
}

export function defineCommand<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
>(
  definition: CommandDefinition<State, Payload, Outcome>,
): CommandDefinition<State, Payload, Outcome> {
  if (definition === null || typeof definition !== "object" || Array.isArray(definition)) {
    throw new TypeError("Command definition must be an object");
  }
  const descriptors = Object.getOwnPropertyDescriptors(definition);
  for (const field of ["definitionId", "commandType", "aggregateKind", "handle"] as const) {
    const descriptor = descriptors[field];
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new TypeError(`Command definition field ${field} must be a data property`);
    }
  }
  if (typeof definition.definitionId !== "string" || definition.definitionId.length === 0) {
    throw new TypeError("Command definition identity must be non-empty");
  }
  if (typeof definition.commandType !== "string" || definition.commandType.length === 0) {
    throw new TypeError("Command type must be non-empty");
  }
  if (!isAggregateKind(definition.aggregateKind)) {
    throw new TypeError("Command definition aggregate kind is invalid");
  }
  if (typeof definition.handle !== "function") {
    throw new TypeError("Command handler must be synchronous function data");
  }
  return Object.freeze({
    definitionId: definition.definitionId,
    commandType: definition.commandType,
    aggregateKind: definition.aggregateKind,
    handle: definition.handle,
  });
}
