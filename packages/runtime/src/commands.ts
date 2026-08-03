import { isAggregateKind, type Aggregate, type AggregateKind } from "./aggregates.js";
import type { JsonObject } from "./canonical-json.js";
import type { TransitionContext } from "./observations.js";
import type { ProgressionIntent } from "./progression/state.js";

export interface CommandTarget<Kind extends AggregateKind = AggregateKind> {
  readonly kind: Kind;
  readonly id: string;
}

export interface Command<
  Payload extends JsonObject = JsonObject,
  Kind extends AggregateKind = AggregateKind,
> {
  readonly id: string;
  readonly type: string;
  readonly target: CommandTarget<Kind>;
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
  Kind extends AggregateKind = AggregateKind,
> {
  readonly definitionId: string;
  readonly commandType: string;
  readonly aggregateKind: Kind;
  readonly handle: (
    aggregate: Readonly<Aggregate<State, Kind>>,
    command: Readonly<Command<Payload, Kind>>,
    context: TransitionContext,
  ) => HandlerDecision<State, Outcome>;
}

export function defineCommand<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
  Kind extends AggregateKind = AggregateKind,
>(
  definition: CommandDefinition<State, Payload, Outcome, Kind>,
): CommandDefinition<State, Payload, Outcome, Kind> {
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
