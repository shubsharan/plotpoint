import { canonicalizeValue } from "@plotpoint/runtime";

import type {
  CandidateTransition,
  DurableCommandRecord,
  DurableTransitionResult,
  SnapshotRecord,
  TransitionCommitResult,
} from "../model";
import { validateCandidateTransition } from "./validation";

export interface TransitionStore {
  transaction<T>(operation: (transaction: TransitionTransaction) => Promise<T>): Promise<T>;
}

export interface TransitionTransaction {
  getReceipt(runId: string, commandId: string): Promise<DurableCommandRecord | null>;
  getSnapshot(runId: string): Promise<SnapshotRecord | null>;
  observationsExist(runId: string, observationIds: readonly string[]): Promise<boolean>;
  record(runId: string, candidate: CandidateTransition): Promise<DurableTransitionResult>;
}

function canonicalEqual(left: unknown, right: unknown): boolean {
  const leftCanonical = canonicalizeValue(left);
  const rightCanonical = canonicalizeValue(right);
  return (
    leftCanonical.kind === "valid" &&
    rightCanonical.kind === "valid" &&
    JSON.stringify(leftCanonical.canonical.value) === JSON.stringify(rightCanonical.canonical.value)
  );
}

function progressionTransitionIsCoherent(
  prior: NonNullable<SnapshotRecord["progression"]>,
  next: NonNullable<SnapshotRecord["progression"]>,
  trace: readonly Readonly<Record<string, unknown>>[],
): boolean {
  if (
    prior.graphId !== next.graphId ||
    prior.nodes.length !== next.nodes.length ||
    prior.nodes.some((node, index) => node.nodeId !== next.nodes[index]?.nodeId)
  ) {
    return false;
  }
  const statuses = new Map(prior.nodes.map((node) => [node.nodeId, node.status]));
  for (const [index, transition] of trace.entries()) {
    const fields = Object.keys(transition).sort();
    if (
      JSON.stringify(fields) !==
        JSON.stringify(["from", "nodeId", "round", "sequence", "source", "to", "transitionId"]) ||
      transition.sequence !== index ||
      !Number.isSafeInteger(transition.round) ||
      (transition.round as number) < 0 ||
      (transition.source !== "command" && transition.source !== "automatic") ||
      typeof transition.transitionId !== "string" ||
      transition.transitionId.length === 0 ||
      typeof transition.nodeId !== "string" ||
      statuses.get(transition.nodeId) !== transition.from ||
      typeof transition.to !== "string"
    ) {
      return false;
    }
    statuses.set(transition.nodeId, transition.to as (typeof prior.nodes)[number]["status"]);
  }
  return next.nodes.every((node) => statuses.get(node.nodeId) === node.status);
}

export async function commitCandidateTransition(input: {
  readonly store: TransitionStore;
  readonly runId: string;
  readonly candidate: CandidateTransition;
}): Promise<TransitionCommitResult> {
  const validated = validateCandidateTransition(input.candidate);
  if (validated.kind === "invalid") {
    return { kind: "invalid", commandId: input.candidate.commandId, code: validated.code };
  }
  const candidate = validated.candidate;
  return input.store.transaction(async (transaction) => {
    const prior = await transaction.getReceipt(input.runId, candidate.commandId);
    if (prior !== null) {
      const original = canonicalizeValue(prior.candidate);
      const repeated = canonicalizeValue(candidate);
      if (
        original.kind === "invalid" ||
        repeated.kind === "invalid" ||
        JSON.stringify(original.canonical.value) !== JSON.stringify(repeated.canonical.value)
      ) {
        return {
          kind: "invalid",
          commandId: candidate.commandId,
          code: "transition-command-reuse-conflict",
        };
      }
      return { ...prior.result, disposition: "duplicate" };
    }

    const snapshot = await transaction.getSnapshot(input.runId);
    const currentVersion = snapshot?.stateVersion ?? 0;
    if (currentVersion !== candidate.expectedStateVersion) {
      return {
        kind: "stale",
        commandId: candidate.commandId,
        resultingStateVersion: currentVersion,
        code: "transition-expected-version-stale",
      };
    }
    if (
      snapshot !== null &&
      (snapshot.modelId !== candidate.modelId ||
        snapshot.aggregateId !== candidate.target.aggregateId ||
        snapshot.aggregateKind !== candidate.target.aggregateKind ||
        snapshot.schemaId !== candidate.target.schemaId)
    ) {
      return {
        kind: "invalid",
        commandId: candidate.commandId,
        code: "transition-aggregate-mismatch",
      };
    }
    if (!(await transaction.observationsExist(input.runId, candidate.observationIds))) {
      return {
        kind: "invalid",
        commandId: candidate.commandId,
        code: "transition-observation-missing",
      };
    }
    if (candidate.terminal === "accepted") {
      if (
        (candidate.nextProgression === undefined && candidate.progressionTrace.length > 0) ||
        (candidate.nextProgression !== undefined &&
          (snapshot?.progression === undefined ||
            !progressionTransitionIsCoherent(
              snapshot.progression,
              candidate.nextProgression,
              candidate.progressionTrace,
            )))
      ) {
        return {
          kind: "invalid",
          commandId: candidate.commandId,
          code: "transition-progression-snapshot-mismatch",
        };
      }
      const stateChanged =
        candidate.nextState !== undefined &&
        (snapshot === null || !canonicalEqual(candidate.nextState, snapshot.state));
      const progressionChanged =
        candidate.nextProgression !== undefined &&
        (snapshot === null || !canonicalEqual(candidate.nextProgression, snapshot.progression));
      if (
        !stateChanged &&
        !progressionChanged &&
        candidate.domainEvents.length === 0 &&
        candidate.effectIntents.length === 0
      ) {
        return {
          kind: "invalid",
          commandId: candidate.commandId,
          code: "transition-accepted-fact-missing",
        };
      }
    }
    return transaction.record(input.runId, candidate);
  });
}
