import { canonicalizeValue } from "@plotpoint/runtime";

import type { CandidateTransition, DurableTransitionResult, SnapshotRecord } from "../model";

export interface TransitionStore {
  transaction<T>(operation: (transaction: TransitionTransaction) => Promise<T>): Promise<T>;
}

export interface TransitionTransaction {
  getReceipt(runId: string, commandId: string): Promise<DurableTransitionResult | null>;
  getSnapshot(runId: string): Promise<SnapshotRecord | null>;
  observationsExist(runId: string, observationIds: readonly string[]): Promise<boolean>;
  accept(runId: string, candidate: CandidateTransition): Promise<DurableTransitionResult>;
}

function validateCandidate(candidate: CandidateTransition): string | null {
  if (
    candidate.commandId.length === 0 ||
    candidate.aggregateId.length === 0 ||
    candidate.schemaId.length === 0 ||
    !Number.isSafeInteger(candidate.schemaVersion) ||
    candidate.schemaVersion < 1 ||
    !Number.isSafeInteger(candidate.expectedVersion) ||
    candidate.expectedVersion < 0
  ) {
    return "transition-identity-invalid";
  }
  if (new Set(candidate.observationIds).size !== candidate.observationIds.length) {
    return "transition-observation-duplicate";
  }
  if (
    canonicalizeValue(candidate.nextState).kind === "invalid" ||
    canonicalizeValue(candidate.outcome).kind === "invalid"
  ) {
    return "transition-canonical-value-invalid";
  }
  return null;
}

export async function commitCandidateTransition(input: {
  readonly store: TransitionStore;
  readonly runId: string;
  readonly candidate: CandidateTransition;
}): Promise<DurableTransitionResult> {
  const invalid = validateCandidate(input.candidate);
  if (invalid !== null) {
    return { kind: "invalid", commandId: input.candidate.commandId, code: invalid };
  }
  return input.store.transaction(async (transaction) => {
    const prior = await transaction.getReceipt(input.runId, input.candidate.commandId);
    if (prior !== null) return { ...prior, kind: "duplicate" };

    const snapshot = await transaction.getSnapshot(input.runId);
    const currentVersion = snapshot?.stateVersion ?? 0;
    if (currentVersion !== input.candidate.expectedVersion) {
      return {
        kind: "stale",
        commandId: input.candidate.commandId,
        resultingVersion: currentVersion,
        code: "transition-expected-version-stale",
      };
    }
    if (
      snapshot !== null &&
      (snapshot.aggregateId !== input.candidate.aggregateId ||
        snapshot.schemaId !== input.candidate.schemaId ||
        snapshot.schemaVersion !== input.candidate.schemaVersion)
    ) {
      return {
        kind: "invalid",
        commandId: input.candidate.commandId,
        code: "transition-aggregate-mismatch",
      };
    }
    if (!(await transaction.observationsExist(input.runId, input.candidate.observationIds))) {
      return {
        kind: "invalid",
        commandId: input.candidate.commandId,
        code: "transition-observation-missing",
      };
    }
    return transaction.accept(input.runId, input.candidate);
  });
}
