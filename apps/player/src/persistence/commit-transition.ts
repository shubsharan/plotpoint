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
    return transaction.record(input.runId, candidate);
  });
}
