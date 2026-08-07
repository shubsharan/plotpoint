import type { AggregateKind } from "../aggregates.js";
import type { JsonObject } from "../canonical-json.js";
import { createDiagnostic, type Diagnostic } from "../diagnostics.js";
import type { ProgressionDefinition } from "./graph.js";
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
  Kind extends AggregateKind = AggregateKind,
> {
  readonly definition: ProgressionDefinition<State, Kind>;
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

export function validateProgressionGraph<State extends JsonObject, Kind extends AggregateKind>(
  input: ValidateProgressionGraphInput<State, Kind>,
): ValidateProgressionGraphResult {
  const { definition, progression, intents = [] } = input;
  const nodeIds = new Set(definition.nodes.map((node) => node.nodeId));

  if (progression === null || typeof progression !== "object" || Array.isArray(progression)) {
    return invalid("progression-state-invalid", {
      graphId: definition.graphId,
      reason: "invalid-progression-shape",
    });
  }

  const progressionValue = progression as unknown as Record<string, unknown>;
  if (
    typeof progressionValue.graphId !== "string" ||
    !Array.isArray(progressionValue.nodes) ||
    Object.keys(progressionValue).some((field) => field !== "graphId" && field !== "nodes")
  ) {
    return invalid("progression-state-invalid", {
      graphId: definition.graphId,
      reason: "invalid-progression-fields",
    });
  }

  if (progressionValue.graphId !== definition.graphId) {
    return invalid("progression-state-invalid", {
      actualGraphId: progressionValue.graphId,
      expectedGraphId: definition.graphId,
      reason: "graph-identity-mismatch",
    });
  }
  const expectedIds = [...nodeIds].sort();
  const actualIds: string[] = [];
  const stateByNode = new Map<string, ProgressionStatus>();
  for (let index = 0; index < progressionValue.nodes.length; index += 1) {
    const node = progressionValue.nodes[index];
    if (node === null || typeof node !== "object" || Array.isArray(node)) {
      return invalid("progression-state-invalid", {
        graphId: definition.graphId,
        nodeIndex: index,
        reason: "invalid-node-state-shape",
      });
    }
    const nodeValue = node as Record<string, unknown>;
    if (
      typeof nodeValue.nodeId !== "string" ||
      !isProgressionStatus(nodeValue.status) ||
      Object.keys(nodeValue).some((field) => field !== "nodeId" && field !== "status")
    ) {
      return invalid("progression-state-invalid", {
        graphId: definition.graphId,
        nodeIndex: index,
        reason: "invalid-node-state-fields",
      });
    }
    actualIds.push(nodeValue.nodeId);
    stateByNode.set(nodeValue.nodeId, nodeValue.status);
  }
  if (
    actualIds.length !== expectedIds.length ||
    actualIds.some((nodeId, index) => nodeId !== expectedIds[index])
  ) {
    return invalid("progression-state-invalid", {
      actualNodeIds: actualIds,
      expectedNodeIds: expectedIds,
      graphId: definition.graphId,
      reason: "node-set-order-or-status-mismatch",
    });
  }

  if (!Array.isArray(intents)) {
    return invalid("progression-intent-invalid", {
      commandId: input.commandId ?? "",
      graphId: definition.graphId,
      reason: "invalid-intents-shape",
    });
  }
  const targetNodes = new Set<string>();
  for (let index = 0; index < intents.length; index += 1) {
    const intent = intents[index];
    if (
      intent === null ||
      typeof intent !== "object" ||
      Array.isArray(intent) ||
      typeof intent.transitionId !== "string" ||
      Object.keys(intent).some((field) => field !== "transitionId")
    ) {
      return invalid("progression-intent-invalid", {
        commandId: input.commandId ?? "",
        graphId: definition.graphId,
        intentIndex: index,
        reason: "invalid-intent-shape",
      });
    }
    const transition = definition.transitions.find(
      (candidate) =>
        candidate.transitionId === intent.transitionId && candidate.trigger === "intent",
    );
    const current = transition === undefined ? undefined : stateByNode.get(transition.targetNodeId);
    if (
      transition === undefined ||
      current === undefined ||
      targetNodes.has(transition.targetNodeId) ||
      !transition.from.includes(current)
    ) {
      return invalid("progression-intent-invalid", {
        commandId: input.commandId ?? "",
        current: current ?? null,
        graphId: definition.graphId,
        reason:
          transition !== undefined && targetNodes.has(transition.targetNodeId)
            ? "duplicate-target"
            : "invalid-intent",
        transitionId: intent.transitionId,
      });
    }
    targetNodes.add(transition.targetNodeId);
  }

  return { kind: "valid" };
}
