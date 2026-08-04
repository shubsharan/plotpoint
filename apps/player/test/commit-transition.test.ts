import { describe, expect, it } from "vitest";

import {
  commitCandidateTransition,
  type TransitionStore,
  type TransitionTransaction,
} from "../src/persistence/commit-transition";
import type { CandidateTransition, DurableTransitionResult, SnapshotRecord } from "../src/model";

class MemoryStore implements TransitionStore, TransitionTransaction {
  receipts = new Map<string, DurableTransitionResult>();
  snapshot: SnapshotRecord | null = null;
  journals: string[] = [];
  observationLinks = new Set<string>();
  observations = new Set(["location-1"]);
  records = 0;
  failDuringRecord = false;
  loseAfterCommit = false;

  async transaction<T>(operation: (transaction: TransitionTransaction) => Promise<T>): Promise<T> {
    const before = {
      receipts: new Map(this.receipts),
      snapshot: this.snapshot,
      journals: [...this.journals],
      links: new Set(this.observationLinks),
      records: this.records,
    };
    let result: T;
    try {
      result = await operation(this);
    } catch (error) {
      this.receipts = before.receipts;
      this.snapshot = before.snapshot;
      this.journals = before.journals;
      this.observationLinks = before.links;
      this.records = before.records;
      throw error;
    }
    if (this.loseAfterCommit) {
      this.loseAfterCommit = false;
      throw new Error("transition-result-delivery-lost");
    }
    return result;
  }

  async getReceipt(_runId: string, commandId: string): Promise<DurableTransitionResult | null> {
    return this.receipts.get(commandId) ?? null;
  }

  async getSnapshot(): Promise<SnapshotRecord | null> {
    return this.snapshot;
  }

  async observationsExist(_runId: string, ids: readonly string[]): Promise<boolean> {
    return ids.every((id) => this.observations.has(id));
  }

  async record(runId: string, candidate: CandidateTransition): Promise<DurableTransitionResult> {
    this.records += 1;
    const resultingVersion =
      candidate.commandOutcome === "accepted"
        ? candidate.expectedVersion + 1
        : candidate.expectedVersion;
    const result: DurableTransitionResult = {
      kind: "accepted",
      commandId: candidate.commandId,
      commandOutcome: candidate.commandOutcome,
      expectedVersion: candidate.expectedVersion,
      resultingVersion,
      ...(candidate.commandOutcome === "invalid"
        ? { diagnosticCodes: candidate.diagnosticCodes }
        : { outcome: candidate.outcome }),
      observationIds: candidate.observationIds,
    };
    this.receipts.set(candidate.commandId, result);
    for (const observationId of candidate.observationIds) {
      this.observationLinks.add(`${candidate.commandId}:${observationId}`);
    }
    if (this.failDuringRecord) throw new Error("transaction-write-failed");
    if (candidate.commandOutcome === "accepted") {
      this.snapshot = {
        runId,
        aggregateId: candidate.aggregateId,
        aggregateKind: "player",
        schemaId: candidate.schemaId,
        schemaVersion: candidate.schemaVersion,
        stateVersion: resultingVersion,
        state: candidate.nextState,
        journalPosition: this.journals.length + 1,
      };
      this.journals.push(candidate.commandId);
    }
    return result;
  }
}

const base = {
  commandId: "command-1",
  aggregateId: "player-1",
  aggregateKind: "player" as const,
  schemaId: "field.player-state.v1",
  schemaVersion: 1,
  expectedVersion: 0,
  observationIds: ["location-1"],
};

function candidate(
  commandOutcome: "accepted" | "no-op" | "rejected" | "invalid",
): CandidateTransition {
  if (commandOutcome === "accepted") {
    return {
      ...base,
      commandOutcome,
      outcome: { result: "advanced" },
      nextState: { phase: "puzzle", attempts: 0 },
      progressionChanges: ["puzzle"],
    };
  }
  if (commandOutcome === "invalid") {
    return { ...base, commandOutcome, diagnosticCodes: ["release-command-failed"] };
  }
  return { ...base, commandOutcome, outcome: { result: "not-advanced" } };
}

