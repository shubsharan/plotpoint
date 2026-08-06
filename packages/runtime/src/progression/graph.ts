import { isAggregateKind, type AggregateKind } from "../aggregates.js";
import { canonicalizeValue, type JsonObject } from "../canonical-json.js";
import type { DomainEvent } from "../commands.js";
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

export interface ProgressionFacts<State extends JsonObject> {
  readonly aggregateState: State;
  readonly domainEvents: readonly DomainEvent[];
  readonly progression: ProgressionInstance;
}

export interface ProgressionTransition<State extends JsonObject = JsonObject> {
  readonly transitionId: string;
  readonly targetNodeId: string;
  readonly from: readonly ProgressionStatus[];
  readonly to: ProgressionStatus;
  readonly priority: number;
  readonly trigger: "automatic" | "intent";
  readonly when?: (facts: ProgressionFacts<State>) => boolean;
}

export interface ProgressionDefinition<
  State extends JsonObject = JsonObject,
  Kind extends AggregateKind = AggregateKind,
> {
  readonly aggregateKind: Kind;
  readonly graphId: string;
  readonly nodes: readonly ProgressionNodeDefinition[];
  readonly transitions: readonly ProgressionTransition<State>[];
}

export function defineProgression<Kind extends AggregateKind, State extends JsonObject>(
  definition: ProgressionDefinition<State, Kind>,
): ProgressionDefinition<State, Kind> {
  if (
    definition === null ||
    typeof definition !== "object" ||
    !Array.isArray(definition.nodes) ||
    !Array.isArray(definition.transitions) ||
    !isAggregateKind(definition.aggregateKind) ||
    !validIdentity(definition.graphId) ||
    Object.keys(definition).some(
      (field) =>
        field !== "aggregateKind" &&
        field !== "graphId" &&
        field !== "nodes" &&
        field !== "transitions",
    )
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
      nodeIds.has(node.nodeId) ||
      Object.keys(node).some((field) => field !== "nodeId" && field !== "initialStatus")
    ) {
      throw new TypeError("Invalid or duplicate progression node");
    }
    nodeIds.add(node.nodeId);
    return Object.freeze({ nodeId: node.nodeId, initialStatus: node.initialStatus });
  });
  nodes.sort((left, right) => compareOrdinal(left.nodeId, right.nodeId));

  const transitionIds = new Set<string>();
  const transitions = definition.transitions.map((transition) => {
    if (
      transition === null ||
      typeof transition !== "object" ||
      Array.isArray(transition) ||
      !Array.isArray(transition.from) ||
      !validIdentity(transition.transitionId) ||
      transitionIds.has(transition.transitionId) ||
      !nodeIds.has(transition.targetNodeId) ||
      !Number.isSafeInteger(transition.priority) ||
      (transition.trigger !== "automatic" && transition.trigger !== "intent") ||
      transition.from.length === 0 ||
      !isStatus(transition.to) ||
      new Set(transition.from).size !== transition.from.length ||
      (transition.trigger === "automatic" && typeof transition.when !== "function") ||
      (transition.trigger === "intent" && transition.when !== undefined) ||
      Object.keys(transition).some(
        (field) =>
          field !== "transitionId" &&
          field !== "targetNodeId" &&
          field !== "from" &&
          field !== "to" &&
          field !== "priority" &&
          field !== "trigger" &&
          field !== "when",
      )
    ) {
      throw new TypeError("Invalid progression transition");
    }
    for (const from of transition.from) {
      if (!isStatus(from) || !LEGAL_TRANSITIONS[from].includes(transition.to)) {
        throw new TypeError("Illegal progression transition");
      }
    }
    transitionIds.add(transition.transitionId);
    return Object.freeze({
      transitionId: transition.transitionId,
      targetNodeId: transition.targetNodeId,
      from: Object.freeze([...transition.from].sort(compareOrdinal)),
      to: transition.to,
      priority: transition.priority,
      trigger: transition.trigger,
      ...(transition.when === undefined ? {} : { when: transition.when }),
    });
  });
  transitions.sort(
    (left, right) =>
      compareOrdinal(left.targetNodeId, right.targetNodeId) ||
      left.priority - right.priority ||
      compareOrdinal(left.transitionId, right.transitionId),
  );

  return Object.freeze({
    aggregateKind: definition.aggregateKind,
    graphId: definition.graphId,
    nodes: Object.freeze(nodes),
    transitions: Object.freeze(transitions),
  });
}

export function initialProgression<State extends JsonObject, Kind extends AggregateKind>(
  definition: ProgressionDefinition<State, Kind>,
): ProgressionInstance {
  const validatedDefinition = defineProgression(definition);
  const progression = Object.freeze({
    graphId: validatedDefinition.graphId,
    nodes: Object.freeze(
      [...validatedDefinition.nodes]
        .sort((left, right) => compareOrdinal(left.nodeId, right.nodeId))
        .map((node) => Object.freeze({ nodeId: node.nodeId, status: node.initialStatus })),
    ),
  });
  const result = canonicalizeValue(progression);
  if (result.kind === "invalid") {
    throw new TypeError("Runtime constructed invalid initial progression");
  }
  return progression;
}
