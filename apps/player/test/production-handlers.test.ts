import { describe, expect, it, vi } from "vitest";

import {
  FOREGROUND_LOCATION_CAPABILITY,
  type CanonicalJsonObject,
  type RuntimeBootstrapV1,
  type TransitionCandidateV1,
} from "@plotpoint/protocol";

import { routeHostBridgeMessage } from "../src/bridge/host-bridge";
import type { ForegroundLocationPersistence } from "../src/location/foreground-location";
import type { CandidateTransition, DurableTransitionResult, SnapshotRecord } from "../src/model";
import type { TransitionStore, TransitionTransaction } from "../src/persistence/commit-transition";
import { createProductionHostBridgeHandlers } from "../src/runtime/production-handlers";

vi.mock("expo-location", () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: vi.fn(),
  getCurrentPositionAsync: vi.fn(),
}));

const runId = "production-handler-run";
const releaseId = `sha256:${"a".repeat(64)}` as const;
const target = {
  aggregateId: "field-player",
  aggregateKind: "player" as const,
  schemaId: "field.player-state.v1",
  schemaVersion: 1,
};
const bootstrap: RuntimeBootstrapV1 = {
  runId,
  releaseId,
  aggregate: null,
};

class MemoryTransitionStore implements TransitionStore, TransitionTransaction {
  readonly receipts = new Map<string, DurableTransitionResult>();
  snapshot: SnapshotRecord | null = null;

  async transaction<T>(operation: (transaction: TransitionTransaction) => Promise<T>): Promise<T> {
    return operation(this);
  }

  async getReceipt(_runId: string, commandId: string): Promise<DurableTransitionResult | null> {
    return this.receipts.get(commandId) ?? null;
  }

  async getSnapshot(): Promise<SnapshotRecord | null> {
    return this.snapshot;
  }

  async observationsExist(): Promise<boolean> {
    return true;
  }

  async record(_runId: string, candidate: CandidateTransition): Promise<DurableTransitionResult> {
    const resultingVersion =
      candidate.commandOutcome === "accepted"
        ? candidate.expectedVersion + 1
        : candidate.expectedVersion;
    const result: DurableTransitionResult = {
      kind: "accepted",
      commandId: candidate.commandId,
      commandOutcome: candidate.commandOutcome,
      aggregateId: candidate.aggregateId,
      aggregateKind: candidate.aggregateKind,
      schemaId: candidate.schemaId,
      schemaVersion: candidate.schemaVersion,
      expectedVersion: candidate.expectedVersion,
      resultingVersion,
      ...(candidate.commandOutcome === "invalid"
        ? { diagnosticCodes: candidate.diagnosticCodes }
        : { outcome: candidate.outcome }),
      observationIds: candidate.observationIds,
    };
    this.receipts.set(candidate.commandId, result);
    if (candidate.commandOutcome === "accepted") {
      this.snapshot = {
        runId,
        aggregateId: candidate.aggregateId,
        aggregateKind: candidate.aggregateKind,
        schemaId: candidate.schemaId,
        schemaVersion: candidate.schemaVersion,
        stateVersion: resultingVersion,
        state: candidate.nextState,
        journalPosition: resultingVersion,
      };
    }
    return result;
  }
}

class MemoryObservationStore implements ForegroundLocationPersistence {
  readonly records: Array<Parameters<ForegroundLocationPersistence["recordObservation"]>[0]> = [];

  async recordObservation(
    input: Parameters<ForegroundLocationPersistence["recordObservation"]>[0],
  ): Promise<void> {
    this.records.push(input);
  }
}

function request(candidate: TransitionCandidateV1): string {
  return JSON.stringify({
    version: 1,
    requestId: `${candidate.commandId}-request`,
    type: "transition.commit",
    payload: { candidate },
  });
}

