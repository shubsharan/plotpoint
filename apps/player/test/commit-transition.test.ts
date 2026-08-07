import { describe, expect, it } from "vitest";

import type {
  CandidateTransition,
  DurableCommandRecord,
  DurableTransitionResult,
  SnapshotRecord,
} from "../src/model";
import {
  commitCandidateTransition,
  type TransitionStore,
  type TransitionTransaction,
} from "../src/persistence/commit-transition";

class MemoryStore implements TransitionStore, TransitionTransaction {
  receipts = new Map<string, DurableCommandRecord>();
  snapshot: SnapshotRecord | null = null;
  journals: DurableCommandRecord[] = [];
  observationLinks = new Set<string>();
  observations = new Set(["location-1"]);
  records = 0;
  transactions = 0;
  failDuringRecord = false;
  loseAfterCommit = false;

  async transaction<T>(operation: (transaction: TransitionTransaction) => Promise<T>): Promise<T> {
    this.transactions += 1;
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

  async getReceipt(_runId: string, commandId: string): Promise<DurableCommandRecord | null> {
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
    const resultingStateVersion =
      candidate.terminal === "accepted"
        ? candidate.expectedStateVersion + 1
        : candidate.expectedStateVersion;
    const result: DurableTransitionResult =
      candidate.terminal === "invalid"
        ? {
            commandId: candidate.commandId,
            disposition: "committed",
            terminal: "invalid",
            phase: "execution",
            resultingStateVersion,
            diagnosticCodes: candidate.diagnosticCodes,
          }
        : {
            commandId: candidate.commandId,
            disposition: "committed",
            terminal: candidate.terminal,
            resultingStateVersion,
            outcome: candidate.outcome,
          };
    const record = { candidate, result } satisfies DurableCommandRecord;
    this.receipts.set(candidate.commandId, record);
    for (const observationId of candidate.observationIds) {
      this.observationLinks.add(`${candidate.commandId}:${observationId}`);
    }
    if (this.failDuringRecord) throw new Error("transaction-write-failed");
    if (candidate.terminal === "accepted") {
      const state = candidate.nextState ?? this.snapshot?.state;
      if (state === undefined) throw new Error("transition-snapshot-state-missing");
      this.snapshot = {
        runId,
        modelId: candidate.modelId,
        aggregateId: candidate.target.aggregateId,
        aggregateKind: candidate.target.aggregateKind,
        schemaId: candidate.target.schemaId,
        stateVersion: resultingStateVersion,
        state,
        ...(candidate.nextProgression === undefined
          ? this.snapshot?.progression === undefined
            ? {}
            : { progression: this.snapshot.progression }
          : { progression: candidate.nextProgression }),
        journalPosition: this.journals.length + 1,
      };
      this.journals.push(record);
    }
    return result;
  }
}

const base = {
  commandId: "command-1",
  modelId: "field.player",
  commandType: "field.advance",
  payload: { answer: "north" },
  target: {
    aggregateId: "player-1",
    aggregateKind: "player" as const,
    schemaId: "field.player-state",
  },
  expectedStateVersion: 0,
  observationIds: ["location-1"],
};

function candidate(terminal: "accepted"): Extract<CandidateTransition, { terminal: "accepted" }>;
function candidate(terminal: "invalid"): Extract<CandidateTransition, { terminal: "invalid" }>;
function candidate(
  terminal: "no-op" | "rejected",
): Extract<CandidateTransition, { terminal: "no-op" | "rejected" }>;
function candidate(terminal: "accepted" | "no-op" | "rejected" | "invalid"): CandidateTransition;
function candidate(terminal: "accepted" | "no-op" | "rejected" | "invalid"): CandidateTransition {
  if (terminal === "accepted") {
    return {
      ...base,
      terminal,
      nextState: { phase: "complete", attempts: 1 },
      nextProgression: {
        graphId: "field.progression",
        nodes: [{ nodeId: "finish", status: "completed" as const }],
      },
      outcome: { result: "advanced" },
      domainEvents: [{ type: "field.advanced", payload: { phase: "complete" } }],
      effectIntents: [{ type: "field.notify", payload: { message: "Complete" } }],
      progressionTrace: [
        {
          sequence: 0,
          round: 0,
          source: "command",
          transitionId: "finish",
          nodeId: "finish",
          from: "active",
          to: "completed",
        },
      ],
    } satisfies CandidateTransition;
  }
  if (terminal === "invalid") {
    return {
      ...base,
      terminal,
      phase: "execution",
      diagnosticCodes: ["release-command-failed"],
      attemptedProgressionTrace: [],
    } satisfies CandidateTransition;
  }
  return {
    ...base,
    terminal,
    outcome: { result: "not-advanced" },
  } satisfies CandidateTransition;
}

function currentSnapshot(overrides: Partial<SnapshotRecord> = {}): SnapshotRecord {
  return {
    runId: "run-1",
    modelId: base.modelId,
    aggregateId: base.target.aggregateId,
    aggregateKind: "player",
    schemaId: base.target.schemaId,
    stateVersion: 0,
    state: { phase: "puzzle", attempts: 0 },
    progression: {
      graphId: "field.progression",
      nodes: [{ nodeId: "finish", status: "active" }],
    },
    journalPosition: 0,
    ...overrides,
  };
}

describe("atomic transition policy", () => {
  it.each(["accepted", "no-op", "rejected", "invalid"] as const)(
    "records the corrected %s terminal and its observation links",
    async (terminal) => {
      const store = new MemoryStore();
      if (terminal === "accepted") store.snapshot = currentSnapshot();

      const result = await commitCandidateTransition({
        store,
        runId: "run-1",
        candidate: candidate(terminal),
      });

      expect(result).toMatchObject({ disposition: "committed", terminal });
      expect(store.receipts).toHaveLength(1);
      expect(store.observationLinks).toEqual(new Set(["command-1:location-1"]));
      expect(store.journals).toHaveLength(terminal === "accepted" ? 1 : 0);
      if (terminal === "accepted") {
        expect(store.snapshot).toMatchObject({
          modelId: "field.player",
          schemaId: "field.player-state",
          stateVersion: 1,
          progression: candidate("accepted").nextProgression,
        });
        expect(store.journals[0]).toEqual({ candidate: candidate("accepted"), result });
      }
    },
  );

  it("preserves complete model, schema, progression, event, effect, and record identity", async () => {
    const store = new MemoryStore();
    store.snapshot = currentSnapshot();
    const corrected = candidate("accepted");

    await expect(
      commitCandidateTransition({ store, runId: "run-1", candidate: corrected }),
    ).resolves.toEqual({
      commandId: "command-1",
      disposition: "committed",
      terminal: "accepted",
      resultingStateVersion: 1,
      outcome: { result: "advanced" },
    });
    expect(store.receipts.get("command-1")?.candidate).toEqual(corrected);
    expect(store.receipts.get("command-1")?.candidate).toMatchObject({
      modelId: "field.player",
      target: { schemaId: "field.player-state" },
      nextProgression: corrected.nextProgression,
      domainEvents: corrected.domainEvents,
      effectIntents: corrected.effectIntents,
      progressionTrace: corrected.progressionTrace,
    });
  });

  it.each([
    [
      "state",
      {
        ...base,
        terminal: "accepted",
        nextState: { phase: "complete", attempts: 1 },
        outcome: { result: "state-recorded" },
        domainEvents: [],
        effectIntents: [],
        progressionTrace: [],
      } satisfies CandidateTransition,
    ],
    [
      "progression",
      {
        ...base,
        terminal: "accepted",
        nextProgression: {
          graphId: "field.progression",
          nodes: [{ nodeId: "finish", status: "completed" as const }],
        },
        outcome: { result: "progression-recorded" },
        domainEvents: [],
        effectIntents: [],
        progressionTrace: [
          {
            sequence: 0,
            round: 0,
            source: "command",
            transitionId: "finish",
            nodeId: "finish",
            from: "active",
            to: "completed",
          },
        ],
      } satisfies CandidateTransition,
    ],
    [
      "event",
      {
        ...base,
        terminal: "accepted",
        outcome: { result: "event-recorded" },
        domainEvents: [{ type: "field.noted", payload: { phase: "puzzle" } }],
        effectIntents: [],
        progressionTrace: [],
      } satisfies CandidateTransition,
    ],
    [
      "effect",
      {
        ...base,
        terminal: "accepted",
        outcome: { result: "effect-recorded" },
        domainEvents: [],
        effectIntents: [{ type: "field.notify", payload: { message: "Ready" } }],
        progressionTrace: [],
      } satisfies CandidateTransition,
    ],
  ] as const)(
    "commits an accepted %s-only fact as one complete versioned record",
    async (_kind, fact) => {
      const store = new MemoryStore();
      store.snapshot = currentSnapshot();

      const result = await commitCandidateTransition({
        store,
        runId: "run-1",
        candidate: fact,
      });

      expect(result).toMatchObject({
        disposition: "committed",
        terminal: "accepted",
        resultingStateVersion: 1,
      });
      expect(store.receipts.get(fact.commandId)).toEqual({ candidate: fact, result });
      expect(store.journals).toEqual([{ candidate: fact, result }]);
      expect(store.snapshot).toMatchObject({
        modelId: fact.modelId,
        aggregateId: fact.target.aggregateId,
        schemaId: fact.target.schemaId,
        stateVersion: 1,
        journalPosition: 1,
      });
    },
  );

  it("returns stale and missing-observation host errors without recording", async () => {
    const store = new MemoryStore();
    store.snapshot = currentSnapshot({ stateVersion: 2, journalPosition: 2 });
    await expect(
      commitCandidateTransition({ store, runId: "run-1", candidate: candidate("accepted") }),
    ).resolves.toMatchObject({ kind: "stale", resultingStateVersion: 2 });
    store.snapshot = null;
    store.observations.clear();
    await expect(
      commitCandidateTransition({ store, runId: "run-1", candidate: candidate("accepted") }),
    ).resolves.toMatchObject({ kind: "invalid", code: "transition-observation-missing" });
    expect(store.receipts).toHaveLength(0);
  });

  it("rejects superseded fields, duplicate observations, and mismatched model identity", async () => {
    const store = new MemoryStore();
    const superseded = {
      ...candidate("no-op"),
      schemaVersion: 1,
    } as unknown as CandidateTransition;
    await expect(
      commitCandidateTransition({ store, runId: "run-1", candidate: superseded }),
    ).resolves.toMatchObject({ kind: "invalid", code: "transition-candidate-invalid" });
    const duplicateObservation = {
      ...candidate("rejected"),
      observationIds: ["location-1", "location-1"],
    } as CandidateTransition;
    await expect(
      commitCandidateTransition({ store, runId: "run-1", candidate: duplicateObservation }),
    ).resolves.toMatchObject({ kind: "invalid", code: "transition-candidate-invalid" });

    store.snapshot = currentSnapshot({ modelId: "another.player" });
    await expect(
      commitCandidateTransition({ store, runId: "run-1", candidate: candidate("accepted") }),
    ).resolves.toMatchObject({ kind: "invalid", code: "transition-aggregate-mismatch" });
    expect(store.receipts).toHaveLength(0);
  });

  it.each(["state", "progression", "both"] as const)(
    "rejects accepted %s equality without an event or effect",
    async (kind) => {
      const existingProgression = candidate("accepted").nextProgression;
      const store = new MemoryStore();
      store.snapshot = currentSnapshot({ progression: existingProgression });
      const {
        nextState: _nextState,
        nextProgression: _nextProgression,
        domainEvents: _domainEvents,
        effectIntents: _effectIntents,
        progressionTrace: _progressionTrace,
        ...acceptedBase
      } = candidate("accepted");
      void _nextState;
      void _nextProgression;
      void _domainEvents;
      void _effectIntents;
      void _progressionTrace;
      const equalCandidate = {
        ...acceptedBase,
        ...(kind === "progression" ? {} : { nextState: store.snapshot.state }),
        ...(kind === "state" ? {} : { nextProgression: existingProgression }),
        domainEvents: [],
        effectIntents: [],
        progressionTrace: [],
      } satisfies CandidateTransition;

      await expect(
        commitCandidateTransition({ store, runId: "run-1", candidate: equalCandidate }),
      ).resolves.toEqual({
        kind: "invalid",
        commandId: equalCandidate.commandId,
        code: "transition-accepted-fact-missing",
      });
      expect(store.receipts).toHaveLength(0);
      expect(store.journals).toHaveLength(0);
      expect(store.records).toBe(0);
    },
  );

  it.each([
    [
      "graph",
      {
        graphId: "other.progression",
        nodes: [{ nodeId: "finish", status: "completed" as const }],
      },
      candidate("accepted").progressionTrace,
    ],
    [
      "node set",
      {
        graphId: "field.progression",
        nodes: [{ nodeId: "other", status: "completed" as const }],
      },
      [
        {
          sequence: 0,
          round: 0,
          source: "command",
          transitionId: "finish",
          nodeId: "other",
          from: "active",
          to: "completed",
        },
      ],
    ],
    ["unexplained status", candidate("accepted").nextProgression!, []],
  ] as const)(
    "rejects a progression %s mismatch against the durable snapshot",
    async (_, next, trace) => {
      const store = new MemoryStore();
      store.snapshot = currentSnapshot();
      const invalid = {
        ...candidate("accepted"),
        nextProgression: next,
        progressionTrace: trace,
      } satisfies CandidateTransition;

      await expect(
        commitCandidateTransition({ store, runId: "run-1", candidate: invalid }),
      ).resolves.toEqual({
        kind: "invalid",
        commandId: invalid.commandId,
        code: "transition-progression-snapshot-mismatch",
      });
      expect(store.receipts).toHaveLength(0);
    },
  );

  it("rolls back receipt, snapshot, journal, and links when the transaction faults", async () => {
    const store = new MemoryStore();
    store.snapshot = currentSnapshot();
    store.failDuringRecord = true;
    await expect(
      commitCandidateTransition({ store, runId: "run-1", candidate: candidate("accepted") }),
    ).rejects.toThrow("transaction-write-failed");
    expect(store.receipts).toHaveLength(0);
    expect(store.snapshot).toEqual(currentSnapshot());
    expect(store.journals).toHaveLength(0);
    expect(store.observationLinks).toHaveLength(0);
  });

  it("restores one exact durable result and rejects changed command reuse", async () => {
    const store = new MemoryStore();
    store.snapshot = currentSnapshot();
    store.loseAfterCommit = true;
    await expect(
      commitCandidateTransition({ store, runId: "run-1", candidate: candidate("accepted") }),
    ).rejects.toThrow("transition-result-delivery-lost");
    await expect(
      commitCandidateTransition({ store, runId: "run-1", candidate: candidate("accepted") }),
    ).resolves.toMatchObject({ disposition: "duplicate", resultingStateVersion: 1 });
    const changed = {
      ...candidate("accepted"),
      payload: { answer: "south" },
    } satisfies CandidateTransition;
    await expect(
      commitCandidateTransition({ store, runId: "run-1", candidate: changed }),
    ).resolves.toMatchObject({ kind: "invalid", code: "transition-command-reuse-conflict" });
    expect(store.records).toBe(1);
    expect(store.journals).toHaveLength(1);
  });

  it("returns one original receipt across one hundred duplicate deliveries", async () => {
    const store = new MemoryStore();
    store.snapshot = currentSnapshot();
    const results = [];
    for (let attempt = 0; attempt < 100; attempt += 1) {
      results.push(
        await commitCandidateTransition({
          store,
          runId: "run-1",
          candidate: candidate("accepted"),
        }),
      );
    }
    expect(results[0]).toMatchObject({ disposition: "committed", resultingStateVersion: 1 });
    expect(results.slice(1).every((result) => !("kind" in result))).toBe(true);
    expect(
      results.slice(1).every((result) => !("kind" in result) && result.disposition === "duplicate"),
    ).toBe(true);
    expect(store.records).toBe(1);
    expect(store.journals).toHaveLength(1);
  });

  it("performs no transaction or durable mutation across one hundred malformed host candidates", async () => {
    const store = new MemoryStore();
    store.snapshot = currentSnapshot();
    const snapshotBefore = store.snapshot;
    const invalidCandidate = {
      ...base,
      terminal: "accepted",
      outcome: { result: "not-a-durable-fact" },
      domainEvents: [],
      effectIntents: [],
      progressionTrace: [],
    } as CandidateTransition;

    const results = [];
    for (let attempt = 0; attempt < 100; attempt += 1) {
      results.push(
        await commitCandidateTransition({
          store,
          runId: "run-1",
          candidate: invalidCandidate,
        }),
      );
    }

    expect(results).toHaveLength(100);
    expect(
      results.every(
        (result) =>
          "kind" in result &&
          result.kind === "invalid" &&
          result.code === "transition-candidate-invalid",
      ),
    ).toBe(true);
    expect(store.transactions).toBe(0);
    expect(store.records).toBe(0);
    expect(store.receipts).toHaveLength(0);
    expect(store.observationLinks).toHaveLength(0);
    expect(store.journals).toHaveLength(0);
    expect(store.snapshot).toBe(snapshotBefore);
  });
});
