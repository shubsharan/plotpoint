import type { JsonObject } from "../canonical-json.js";
import type { AggregateKind } from "../aggregates.js";
import type { Command, DomainEvent } from "../commands.js";
import type { ObservationConsumption } from "../observations.js";
import { PROGRESSION_STATUSES, type ProgressionInstance, type ProgressionStatus } from "./state.js";

const LEGAL_TRANSITIONS: Readonly<Record<ProgressionStatus, readonly ProgressionStatus[]>> = {
  locked: ["available", "skipped"],
  available: ["active", "completed", "skipped"],
  active: ["available", "completed", "skipped"],
  completed: [],
  skipped: [],
};

export function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validIdentity(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && /^[\x21-\x7e]+$/.test(value);
}

function isStatus(value: unknown): value is ProgressionStatus {
  return typeof value === "string" && PROGRESSION_STATUSES.includes(value as ProgressionStatus);
}

export interface ProgressionNodeDefinition {
  readonly nodeId: string;
  readonly initialStatus: ProgressionStatus;
}

export interface ProgressionRuleInput<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
  Kind extends AggregateKind = AggregateKind,
> {
  readonly aggregateState: State;
  readonly progression: ProgressionInstance;
  readonly command: Command<Payload, Kind>;
  readonly outcome: Outcome;
  readonly domainEvents: readonly DomainEvent[];
  readonly observationTrace: readonly ObservationConsumption[];
}

export interface AutomaticRule<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
  Kind extends AggregateKind = AggregateKind,
> {
  readonly ruleId: string;
  readonly targetNodeId: string;
  readonly from: readonly ProgressionStatus[];
  readonly to: ProgressionStatus;
  readonly priority: number;
  readonly when: (input: ProgressionRuleInput<State, Payload, Outcome, Kind>) => boolean;
}

export interface ProgressionDefinition<
  State extends JsonObject = JsonObject,
  Payload extends JsonObject = JsonObject,
  Outcome extends JsonObject = JsonObject,
  Kind extends AggregateKind = AggregateKind,
> {
  readonly graphId: string;
  readonly graphVersion: number;
  readonly nodes: readonly ProgressionNodeDefinition[];
  readonly automaticRules: readonly AutomaticRule<State, Payload, Outcome, Kind>[];
}

declare const definedProgressionBrand: unique symbol;

export interface DefinedProgression<
  State extends JsonObject = JsonObject,
  Payload extends JsonObject = JsonObject,
  Outcome extends JsonObject = JsonObject,
  Kind extends AggregateKind = AggregateKind,
> extends ProgressionDefinition<State, Payload, Outcome, Kind> {
  readonly [definedProgressionBrand]: true;
}

export function defineProgression<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
  Kind extends AggregateKind = AggregateKind,
>(
  definition: ProgressionDefinition<State, Payload, Outcome, Kind>,
): DefinedProgression<State, Payload, Outcome, Kind> {
  if (
    definition === null ||
    typeof definition !== "object" ||
    !Array.isArray(definition.nodes) ||
    !Array.isArray(definition.automaticRules) ||
    !validIdentity(definition.graphId) ||
    !Number.isSafeInteger(definition.graphVersion) ||
    definition.graphVersion < 1
  ) {
    throw new TypeError("Invalid progression definition");
  }

  const nodeIds = new Set<string>();
  const nodes = definition.nodes.map((node) => {
    if (
      node === null ||
      typeof node !== "object" ||
      Array.isArray(node) ||
      !validIdentity(node.nodeId) ||
      !isStatus(node.initialStatus) ||
      nodeIds.has(node.nodeId)
    ) {
      throw new TypeError("Invalid or duplicate progression node");
    }
    nodeIds.add(node.nodeId);
    return Object.freeze({ nodeId: node.nodeId, initialStatus: node.initialStatus });
  });
  nodes.sort((left, right) => compareOrdinal(left.nodeId, right.nodeId));

  const ruleIds = new Set<string>();
  const automaticRules = definition.automaticRules.map((rule) => {
    if (
      rule === null ||
      typeof rule !== "object" ||
      Array.isArray(rule) ||
      !Array.isArray(rule.from) ||
      !validIdentity(rule.ruleId) ||
      ruleIds.has(rule.ruleId) ||
      !nodeIds.has(rule.targetNodeId) ||
      !Number.isSafeInteger(rule.priority) ||
      typeof rule.when !== "function" ||
      rule.from.length === 0 ||
      !isStatus(rule.to) ||
      new Set(rule.from).size !== rule.from.length
    ) {
      throw new TypeError("Invalid progression rule");
    }
    for (const from of rule.from) {
      if (!isStatus(from) || !LEGAL_TRANSITIONS[from].includes(rule.to)) {
        throw new TypeError("Illegal progression rule transition");
      }
    }
    ruleIds.add(rule.ruleId);
    return Object.freeze({
      ruleId: rule.ruleId,
      targetNodeId: rule.targetNodeId,
      from: Object.freeze([...rule.from].sort(compareOrdinal)),
      to: rule.to,
      priority: rule.priority,
      when: rule.when,
    });
  });
  automaticRules.sort(
    (left, right) =>
      compareOrdinal(left.targetNodeId, right.targetNodeId) ||
      left.priority - right.priority ||
      compareOrdinal(left.ruleId, right.ruleId),
  );

  return Object.freeze({
    graphId: definition.graphId,
    graphVersion: definition.graphVersion,
    nodes: Object.freeze(nodes),
    automaticRules: Object.freeze(automaticRules),
  }) as DefinedProgression<State, Payload, Outcome, Kind>;
}
