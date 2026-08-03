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
>(
  input: ValidateProgressionGraphInput<State, Payload, Outcome, Kind>,
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
    !Number.isSafeInteger(progressionValue.graphVersion) ||
    (progressionValue.graphVersion as number) < 1 ||
    !Array.isArray(progressionValue.nodes)
  ) {
    return invalid("progression-state-invalid", {
      graphId: definition.graphId,
      reason: "invalid-progression-fields",
    });
  }

  const graphId = progressionValue.graphId;
  const graphVersion = progressionValue.graphVersion as number;
  const nodes = progressionValue.nodes;
  if (graphId !== definition.graphId || graphVersion !== definition.graphVersion) {
    return invalid("progression-state-invalid", {
      actualGraphId: graphId,
      actualGraphVersion: graphVersion,
      expectedGraphId: definition.graphId,
      expectedGraphVersion: definition.graphVersion,
      reason: "graph-identity-mismatch",
    });
  }
  const expectedIds = [...nodeIds].sort();
  const actualIds: string[] = [];
  const stateByNode = new Map<string, ProgressionStatus>();
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node === null || typeof node !== "object" || Array.isArray(node)) {
      return invalid("progression-state-invalid", {
        graphId: definition.graphId,
        nodeIndex: index,
        reason: "invalid-node-state-shape",
      });
    }
    const nodeValue = node as Record<string, unknown>;
    if (typeof nodeValue.nodeId !== "string" || !isProgressionStatus(nodeValue.status)) {
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
  const intentNodes = new Set<string>();
  for (let index = 0; index < intents.length; index += 1) {
    const intent = intents[index];
    if (intent === null || typeof intent !== "object" || Array.isArray(intent)) {
      return invalid("progression-intent-invalid", {
        commandId: input.commandId ?? "",
        graphId: definition.graphId,
        intentIndex: index,
        reason: "invalid-intent-shape",
      });
    }
    const intentValue = intent as unknown as Record<string, unknown>;
    if (
      typeof intentValue.nodeId !== "string" ||
      !isProgressionStatus(intentValue.from) ||
      !isProgressionStatus(intentValue.to)
    ) {
      return invalid("progression-intent-invalid", {
        commandId: input.commandId ?? "",
        graphId: definition.graphId,
        intentIndex: index,
        reason: "invalid-intent-fields",
      });
    }
    const nodeId = intentValue.nodeId;
    const from = intentValue.from;
    const to = intentValue.to;
    const current = stateByNode.get(nodeId);
    if (
      current === undefined ||
      intentNodes.has(nodeId) ||
      current !== from ||
      !isLegalProgressionTransition(from, to)
    ) {
      return invalid("progression-intent-invalid", {
        commandId: input.commandId ?? "",
        current: current ?? null,
        from,
        graphId: definition.graphId,
        nodeId,
        reason: intentNodes.has(nodeId) ? "duplicate-intent" : "invalid-intent",
        to,
      });
    }
    intentNodes.add(nodeId);
  }

  return { kind: "valid" };
}