describe("atomic transition policy", () => {
  it.each(["accepted", "no-op", "rejected", "invalid"] as const)(
    "records the canonical %s terminal and its observation links",
    async (terminal) => {
      const store = new MemoryStore();
      const result = await commitCandidateTransition({
        store,
        runId: "run-1",
        candidate: candidate(terminal),
      });
      expect(result).toMatchObject({ kind: "accepted", commandOutcome: terminal });
      expect(store.receipts).toHaveLength(1);
      expect(store.observationLinks).toEqual(new Set(["command-1:location-1"]));
      expect(store.journals).toHaveLength(terminal === "accepted" ? 1 : 0);
      if (terminal === "accepted") expect(store.snapshot).toEqual(expect.any(Object));
      else expect(store.snapshot).toBeNull();
    },
  );

  it("returns stale and missing-observation host errors without recording receipts", async () => {
    const store = new MemoryStore();
    store.snapshot = {
      runId: "run-1",
      aggregateId: "player-1",
      aggregateKind: "player",
      schemaId: "field.player-state.v1",
      schemaVersion: 1,
      stateVersion: 2,
      state: { phase: "puzzle" },
      journalPosition: 2,
    };
    await expect(
      commitCandidateTransition({ store, runId: "run-1", candidate: candidate("accepted") }),
    ).resolves.toMatchObject({ kind: "stale", resultingVersion: 2 });
    store.snapshot = null;
    store.observations.clear();
    await expect(
      commitCandidateTransition({ store, runId: "run-1", candidate: candidate("accepted") }),
    ).resolves.toMatchObject({ kind: "invalid", code: "transition-observation-missing" });
    expect(store.receipts).toHaveLength(0);
  });

  it("rejects non-closed terminal shapes, duplicate observations, and mismatched targets", async () => {
    const store = new MemoryStore();
    const extraField = { ...candidate("no-op"), nextState: {} } as unknown as CandidateTransition;
    await expect(
      commitCandidateTransition({ store, runId: "run-1", candidate: extraField }),
    ).resolves.toMatchObject({ kind: "invalid", code: "transition-terminal-shape-invalid" });
    const duplicateObservation = {
      ...candidate("rejected"),
      observationIds: ["location-1", "location-1"],
    };
    await expect(
      commitCandidateTransition({ store, runId: "run-1", candidate: duplicateObservation }),
    ).resolves.toMatchObject({ kind: "invalid", code: "transition-observation-duplicate" });

    store.snapshot = {
      runId: "run-1",
      aggregateId: "another-player",
      aggregateKind: "player",
      schemaId: base.schemaId,
      schemaVersion: 1,
      stateVersion: 0,
      state: {},
      journalPosition: 0,
    };
    await expect(
      commitCandidateTransition({ store, runId: "run-1", candidate: candidate("accepted") }),
    ).resolves.toMatchObject({ kind: "invalid", code: "transition-aggregate-mismatch" });
    expect(store.receipts).toHaveLength(0);
  });

  it("rolls back receipt, snapshot, journal, and links when the transaction faults", async () => {
    const store = new MemoryStore();
    store.failDuringRecord = true;
    await expect(
      commitCandidateTransition({ store, runId: "run-1", candidate: candidate("accepted") }),
    ).rejects.toThrow("transaction-write-failed");
    expect(store.receipts).toHaveLength(0);
    expect(store.snapshot).toBeNull();
    expect(store.journals).toHaveLength(0);
    expect(store.observationLinks).toHaveLength(0);
  });

  it("restores the durable result after post-commit delivery loss", async () => {
    const store = new MemoryStore();
    store.loseAfterCommit = true;
    await expect(
      commitCandidateTransition({ store, runId: "run-1", candidate: candidate("accepted") }),
    ).rejects.toThrow("transition-result-delivery-lost");
    await expect(
      commitCandidateTransition({ store, runId: "run-1", candidate: candidate("accepted") }),
    ).resolves.toMatchObject({ kind: "duplicate", resultingVersion: 1 });
    expect(store.records).toBe(1);
    expect(store.journals).toEqual(["command-1"]);
  });

  it("returns one original receipt across one hundred duplicate deliveries", async () => {
    const store = new MemoryStore();
    const results: DurableTransitionResult[] = [];
    for (let attempt = 0; attempt < 100; attempt += 1) {
      results.push(
        await commitCandidateTransition({
          store,
          runId: "run-1",
          candidate: candidate("accepted"),
        }),
      );
    }
    expect(results[0]).toMatchObject({ kind: "accepted", resultingVersion: 1 });
    expect(results.slice(1).every((result) => result.kind === "duplicate")).toBe(true);
    expect(new Set(results.map((result) => result.resultingVersion))).toEqual(new Set([1]));
    expect(store.records).toBe(1);
    expect(store.journals).toHaveLength(1);
  });
});
