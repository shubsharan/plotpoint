import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FOREGROUND_LOCATION_CAPABILITY,
  type CanonicalJsonObject,
  type RuntimeBootstrapV1,
  type TransitionCommitEnvelopeV1,
  type TransitionResultV1,
} from "@plotpoint/protocol";

import {
  createCapabilityDispatcher,
  routeHostBridgeMessage,
  type HostBridgeHandlers,
} from "../src/bridge/host-bridge";
import {
  captureForegroundLocation,
  foregroundLocationCapabilityRegistration,
  type ForegroundLocationNativeAdapter,
  type ForegroundLocationPersistence,
} from "../src/location/foreground-location";

vi.mock("expo-location", () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: vi.fn(),
  getCurrentPositionAsync: vi.fn(),
}));

const runId = "offline-route-run";
const startedAt = "2030-01-01T00:00:00.000Z";
const releaseId = `sha256:${"a".repeat(64)}` as const;

afterEach(() => vi.restoreAllMocks());

class ScriptedObservationStore implements ForegroundLocationPersistence {
  readonly observations = new Set<string>();
  readonly events: string[] = [];
  readonly records: Array<Parameters<ForegroundLocationPersistence["recordObservation"]>[0]> = [];

  async recordObservation(
    input: Parameters<ForegroundLocationPersistence["recordObservation"]>[0],
  ): Promise<void> {
    this.observations.add(input.observationId);
    this.records.push(input);
    this.events.push(`persisted:${input.observationId}`);
  }
}

function capabilityRequest(requestId: string, input: CanonicalJsonObject = {}) {
  return JSON.stringify({
    version: 1,
    requestId,
    type: "capability.request",
    payload: { capability: FOREGROUND_LOCATION_CAPABILITY, input },
  });
}

describe("foreground location capability", () => {
  it.each([
    {
      name: "available",
      adapter: {
        requestPermission: async () => "granted" as const,
        capture: async () => ({
          timestamp: Date.parse("2030-01-01T00:00:04.000Z"),
          latitude: 37.76942,
          longitude: -122.48621,
          horizontalAccuracy: 8,
        }),
      } satisfies ForegroundLocationNativeAdapter,
      availability: "available",
    },
    {
      name: "permission-denied",
      adapter: {
        requestPermission: async () => "denied" as const,
        capture: async () => null,
      } satisfies ForegroundLocationNativeAdapter,
      availability: "permission-denied",
    },
    {
      name: "unavailable",
      adapter: {
        requestPermission: async () => "granted" as const,
        capture: async () => null,
      } satisfies ForegroundLocationNativeAdapter,
      availability: "unavailable",
    },
    {
      name: "failed",
      adapter: {
        requestPermission: async () => "granted" as const,
        capture: async () => {
          throw new Error("scripted-native-failure");
        },
      } satisfies ForegroundLocationNativeAdapter,
      availability: "failed",
    },
  ])("persists $name before delivering it", async ({ adapter, availability }) => {
    const store = new ScriptedObservationStore();
    const observation = await captureForegroundLocation({
      database: store,
      runId,
      startedAt,
      adapter,
      now: () => new Date("2030-01-01T00:00:05.000Z"),
      createObservationId: () => `observation-${availability}`,
    });

    expect(observation.availability).toBe(availability);
    expect(store.events).toEqual([`persisted:${observation.observationId}`]);
    expect(store.records[0]).toMatchObject({
      observationId: observation.observationId,
      recordedAt: "2030-01-01T00:00:05.000Z",
      availability,
    });
    if (observation.availability === "available") {
      expect(store.records[0]).toMatchObject({
        capturedAt: "2030-01-01T00:00:04.000Z",
        ageMs: 1_000,
        horizontalAccuracy: 8,
      });
    } else if (observation.availability === "failed") {
      expect(store.records[0]).toMatchObject({ diagnosticCode: "location-capture-failed" });
    } else {
      expect(store.records[0]?.capturedAt).toBeUndefined();
      expect(store.records[0]?.ageMs).toBeUndefined();
    }
  });

  it("rejects nonempty input before invoking the native adapter", async () => {
    const store = new ScriptedObservationStore();
    const adapter: ForegroundLocationNativeAdapter = {
      requestPermission: vi.fn(async () => "granted" as const),
      capture: vi.fn(async () => null),
    };
    const dispatch = createCapabilityDispatcher([
      foregroundLocationCapabilityRegistration({
        database: store,
        runId,
        startedAt,
        adapter,
      }),
    ]);

    await expect(
      dispatch({ capability: FOREGROUND_LOCATION_CAPABILITY, input: { unexpected: true } }),
    ).rejects.toThrow("capability-input-invalid");
    expect(adapter.requestPermission).not.toHaveBeenCalled();
    expect(store.observations.size).toBe(0);
  });
});

