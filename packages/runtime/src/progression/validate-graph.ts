import type { AggregateKind } from "../aggregates.js";
import type { JsonObject } from "../canonical-json.js";
import { createDiagnostic, type Diagnostic } from "../diagnostics.js";
import type { DefinedProgression } from "./graph.js";
import {
  PROGRESSION_STATUSES,
  type ProgressionInstance,
  type ProgressionIntent,
  type ProgressionStatus,
} from "./state.js";

const LEGAL_TRANSITIONS: Readonly<Record<ProgressionStatus, readonly ProgressionStatus[]>> = {
  locked: ["available", "skipped"],
  available: ["active", "completed", "skipped"],
  active: ["available", "completed", "skipped"],
  completed: [],
  skipped: [],
};

export function isProgressionStatus(value: unknown): value is ProgressionStatus {
  return typeof value === "string" && PROGRESSION_STATUSES.includes(value as ProgressionStatus);
}

export function isLegalProgressionTransition(
  from: ProgressionStatus,
  to: ProgressionStatus,
): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

export interface ValidateProgressionGraphInput<
  State extends JsonObject = JsonObject,
  Payload extends JsonObject = JsonObject,
  Outcome extends JsonObject = JsonObject,
  Kind extends AggregateKind = AggregateKind,
> {
  readonly definition: DefinedProgression<State, Payload, Outcome, Kind>;
  readonly progression: ProgressionInstance;
  readonly intents?: readonly ProgressionIntent[];
  readonly commandId?: string;
}

export type ValidateProgressionGraphResult =
  | { readonly kind: "valid" }
  | { readonly kind: "invalid"; readonly diagnostic: Diagnostic };

function invalid(code: Diagnostic["code"], details: JsonObject): ValidateProgressionGraphResult {
  return { kind: "invalid", diagnostic: createDiagnostic(code, details) };
}

export function validateProgressionGraph<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
  Kind extends AggregateKind,
>(input: ValidateProgressionGraphInput<State, Payload, Outcome, Kind>): ValidateProgressionGraphResult {
  const { definition, progression, intents = [] } = input;
  const nodeIds = new Set(definition.nodes.map((node) => node.nodeId));

  if (
    progression === null ||
    typeof progression !== "object" ||
    !Array.isArray(progression.nodes)
  ) {
    return invalid("progression-state-invalid", {
      graphId: definition.graphId,
      reason: "invalid-progression-shape",
    });
  }
  if (
    progression.graphId !== definition.graphId ||
    progression.graphVersion !== definition.graphVersion
  ) {
    return invalid("progression-state-invalid", {
      actualGraphId: progression.graphId,
      actualGraphVersion: progression.graphVersion,
      expectedGraphId: definition.graphId,
      expectedGraphVersion: definition.graphVersion,
    });
  }
  const expectedIds = [...nodeIds].sort();
  if (
    progression.nodes.some(
      (node) => node === null || typeof node !== "object" || Array.isArray(node),
    )
  ) {
    return invalid("progression-state-invalid", {
      expectedNodeIds: expectedIds,
      graphId: definition.graphId,
      reason: "invalid-node-state-shape",
    });
  }
  const actualIds = progression.nodes.map((node) => node.nodeId);
  if (
    actualIds.length !== expectedIds.length ||
    actualIds.some((nodeId, index) => nodeId !== expectedIds[index]) ||
    progression.nodes.some((node) => !isProgressionStatus(node.status))
  ) {
    return invalid("progression-state-invalid", {
      actualNodeIds: actualIds,
      expectedNodeIds: expectedIds,
      graphId: definition.graphId,
      reason: "node-set-order-or-status-mismatch",
    });
  }

  const stateByNode = new Map(progression.nodes.map((node) => [node.nodeId, node.status]));
  if (!Array.isArray(intents)) {
    return invalid("progression-intent-invalid", {
      commandId: input.commandId ?? "",
      graphId: definition.graphId,
      reason: "invalid-intents-shape",
    });
  }
  const intentNodes = new Set<string>();
  for (const intent of intents) {
    if (intent === null || typeof intent !== "object" || Array.isArray(intent)) {
      return invalid("progression-intent-invalid", {
        commandId: input.commandId ?? "",
        graphId: definition.graphId,
        reason: "invalid-intent-shape",
      });
    }
    const current = stateByNode.get(intent.nodeId);
    if (
      current === undefined ||
      intentNodes.has(intent.nodeId) ||
      !isProgressionStatus(intent.from) ||
      !isProgressionStatus(intent.to) ||
      current !== intent.from ||
      !isLegalProgressionTransition(intent.from, intent.to)
    ) {
      return invalid("progression-intent-invalid", {
        commandId: input.commandId ?? "",
        current: current ?? null,
        from: intent.from,
        graphId: definition.graphId,
        nodeId: intent.nodeId,
        reason: intentNodes.has(intent.nodeId) ? "duplicate-intent" : "invalid-intent",
        to: intent.to,
      });
    }
    intentNodes.add(intent.nodeId);
  }

  return { kind: "valid" };
}
