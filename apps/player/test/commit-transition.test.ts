import { describe, expect, it } from "vitest";

import {
  commitCandidateTransition,
  type TransitionStore,
  type TransitionTransaction,
} from "../src/persistence/commit-transition";
import type { CandidateTransition, DurableTransitionResult, SnapshotRecord } from "../src/model";

class MemoryStore implements TransitionStore, TransitionTransaction {
  receipt: DurableTransitionResult | null = null;
  snapshot: SnapshotRecord | null = null;
  accepts = 0;
  observations = new Set(["location-1"]);
  async transaction<T>(operation: (transaction: TransitionTransaction) => Promise<T>): Promise<T> {
    return operation(this);
  }
  async getReceipt(): Promise<DurableTransitionResult | null> {
    return this.receipt;
  }
  async getSnapshot(): Promise<SnapshotRecord | null> {
    return this.snapshot;
  }
  async observationsExist(_runId: string, ids: readonly string[]): Promise<boolean> {
    return ids.every((id) => this.observations.has(id));
  }
  async accept(runId: string, candidate: CandidateTransition): Promise<DurableTransitionResult> {
    this.accepts += 1;
    const result: DurableTransitionResult = {
      kind: "accepted",
      commandId: candidate.commandId,
      commandOutcome: candidate.commandOutcome,
      resultingVersion: candidate.expectedVersion + 1,
    };
    this.receipt = result;
    this.snapshot = {
      runId,
      aggregateId: candidate.aggregateId,
      aggregateKind: "player",
      schemaId: candidate.schemaId,
      schemaVersion: candidate.schemaVersion,
      stateVersion: candidate.expectedVersion + 1,
      state: candidate.nextState,
      journalPosition: this.accepts,
    };
    return result;
  }
}

const candidate: CandidateTransition = {
  commandId: "command-1",
  aggregateId: "player-1",
  aggregateKind: "player",
  schemaId: "field.player-state.v1",
  schemaVersion: 1,
  expectedVersion: 0,
  commandOutcome: "accepted",
  outcome: { result: "advanced" },
  nextState: { phase: "puzzle", attempts: 0 },
  progressionChanges: ["puzzle"],
  observationIds: ["location-1"],
};

describe("atomic transition policy", () => {
  it("accepts once and returns the durable result for duplicates", async () => {
    const store = new MemoryStore();
    expect(await commitCandidateTransition({ store, runId: "run-1", candidate })).toMatchObject({
      kind: "accepted",
      resultingVersion: 1,
    });
    expect(await commitCandidateTransition({ store, runId: "run-1", candidate })).toMatchObject({
      kind: "duplicate",
      resultingVersion: 1,
    });
    expect(store.accepts).toBe(1);
  });

  it("rejects stale and missing-observation candidates without accepting", async () => {
    const store = new MemoryStore();
    store.snapshot = {
      runId: "run-1",
      aggregateId: "player-1",
      aggregateKind: "player",
      schemaId: "field.player-state.v1",
      schemaVersion: 1,
      stateVersion: 2,
      state: { phase: "puzzle", attempts: 0 },
      journalPosition: 2,
    };
    expect(await commitCandidateTransition({ store, runId: "run-1", candidate })).toMatchObject({
      kind: "stale",
      resultingVersion: 2,
    });
    store.snapshot = null;
    store.observations.clear();
    expect(await commitCandidateTransition({ store, runId: "run-1", candidate })).toMatchObject({
      kind: "invalid",
      code: "transition-observation-missing",
    });
    expect(store.accepts).toBe(0);
  });
});