describe("disconnected trusted-host route", () => {
  it("boots, visits two checkpoints, solves the puzzle, and completes without network access", async () => {
    const store = new ScriptedObservationStore();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const locations = [
      { latitude: 37.76942, longitude: -122.48621 },
      { latitude: 37.76815, longitude: -122.48372 },
    ];
    let locationIndex = 0;
    let observationIndex = 0;
    const adapter: ForegroundLocationNativeAdapter = {
      requestPermission: async () => "granted",
      capture: async () => {
        const location = locations[locationIndex++];
        if (location === undefined) throw new Error("scripted-location-exhausted");
        return {
          timestamp: Date.parse("2030-01-01T00:00:04.000Z") + locationIndex * 1_000,
          ...location,
          horizontalAccuracy: 8,
        };
      },
    };
    const dispatchCapability = createCapabilityDispatcher([
      foregroundLocationCapabilityRegistration({
        database: store,
        runId,
        startedAt,
        adapter,
        now: () => new Date("2030-01-01T00:00:10.000Z"),
        createObservationId: () => `route-observation-${++observationIndex}`,
      }),
    ]);

    let state: CanonicalJsonObject = { attempts: 0, phase: "first-checkpoint" };
    let stateVersion = 0;
    const bootstrap: RuntimeBootstrapV1 = {
      runId,
      releaseId,
      aggregate: {
        aggregateId: "field-player",
        aggregateKind: "player",
        schemaId: "field.player-state.v1",
        schemaVersion: 1,
        stateVersion,
        state,
      },
    };
    const handlers: HostBridgeHandlers = {
      runtimeReady: async () => bootstrap,
      requestCapability: dispatchCapability,
      commitTransition: async (payload) => {
        const candidate = payload.candidate;
        expect(candidate.expectedVersion).toBe(stateVersion);
        expect(candidate.observationIds.every((id) => store.observations.has(id))).toBe(true);
        if (candidate.terminal !== "accepted") throw new Error("route-candidate-not-accepted");
        state = candidate.nextState;
        stateVersion += 1;
        return {
          commandId: candidate.commandId,
          disposition: "committed",
          terminal: "accepted",
          resultingVersion: stateVersion,
          outcome: candidate.outcome,
        };
      },
    };

    const ready = await routeHostBridgeMessage(
      JSON.stringify({ version: 1, requestId: "ready", type: "runtime.ready", payload: {} }),
      handlers,
    );
    expect(ready).toMatchObject({ type: "runtime.bootstrap", payload: { aggregate: { state } } });

    async function observe(requestId: string) {
      const response = await routeHostBridgeMessage(capabilityRequest(requestId), handlers);
      expect(response.type).toBe("capability.result");
      if (response.type !== "capability.result") throw new Error("route-location-failed");
      return response.payload.output;
    }

    async function commit(input: {
      commandId: string;
      nextState: CanonicalJsonObject;
      observationId?: string;
    }): Promise<TransitionResultV1> {
      const request: TransitionCommitEnvelopeV1 = {
        version: 1,
        requestId: `${input.commandId}-request`,
        type: "transition.commit",
        payload: {
          candidate: {
            commandId: input.commandId,
            target: {
              aggregateId: "field-player",
              aggregateKind: "player",
              schemaId: "field.player-state.v1",
              schemaVersion: 1,
            },
            expectedVersion: stateVersion,
            observationIds: input.observationId === undefined ? [] : [input.observationId],
            terminal: "accepted",
            nextState: input.nextState,
            outcome: { result: "advanced" },
            progressionChanges: [String(input.nextState.phase)],
          },
        },
      };
      const response = await routeHostBridgeMessage(JSON.stringify(request), handlers);
      expect(response.type).toBe("transition.result");
      if (response.type !== "transition.result") throw new Error("route-transition-failed");
      return response.payload;
    }

    const first = await observe("first-checkpoint-location");
    expect(store.events.at(-1)).toBe(`persisted:${String(first.observationId)}`);
    await commit({
      commandId: "reach-first-checkpoint",
      nextState: { attempts: 0, phase: "puzzle" },
      observationId: String(first.observationId),
    });
    await commit({
      commandId: "solve-puzzle",
      nextState: { attempts: 1, phase: "second-checkpoint" },
    });
    const second = await observe("second-checkpoint-location");
    expect(store.events.at(-1)).toBe(`persisted:${String(second.observationId)}`);
    await commit({
      commandId: "reach-second-checkpoint",
      nextState: { attempts: 1, phase: "complete" },
      observationId: String(second.observationId),
    });

    expect(state).toEqual({ attempts: 1, phase: "complete" });
    expect(stateVersion).toBe(3);
    expect(store.observations).toEqual(new Set(["route-observation-1", "route-observation-2"]));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
