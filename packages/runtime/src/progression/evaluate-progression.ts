import type { AggregateKind } from "../aggregates.js";
import { canonicalizeValue, type JsonObject } from "../canonical-json.js";
import type { DomainEvent } from "../commands.js";
import { createDiagnostic, type Diagnostic } from "../diagnostics.js";
import {
  compareOrdinal,
  type ProgressionDefinition,
  type ProgressionFacts,
  type ProgressionTransition,
} from "./graph.js";
import type {
  ProgressionInstance,
  ProgressionIntent,
  ProgressionStatus,
  ProgressionTraceEntry,
} from "./state.js";
import { validateProgressionGraph } from "./validate-graph.js";

export interface EvaluateProgressionInput<
  State extends JsonObject,
  Kind extends AggregateKind = AggregateKind,
> {
  readonly definition: ProgressionDefinition<State, Kind>;
  readonly progression: ProgressionInstance;
  readonly intents: readonly ProgressionIntent[];
  readonly aggregateState: State;
  readonly domainEvents: readonly DomainEvent[];
  readonly commandId: string;
  readonly maxAutomaticTransitions: number;
}

export type ProgressionEvaluationResult =
  | {
      readonly kind: "stable";
      readonly progression: ProgressionInstance;
      readonly trace: readonly ProgressionTraceEntry[];
    }
  | {
      readonly kind: "invalid";
      readonly diagnostic: Diagnostic;
      readonly attemptedTrace: readonly ProgressionTraceEntry[];
    };

function canonicalProgression(
  graphId: string,
  statuses: ReadonlyMap<string, ProgressionStatus>,
): ProgressionInstance {
  return Object.freeze({
    graphId,
    nodes: Object.freeze(
      [...statuses.entries()]
        .sort(([left], [right]) => compareOrdinal(left, right))
        .map(([nodeId, status]) => Object.freeze({ nodeId, status })),
    ),
  });
}

function stateText(progression: ProgressionInstance): string {
  const result = canonicalizeValue(progression);
  if (result.kind === "invalid") {
    throw new TypeError("Runtime constructed invalid progression state");
  }
  return result.canonical.text;
}

function invalid(
  diagnostic: Diagnostic,
  trace: readonly ProgressionTraceEntry[],
): ProgressionEvaluationResult {
  return Object.freeze({
    kind: "invalid",
    diagnostic,
    attemptedTrace: Object.freeze([...trace]),
  });
}

