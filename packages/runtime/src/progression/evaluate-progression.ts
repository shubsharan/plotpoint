import { canonicalizeValue, type JsonObject } from "../canonical-json.js";
import type { Command, DomainEvent } from "../commands.js";
import { createDiagnostic, type Diagnostic } from "../diagnostics.js";
import type { ObservationConsumption } from "../observations.js";
import type { AutomaticRule, ProgressionDefinition, ProgressionRuleInput } from "./graph.js";
import type {
  ProgressionInstance,
  ProgressionIntent,
  ProgressionStatus,
  ProgressionTransition,
} from "./state.js";
import { validateProgressionGraph } from "./validate-graph.js";

export interface EvaluateProgressionInput<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
> {
  readonly definition: ProgressionDefinition<State, Payload, Outcome>;
  readonly progression: ProgressionInstance;
  readonly intents: readonly ProgressionIntent[];
  readonly aggregateState: State;
  readonly command: Command<Payload>;
  readonly outcome: Outcome;
  readonly domainEvents: readonly DomainEvent[];
  readonly observationTrace: readonly ObservationConsumption[];
  readonly maxAutomaticTransitions: number;
}

export type ProgressionEvaluationResult =
  | {
      readonly kind: "stable";
      readonly progression: ProgressionInstance;
      readonly trace: readonly ProgressionTransition[];
    }
  | {
      readonly kind: "invalid";
      readonly diagnostic: Diagnostic;
      readonly attemptedTrace: readonly ProgressionTransition[];
    };

function canonicalProgression(
  graphId: string,
  graphVersion: number,
  statuses: ReadonlyMap<string, ProgressionStatus>,
): ProgressionInstance {
  const candidate = {
    graphId,
    graphVersion,
    nodes: [...statuses.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([nodeId, status]) => ({ nodeId, status })),
  };
  const result = canonicalizeValue(candidate);
  if (result.kind === "invalid")
    throw new TypeError("Runtime constructed invalid progression state");
  return result.canonical.value as unknown as ProgressionInstance;
}

function stateText(progression: ProgressionInstance): string {
  const result = canonicalizeValue(progression);
  if (result.kind === "invalid")
    throw new TypeError("Runtime constructed invalid progression state");
  return result.canonical.text;
}

function invalid(
  diagnostic: Diagnostic,
  trace: readonly ProgressionTransition[],
): ProgressionEvaluationResult {
  return Object.freeze({
    kind: "invalid",
    diagnostic,
    attemptedTrace: Object.freeze([...trace]),
  });
}

