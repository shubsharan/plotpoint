import type { CandidateTransition, DurableTransitionResult, SnapshotRecord } from "../model";
import { validateCandidateTransition } from "./validation";

export interface TransitionStore {
  transaction<T>(operation: (transaction: TransitionTransaction) => Promise<T>): Promise<T>;
}

export interface TransitionTransaction {
  getReceipt(runId: string, commandId: string): Promise<DurableTransitionResult | null>;
  getSnapshot(runId: string): Promise<SnapshotRecord | null>;
  observationsExist(runId: string, observationIds: readonly string[]): Promise<boolean>;
  record(runId: string, candidate: CandidateTransition): Promise<DurableTransitionResult>;
}

export async function commitCandidateTransition(input: {
  readonly store: TransitionStore;
  readonly runId: string;
  readonly candidate: CandidateTransition;
}): Promise<DurableTransitionResult> {
  const validated = validateCandidateTransition(input.candidate);
  if (validated.kind === "invalid") {
    return { kind: "invalid", commandId: input.candidate.commandId, code: validated.code };
  }
  const candidate = validated.candidate;
  return input.store.transaction(async (transaction) => {
    const prior = await transaction.getReceipt(input.runId, candidate.commandId);
    if (prior !== null) return { ...prior, kind: "duplicate" };

    const snapshot = await transaction.getSnapshot(input.runId);
    const currentVersion = snapshot?.stateVersion ?? 0;
    if (currentVersion !== candidate.expectedVersion) {
      return {
        kind: "stale",
        commandId: candidate.commandId,
        resultingVersion: currentVersion,
        code: "transition-expected-version-stale",
      };
    }
    if (
      snapshot !== null &&
      (snapshot.aggregateId !== candidate.aggregateId ||
        snapshot.aggregateKind !== candidate.aggregateKind ||
        snapshot.schemaId !== candidate.schemaId ||
        snapshot.schemaVersion !== candidate.schemaVersion)
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