export function evaluateProgression<State extends JsonObject, Kind extends AggregateKind>(
  input: EvaluateProgressionInput<State, Kind>,
): ProgressionEvaluationResult {
  const validation = validateProgressionGraph({
    definition: input.definition,
    progression: input.progression,
    intents: input.intents,
    commandId: input.commandId,
  });
  if (validation.kind === "invalid") return invalid(validation.diagnostic, []);
  if (!Number.isSafeInteger(input.maxAutomaticTransitions) || input.maxAutomaticTransitions < 0) {
    return invalid(
      createDiagnostic("progression-limit-overrun", {
        appliedCount: 0,
        limit: input.maxAutomaticTransitions,
        nextBatchSize: 0,
      }),
      [],
    );
  }

  const statuses = new Map(input.progression.nodes.map((node) => [node.nodeId, node.status]));
  const trace: ProgressionTraceEntry[] = [];
  for (const intent of input.intents) {
    const transition = input.definition.transitions.find(
      (candidate) =>
        candidate.transitionId === intent.transitionId && candidate.trigger === "intent",
    );
    if (transition === undefined) {
      throw new TypeError("Validated progression intent has no transition");
    }
    const from = statuses.get(transition.targetNodeId) as ProgressionStatus;
    statuses.set(transition.targetNodeId, transition.to);
    trace.push(
      Object.freeze({
        sequence: trace.length,
        round: 0,
        source: "command",
        transitionId: transition.transitionId,
        nodeId: transition.targetNodeId,
        from,
        to: transition.to,
      }),
    );
  }

  let progression = canonicalProgression(input.definition.graphId, statuses);
  const seen = new Map<string, number>([[stateText(progression), 0]]);
  let appliedCount = 0;
  let round = 0;

  while (true) {
    round += 1;
    const factsCandidate: ProgressionFacts<State> = {
      aggregateState: input.aggregateState,
      progression,
      domainEvents: input.domainEvents,
    };
    const canonicalFacts = canonicalizeValue(factsCandidate);
    if (canonicalFacts.kind === "invalid") {
      return invalid(
        createDiagnostic("progression-rule-failed", {
          commandId: input.commandId,
          graphId: input.definition.graphId,
          reason: canonicalFacts.diagnostic.code,
        }),
        trace,
      );
    }
    const frozenFacts = canonicalFacts.canonical.value as unknown as ProgressionFacts<State>;
    const enabled: ProgressionTransition<State>[] = [];
    for (const transition of input.definition.transitions) {
      if (transition.trigger !== "automatic") continue;
      const current = statuses.get(transition.targetNodeId);
      if (current === undefined || !transition.from.includes(current)) continue;
      let selected: unknown;
      try {
        selected = transition.when?.(frozenFacts);
      } catch {
        return invalid(
          createDiagnostic("progression-rule-failed", {
            commandId: input.commandId,
            graphId: input.definition.graphId,
            reason: "predicate-threw",
            transitionId: transition.transitionId,
          }),
          trace,
        );
      }
      if (typeof selected !== "boolean") {
        return invalid(
          createDiagnostic("progression-rule-failed", {
            commandId: input.commandId,
            graphId: input.definition.graphId,
            reason: "predicate-not-boolean",
            transitionId: transition.transitionId,
          }),
          trace,
        );
      }
      if (selected) enabled.push(transition);
    }

    const byTarget = new Map<string, ProgressionTransition<State>[]>();
    for (const transition of enabled) {
      const group = byTarget.get(transition.targetNodeId) ?? [];
      group.push(transition);
      byTarget.set(transition.targetNodeId, group);
    }
    const winners: ProgressionTransition<State>[] = [];
    for (const [nodeId, transitions] of byTarget) {
      const lowestPriority = Math.min(...transitions.map((transition) => transition.priority));
      const lowest = transitions.filter((transition) => transition.priority === lowestPriority);
      if (lowest.length > 1) {
        return invalid(
          createDiagnostic("progression-conflict", {
            commandId: input.commandId,
            graphId: input.definition.graphId,
            nodeId,
            priority: lowestPriority,
            transitionIds: lowest.map((transition) => transition.transitionId).sort(compareOrdinal),
          }),
          trace,
        );
      }
      winners.push(lowest[0] as ProgressionTransition<State>);
    }
    winners.sort(
      (left, right) =>
        compareOrdinal(left.targetNodeId, right.targetNodeId) ||
        compareOrdinal(left.transitionId, right.transitionId),
    );
    if (winners.length === 0) {
      return Object.freeze({ kind: "stable", progression, trace: Object.freeze([...trace]) });
    }

    const candidateTransitions = winners.map((transition) => ({
      nodeId: transition.targetNodeId,
      from: statuses.get(transition.targetNodeId) as ProgressionStatus,
      to: transition.to,
      transitionId: transition.transitionId,
    }));
    if (appliedCount + winners.length > input.maxAutomaticTransitions) {
      return invalid(
        createDiagnostic("progression-limit-overrun", {
          appliedCount,
          candidateTransitions,
          commandId: input.commandId,
          graphId: input.definition.graphId,
          limit: input.maxAutomaticTransitions,
          nextBatchSize: winners.length,
        }),
        trace,
      );
    }

    for (const transition of winners) {
      const from = statuses.get(transition.targetNodeId) as ProgressionStatus;
      statuses.set(transition.targetNodeId, transition.to);
      trace.push(
        Object.freeze({
          sequence: trace.length,
          round,
          source: "automatic",
          transitionId: transition.transitionId,
          nodeId: transition.targetNodeId,
          from,
          to: transition.to,
        }),
      );
    }
    appliedCount += winners.length;
    progression = canonicalProgression(input.definition.graphId, statuses);
    const text = stateText(progression);
    const firstSeenAutomaticCount = seen.get(text);
    if (firstSeenAutomaticCount !== undefined) {
      const automaticTrace = trace.filter((transition) => transition.source === "automatic");
      return invalid(
        createDiagnostic("progression-cycle", {
          commandId: input.commandId,
          cycleLength: appliedCount - firstSeenAutomaticCount,
          cycleTrace: automaticTrace.slice(
            firstSeenAutomaticCount,
          ) as unknown as readonly JsonObject[],
          firstSeenTransition: firstSeenAutomaticCount,
          graphId: input.definition.graphId,
          repeatedSnapshot: progression as unknown as JsonObject,
          repeatedTransition: appliedCount,
        }),
        trace,
      );
    }
    seen.set(text, appliedCount);
  }
}
