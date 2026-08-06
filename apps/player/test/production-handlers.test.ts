import { describe, expect, it, vi } from "vitest";

import {
  FOREGROUND_LOCATION_CAPABILITY,
  type CanonicalJsonObject,
  type GameComposition,
  type RuntimeBootstrap,
  type TransitionCandidate,
} from "@plotpoint/protocol";

import { routeHostBridgeMessage } from "../src/bridge/host-bridge";
import type { ForegroundLocationPersistence } from "../src/location/foreground-location";
import type {
  CandidateTransition,
  DurableCommandRecord,
  DurableTransitionResult,
  SnapshotRecord,
} from "../src/model";
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
  aggregateId: "player-1",
  aggregateKind: "player" as const,
  schemaId: "local-state",
};
const bootstrap: RuntimeBootstrap = {
  runId,
  releaseId,
  aggregate: {
    modelId: "local-model",
    ...target,
    stateVersion: 0,
    state: { count: 0 },
  },
};

function composition(locationCapability: boolean): GameComposition {
  return {
    application: { components: ["panel"] },
    aggregateModels: [
      {
        id: "local-model",
        authority: "local",
        kind: "player",
        stateSchema: { id: "local-state" },
        initializationSchema: { id: "local-initialization" },
        events: [],
        effects: [],
      },
    ],
    commands: [
      {
        id: "local-action",
        type: "local.action",
        aggregateModel: "local-model",
        payloadSchema: { id: "local-action-payload" },
        outcomeSchema: { id: "local-action-outcome" },
        execution: "local",
      },
    ],
    progressions: [],
    components: [
      {
        id: "panel",
        commands: ["local-action"],
        content: [],
        assets: [],
        capabilities: locationCapability
          ? [{ id: FOREGROUND_LOCATION_CAPABILITY.id, major: 1, minimumMinor: 0 }]
          : [],
      },
    ],
    resources: [],
  };
}

class MemoryTransitionStore implements TransitionStore, TransitionTransaction {
  readonly receipts = new Map<string, DurableCommandRecord>();
  snapshot: SnapshotRecord | null = null;

  async transaction<T>(operation: (transaction: TransitionTransaction) => Promise<T>): Promise<T> {
    return operation(this);
  }

  async getReceipt(_runId: string, commandId: string): Promise<DurableCommandRecord | null> {
    return this.receipts.get(commandId) ?? null;
  }

  async getSnapshot(): Promise<SnapshotRecord | null> {
    return this.snapshot;
  }

  async observationsExist(): Promise<boolean> {
    return true;
  }

  async record(run: string, candidate: CandidateTransition): Promise<DurableTransitionResult> {
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
    this.receipts.set(candidate.commandId, { candidate, result });
    if (candidate.terminal === "accepted") {
      this.snapshot = {
        runId: run,
        modelId: candidate.modelId,
        aggregateId: candidate.target.aggregateId,
        aggregateKind: "player",
        schemaId: candidate.target.schemaId,
        stateVersion: resultingStateVersion,
        state: candidate.nextState ?? { count: 0 },
        journalPosition: 1,
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

function request(candidate: TransitionCandidate): string {
  return JSON.stringify({
    version: 1,
    requestId: `${candidate.commandId}-request`,
    type: "transition.commit",
    payload: { candidate },
  });
}

function candidate(
  commandId: string,
  terminal: TransitionCandidate["terminal"],
): TransitionCandidate {
  const base = {
    commandId,
    modelId: "local-model",
    commandType: "local.action",
    payload: { amount: 1 },
    target,
    expectedStateVersion: commandId === "accepted-command" ? 0 : 1,
    observationIds: [],
  };
  if (terminal === "accepted") {
    return {
      ...base,
      terminal,
      nextState: { count: 1 },
      outcome: { result: "advanced" },
      domainEvents: [],
      effectIntents: [],
      progressionTrace: [],
    };
  }
  if (terminal === "invalid") {
    return {
      ...base,
      terminal,
      phase: "execution",
      diagnosticCodes: ["command-input-invalid"],
      attemptedProgressionTrace: [],
    };
  }
  return { ...base, terminal, outcome: { result: terminal } };
}

function productionHandlers(
  store: TransitionStore,
  observations: ForegroundLocationPersistence = new MemoryObservationStore(),
  gameComposition: GameComposition = composition(true),
) {
  return createProductionHostBridgeHandlers({
    store,
    runtime: {
      bootstrap,
      composition: gameComposition,
      aggregateSchemaId: target.schemaId,
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
  it("durably commits each declared local terminal and rejects undeclared authority", async () => {
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
    expect(store.receipts).toHaveLength(4);

    const duplicate = await routeHostBridgeMessage(
      request(candidate("no-op-command", "no-op")),
      handlers,
    );
    expect(duplicate).toMatchObject({
      type: "transition.result",
      payload: { commandId: "no-op-command", disposition: "duplicate", terminal: "no-op" },
    });

    const undeclared = {
      ...candidate("undeclared-command", "no-op"),
      commandType: "author.selected.type",
    } satisfies TransitionCandidate;
    await expect(routeHostBridgeMessage(request(undeclared), handlers)).resolves.toMatchObject({
      type: "host.error",
      payload: { code: "transition-command-mismatch" },
    });
    expect(store.receipts).toHaveLength(4);
  });

  it("registers native capabilities only when Game Composition declares them", async () => {
    const observations = new MemoryObservationStore();
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

    const declared = productionHandlers(new MemoryTransitionStore(), observations);
    await expect(
      routeHostBridgeMessage(
        capabilityRequest("declared", FOREGROUND_LOCATION_CAPABILITY, {}),
        declared,
      ),
    ).resolves.toMatchObject({
      type: "capability.result",
      payload: {
        capability: FOREGROUND_LOCATION_CAPABILITY,
        output: { observationId: "production-observation", availability: "permission-denied" },
      },
    });
    expect(observations.records).toHaveLength(1);

    const localOnly = productionHandlers(
      new MemoryTransitionStore(),
      observations,
      composition(false),
    );
    await expect(
      routeHostBridgeMessage(
        capabilityRequest("undeclared", FOREGROUND_LOCATION_CAPABILITY, {}),
        localOnly,
      ),
    ).resolves.toMatchObject({
      requestId: "undeclared",
      type: "host.error",
      payload: { code: "capability-unsupported" },
    });
    expect(observations.records).toHaveLength(1);
  });
});