function candidate(
  commandId: string,
  terminal: TransitionCandidateV1["terminal"],
): TransitionCandidateV1 {
  const base = {
    commandId,
    target,
    expectedVersion: commandId === "accepted-command" ? 0 : 1,
    observationIds: [],
  };
  if (terminal === "accepted") {
    return {
      ...base,
      terminal,
      nextState: { phase: "started" },
      outcome: { result: "advanced" },
      progressionChanges: ["started"],
    };
  }
  if (terminal === "invalid") {
    return { ...base, terminal, diagnosticCodes: ["command-input-invalid"] };
  }
  return { ...base, terminal, outcome: { result: terminal } };
}

function productionHandlers(
  store: TransitionStore,
  observations: ForegroundLocationPersistence = new MemoryObservationStore(),
) {
  return createProductionHostBridgeHandlers({
    store,
    runtime: {
      bootstrap,
      aggregateSchemaId: target.schemaId,
      aggregateSchemaVersion: target.schemaVersion,
      validateAggregate: () => true,
    },
    location: {
      database: observations,
      runId,
      startedAt: "2030-01-01T00:00:00.000Z",
      adapter: {
        requestPermission: async () => "denied",
        capture: async () => null,
      },
      now: () => new Date("2030-01-01T00:00:05.000Z"),
      createObservationId: () => "production-observation",
    },
  });
}

describe("production host bridge handlers", () => {
  it("durably commits every terminal and returns the original terminal result", async () => {
    const store = new MemoryTransitionStore();
    const handlers = productionHandlers(store);

    for (const [commandId, terminal] of [
      ["accepted-command", "accepted"],
      ["no-op-command", "no-op"],
      ["rejected-command", "rejected"],
      ["invalid-command", "invalid"],
    ] as const) {
      const response = await routeHostBridgeMessage(
        request(candidate(commandId, terminal)),
        handlers,
      );
      expect(response).toMatchObject({
        type: "transition.result",
        payload: { commandId, disposition: "committed", terminal },
      });
    }

    expect(store.receipts.size).toBe(4);
    expect([...store.receipts.values()].map(({ commandOutcome }) => commandOutcome)).toEqual([
      "accepted",
      "no-op",
      "rejected",
      "invalid",
    ]);

    const duplicate = await routeHostBridgeMessage(
      request(candidate("no-op-command", "no-op")),
      handlers,
    );
    expect(duplicate).toMatchObject({
      type: "transition.result",
      payload: {
        commandId: "no-op-command",
        disposition: "duplicate",
        terminal: "no-op",
        outcome: { result: "no-op" },
      },
    });
  });

  it("uses the generic capability dispatcher for validation and invocation", async () => {
    const observations = new MemoryObservationStore();
    const handlers = productionHandlers(new MemoryTransitionStore(), observations);
    const capabilityRequest = (
      requestId: string,
      capability: CanonicalJsonObject,
      input: CanonicalJsonObject,
    ) =>
      JSON.stringify({
        version: 1,
        requestId,
        type: "capability.request",
        payload: { capability, input },
      });

    const valid = await routeHostBridgeMessage(
      capabilityRequest("valid", FOREGROUND_LOCATION_CAPABILITY, {}),
      handlers,
    );
    expect(valid).toMatchObject({
      type: "capability.result",
      payload: {
        capability: FOREGROUND_LOCATION_CAPABILITY,
        output: { observationId: "production-observation", availability: "permission-denied" },
      },
    });
    expect(observations.records).toHaveLength(1);

    const invalidInput = await routeHostBridgeMessage(
      capabilityRequest("invalid-input", FOREGROUND_LOCATION_CAPABILITY, { unexpected: true }),
      handlers,
    );
    expect(invalidInput).toMatchObject({
      type: "host.error",
      payload: { code: "capability-input-invalid" },
    });

    const unsupported = await routeHostBridgeMessage(
      capabilityRequest("unsupported", { ...FOREGROUND_LOCATION_CAPABILITY, major: 2 }, {}),
      handlers,
    );
    expect(unsupported).toMatchObject({
      type: "host.error",
      payload: { code: "capability-unsupported" },
    });
    expect(observations.records).toHaveLength(1);
  });
});
