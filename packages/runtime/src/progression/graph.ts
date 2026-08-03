import type { JsonObject } from "../canonical-json.js";
import type { Command, DomainEvent } from "../commands.js";
import type { ObservationConsumption } from "../observations.js";
import type { ProgressionInstance, ProgressionStatus } from "./state.js";

export interface ProgressionNodeDefinition {
  readonly nodeId: string;
  readonly initialStatus: ProgressionStatus;
}

export interface ProgressionRuleInput<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
> {
  readonly aggregateState: State;
  readonly progression: ProgressionInstance;
  readonly command: Command<Payload>;
  readonly outcome: Outcome;
  readonly domainEvents: readonly DomainEvent[];
  readonly observationTrace: readonly ObservationConsumption[];
}

export interface AutomaticRule<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
> {
  readonly ruleId: string;
  readonly targetNodeId: string;
  readonly from: readonly ProgressionStatus[];
  readonly to: ProgressionStatus;
  readonly priority: number;
  readonly when: (input: ProgressionRuleInput<State, Payload, Outcome>) => boolean;
}

export interface ProgressionDefinition<
  State extends JsonObject = JsonObject,
  Payload extends JsonObject = JsonObject,
  Outcome extends JsonObject = JsonObject,
> {
  readonly graphId: string;
  readonly graphVersion: number;
  readonly nodes: readonly ProgressionNodeDefinition[];
  readonly automaticRules: readonly AutomaticRule<State, Payload, Outcome>[];
}
