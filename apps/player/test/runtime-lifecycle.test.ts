import { describe, expect, it } from "vitest";

import { routeHostBridgeMessage } from "../src/bridge/host-bridge";
import {
  commitCandidateTransition,
  type TransitionStore,
  type TransitionTransaction,
} from "../src/persistence/commit-transition";
import type { CandidateTransition, DurableTransitionResult, SnapshotRecord } from "../src/model";
import { transitionResultFromDurable } from "../src/runtime/transition-result";

interface SerializedDatabase {
  readonly receipts: Map<string, string>;
  snapshot: string | null;
  records: number;
}

class ReloadedTransitionStore implements TransitionStore, TransitionTransaction {
  constructor(private readonly serialized: SerializedDatabase) {}

  async transaction<T>(operation: (transaction: TransitionTransaction) => Promise<T>): Promise<T> {
    return operation(this);
  }

  async getReceipt(_runId: string, commandId: string): Promise<DurableTransitionResult | null> {
    const value = this.serialized.receipts.get(commandId);
    return value === undefined ? null : (JSON.parse(value) as DurableTransitionResult);
  }

  async getSnapshot(): Promise<SnapshotRecord | null> {
    return this.serialized.snapshot === null
      ? null
      : (JSON.parse(this.serialized.snapshot) as SnapshotRecord);
  }

  async observationsExist(): Promise<boolean> {
    return true;
  }

  async record(runId: string, candidate: CandidateTransition): Promise<DurableTransitionResult> {
    if (candidate.commandOutcome !== "accepted") throw new Error("fixture-terminal-invalid");
    this.serialized.records += 1;
    const result = {
      kind: "accepted",
      commandId: candidate.commandId,
      commandOutcome: candidate.commandOutcome,
      aggregateId: candidate.aggregateId,
      aggregateKind: candidate.aggregateKind,
      schemaId: candidate.schemaId,
      schemaVersion: candidate.schemaVersion,
      expectedVersion: candidate.expectedVersion,
      resultingVersion: candidate.expectedVersion + 1,
      outcome: candidate.outcome,
      observationIds: candidate.observationIds,
    } satisfies DurableTransitionResult;
    this.serialized.receipts.set(candidate.commandId, JSON.stringify(result));
    this.serialized.snapshot = JSON.stringify({
      runId,
      aggregateId: candidate.aggregateId,
      aggregateKind: candidate.aggregateKind,
      schemaId: candidate.schemaId,
      schemaVersion: candidate.schemaVersion,
      stateVersion: candidate.expectedVersion + 1,
      state: candidate.nextState,
      journalPosition: 1,
    } satisfies SnapshotRecord);
    return result;
  }
}

describe("runtime view lifecycle", () => {
  it("redelivers the original durable result after view recreation", () => {
    const original = {
      kind: "accepted",
      commandId: "command-1",
      commandOutcome: "accepted",
      resultingVersion: 3,
      outcome: { result: "original-advanced" },
      observationIds: ["location-1"],
    } satisfies DurableTransitionResult;
    const duplicate = { ...original, kind: "duplicate" } satisfies DurableTransitionResult;

    expect(transitionResultFromDurable(original)).toEqual({
      commandId: "command-1",
      disposition: "committed",
      terminal: "accepted",
      resultingVersion: 3,
      outcome: { result: "original-advanced" },
    });
    expect(transitionResultFromDurable(duplicate)).toEqual({
      commandId: "command-1",
      disposition: "duplicate",
      terminal: "accepted",
      resultingVersion: 3,
      outcome: { result: "original-advanced" },
    });
  });

  it("redelivers durable non-changing and invalid terminals exactly", () => {
    expect(
      transitionResultFromDurable({
        kind: "duplicate",
        commandId: "command-rejected",
        commandOutcome: "rejected",
        resultingVersion: 3,
        outcome: { result: "outside" },
      }),
    ).toMatchObject({ terminal: "rejected", outcome: { result: "outside" } });
    expect(
      transitionResultFromDurable({
        kind: "duplicate",
        commandId: "command-invalid",
        commandOutcome: "invalid",
        resultingVersion: 3,
        diagnosticCodes: ["release-command-failed"],
      }),
    ).toMatchObject({ terminal: "invalid", diagnosticCodes: ["release-command-failed"] });
  });

  it("routes the serialized original result after database and view recreation", async () => {
    const serialized: SerializedDatabase = {
      receipts: new Map(),
      snapshot: null,
      records: 0,
    };
    const originalCandidate = {
      commandId: "command-reloaded",
      aggregateId: "player-1",
      aggregateKind: "player",
      schemaId: "field.player-state.v1",
      schemaVersion: 1,
      expectedVersion: 0,
      commandOutcome: "accepted",
      outcome: { result: "original-advanced" },
      nextState: { phase: "puzzle" },
      progressionChanges: ["puzzle"],
      observationIds: [],
    } satisfies CandidateTransition;
    await commitCandidateTransition({
      store: new ReloadedTransitionStore(serialized),
      runId: "run-1",
      candidate: originalCandidate,
    });

    const reloadedStore = new ReloadedTransitionStore(serialized);
    const response = await routeHostBridgeMessage(
      JSON.stringify({
        version: 1,
        requestId: "request-after-view-recreation",
        type: "transition.commit",
        payload: {
          candidate: {
            commandId: originalCandidate.commandId,
            target: {
              aggregateId: originalCandidate.aggregateId,
              aggregateKind: originalCandidate.aggregateKind,
              schemaId: originalCandidate.schemaId,
              schemaVersion: originalCandidate.schemaVersion,
            },
            expectedVersion: 0,
            terminal: "accepted",
            outcome: { result: "retry-payload-must-not-win" },
            nextState: { phase: "different" },
            progressionChanges: ["different"],
            observationIds: [],
          },
        },
      }),
      {
        runtimeReady: async () => {
          throw new Error("unexpected-runtime-ready");
        },
        requestCapability: async () => {
          throw new Error("unexpected-capability-request");
        },
        commitTransition: async (payload) => {
          if (payload.candidate.terminal !== "accepted") {
            throw new Error("fixture-terminal-invalid");
          }
          const result = await commitCandidateTransition({
            store: reloadedStore,
            runId: "run-1",
            candidate: {
              ...originalCandidate,
              outcome: payload.candidate.outcome,
              nextState: payload.candidate.nextState,
              progressionChanges: payload.candidate.progressionChanges,
            },
          });
          return transitionResultFromDurable(result);
        },
      },
    );

    expect(response).toMatchObject({
      type: "transition.result",
      payload: {
        disposition: "duplicate",
        outcome: { result: "original-advanced" },
        resultingVersion: 1,
      },
    });
    expect(serialized.records).toBe(1);
  });
});