export function evaluateProgression<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
>(input: EvaluateProgressionInput<State, Payload, Outcome>): ProgressionEvaluationResult {
  const validation = validateProgressionGraph({
    definition: input.definition,
    progression: input.progression,
    intents: input.intents,
    commandId: input.command.id,
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
  const trace: ProgressionTransition[] = [];
  for (const intent of input.intents) {
    statuses.set(intent.nodeId, intent.to);
    trace.push(
      Object.freeze({
        sequence: trace.length,
        round: 0,
        source: "command",
        nodeId: intent.nodeId,
        from: intent.from,
        to: intent.to,
      }),
    );
  }

  let progression = canonicalProgression(
    input.definition.graphId,
    input.definition.graphVersion,
    statuses,
  );
  const seen = new Map<string, number>([[stateText(progression), 0]]);
  let appliedCount = 0;
  let round = 0;

  while (true) {
    round += 1;
    const ruleInputCandidate: ProgressionRuleInput<State, Payload, Outcome> = {
      aggregateState: input.aggregateState,
      progression,
      command: input.command,
      outcome: input.outcome,
      domainEvents: input.domainEvents,
      observationTrace: input.observationTrace,
    };
    const canonicalInput = canonicalizeValue(ruleInputCandidate);
    if (canonicalInput.kind === "invalid") {
      return invalid(
        createDiagnostic("progression-rule-failed", {
          commandId: input.command.id,
          graphId: input.definition.graphId,
          reason: canonicalInput.diagnostic.code,
        }),
        trace,
      );
    }
    const frozenInput = canonicalInput.canonical.value as unknown as ProgressionRuleInput<
      State,
      Payload,
      Outcome
    >;
    const enabled: AutomaticRule<State, Payload, Outcome>[] = [];
    for (const rule of input.definition.automaticRules) {
      const current = statuses.get(rule.targetNodeId);
      if (current === undefined || !rule.from.includes(current)) continue;
      let selected: unknown;
      try {
        selected = rule.when(frozenInput);
      } catch {
        return invalid(
          createDiagnostic("progression-rule-failed", {
            commandId: input.command.id,
            graphId: input.definition.graphId,
            reason: "predicate-threw",
            ruleId: rule.ruleId,
          }),
          trace,
        );
      }
      if (typeof selected !== "boolean") {
        return invalid(
          createDiagnostic("progression-rule-failed", {
            commandId: input.command.id,
            graphId: input.definition.graphId,
            reason: "predicate-not-boolean",
            ruleId: rule.ruleId,
          }),
          trace,
        );
      }
      if (selected) enabled.push(rule);
    }

    const byTarget = new Map<string, AutomaticRule<State, Payload, Outcome>[]>();
    for (const rule of enabled) {
      const group = byTarget.get(rule.targetNodeId) ?? [];
      group.push(rule);
      byTarget.set(rule.targetNodeId, group);
    }
    const winners: AutomaticRule<State, Payload, Outcome>[] = [];
    for (const [nodeId, rules] of byTarget) {
      const lowestPriority = Math.min(...rules.map((rule) => rule.priority));
      const lowest = rules.filter((rule) => rule.priority === lowestPriority);
      if (lowest.length > 1) {
        return invalid(
          createDiagnostic("progression-conflict", {
            commandId: input.command.id,
            graphId: input.definition.graphId,
            nodeId,
            priority: lowestPriority,
            ruleIds: lowest.map((rule) => rule.ruleId).sort(),
          }),
          trace,
        );
      }
      winners.push(lowest[0] as AutomaticRule<State, Payload, Outcome>);
    }
    winners.sort(
      (left, right) =>
        left.targetNodeId.localeCompare(right.targetNodeId) ||
        left.ruleId.localeCompare(right.ruleId),
    );
    if (winners.length === 0) {
      return Object.freeze({ kind: "stable", progression, trace: Object.freeze([...trace]) });
    }

    const candidateTransitions = winners.map((rule) => ({
      nodeId: rule.targetNodeId,
      from: statuses.get(rule.targetNodeId) as ProgressionStatus,
      to: rule.to,
      ruleId: rule.ruleId,
    }));
    if (appliedCount + winners.length > input.maxAutomaticTransitions) {
      return invalid(
        createDiagnostic("progression-limit-overrun", {
          appliedCount,
          candidateTransitions,
          commandId: input.command.id,
          graphId: input.definition.graphId,
          limit: input.maxAutomaticTransitions,
          nextBatchSize: winners.length,
        }),
        trace,
      );
    }

    for (const rule of winners) {
      const from = statuses.get(rule.targetNodeId) as ProgressionStatus;
      statuses.set(rule.targetNodeId, rule.to);
      trace.push(
        Object.freeze({
          sequence: trace.length,
          round,
          source: "automatic",
          ruleId: rule.ruleId,
          nodeId: rule.targetNodeId,
          from,
          to: rule.to,
        }),
      );
    }
    appliedCount += winners.length;
    progression = canonicalProgression(
      input.definition.graphId,
      input.definition.graphVersion,
      statuses,
    );
    const text = stateText(progression);
    const firstSeen = seen.get(text);
    if (firstSeen !== undefined) {
      return invalid(
        createDiagnostic("progression-cycle", {
          commandId: input.command.id,
          cycleLength: appliedCount - firstSeen,
          cycleTrace: trace.slice(firstSeen) as unknown as readonly JsonObject[],
          firstSeenTransition: firstSeen,
          graphId: input.definition.graphId,
          graphVersion: input.definition.graphVersion,
          repeatedSnapshot: progression as unknown as JsonObject,
          repeatedTransition: appliedCount,
        }),
        trace,
      );
    }
    seen.set(text, appliedCount);
  }
}
