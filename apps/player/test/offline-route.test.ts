import { afterEach, describe, expect, it, vi } from "vitest";

import { FOREGROUND_LOCATION_CAPABILITY, openRelease } from "@plotpoint/protocol";
import type { ExecutableAggregateModel } from "@plotpoint/runtime";

import { compileProject } from "../../../packages/compiler/dist/index.js";

import { fieldGame } from "../../../examples/releases/field-puzzle/src/config";

import { createCapabilityDispatcher } from "../src/bridge/host-bridge";
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

afterEach(() => vi.restoreAllMocks());

interface TestFileSystem {
  readFile(path: string): Promise<Uint8Array>;
  rm(path: string, options: { readonly force: true }): Promise<void>;
}

function nodeFileSystem(): TestFileSystem {
  const runtime = globalThis as typeof globalThis & {
    readonly process?: {
      getBuiltinModule(name: "fs"): { readonly promises: TestFileSystem };
    };
  };
  const fileSystem = runtime.process?.getBuiltinModule("fs").promises;
  if (fileSystem === undefined) throw new Error("node-filesystem-unavailable");
  return fileSystem;
}

function isModule(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object";
}

async function importBundle(bytes: Uint8Array): Promise<Readonly<Record<string, unknown>>> {
  const url = `data:text/javascript,${encodeURIComponent(new TextDecoder().decode(bytes))}`;
  const imported: unknown = await import(url);
  if (!isModule(imported)) throw new Error("compiled-logic-module-invalid");
  return imported;
}

function requireGeneratedRuntimeAdapter(module: Readonly<Record<string, unknown>>) {
  const aggregateModels = module.aggregateModels;
  if (!isModule(aggregateModels)) throw new Error("generated-runtime-adapter-missing");
  return aggregateModels;
}

function isExecutableFieldModel(value: unknown): value is ExecutableAggregateModel<"player"> {
  return (
    isModule(value) &&
    value.aggregateKind === "player" &&
    value.authority === "local" &&
    typeof value.modelId === "string" &&
    isModule(value.stateSchema) &&
    typeof value.stateSchema.id === "string" &&
    typeof value.stateSchema.schemaDigest === "string" &&
    isModule(value.initializationSchema) &&
    typeof value.initializationSchema.id === "string" &&
    typeof value.initializationSchema.schemaDigest === "string" &&
    isModule(value.commandContracts) &&
    typeof value.initialize === "function" &&
    typeof value.execute === "function"
  );
}

function requireFieldModel(
  module: Readonly<Record<string, unknown>>,
): ExecutableAggregateModel<"player"> {
  const model = requireGeneratedRuntimeAdapter(module)["field.player"];
  if (!isExecutableFieldModel(model)) throw new Error("generated-field-model-invalid");
  return model;
}

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
  it("executes an observed action from the compiled generated runtime adapter without network", async () => {
    const fileSystem = nodeFileSystem();
    const projectRoot = new URL("../../../examples/releases/field-puzzle/", import.meta.url)
      .pathname;
    const outputFile = `/tmp/plotpoint-field-offline-${globalThis.crypto.randomUUID()}.pprelease`;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    try {
      const compilation = await compileProject({ projectRoot, outputFile });
      expect(compilation.kind).toBe("compiled");
      if (compilation.kind !== "compiled") {
        throw new Error(`field-compilation-failed:${JSON.stringify(compilation.diagnostics)}`);
      }

      const opened = await openRelease(await fileSystem.readFile(outputFile));
      expect(opened.kind).toBe("opened");
      if (opened.kind !== "opened") {
        throw new Error(`field-release-open-failed:${JSON.stringify(opened.diagnostics)}`);
      }
      const logicEntry = opened.entries.find(
        ({ path }) => path === opened.manifest.entrypoints.logic,
      );
      if (logicEntry === undefined) throw new Error("compiled-logic-entry-missing");
      const logicModule = await importBundle(logicEntry.bytes);
      expect(Object.keys(logicModule)).toEqual(["aggregateModels"]);

      const aggregateModels = requireGeneratedRuntimeAdapter(logicModule);
      expect(Object.keys(aggregateModels)).toEqual(["field.player"]);
      const model = requireFieldModel(logicModule);
      expect(Object.keys(model.commandContracts)).toEqual(["advance"]);

      const store = new ScriptedObservationStore();
      const dispatchCapability = createCapabilityDispatcher([
        foregroundLocationCapabilityRegistration({
          database: store,
          runId,
          startedAt,
          adapter: {
            requestPermission: async () => "granted",
            capture: async () => ({
              timestamp: Date.parse("2030-01-01T00:00:04.000Z"),
              latitude: fieldGame.firstCheckpoint.latitude,
              longitude: fieldGame.firstCheckpoint.longitude,
              horizontalAccuracy: 8,
            }),
          },
          now: () => new Date("2030-01-01T00:00:05.000Z"),
          createObservationId: () => "offline-observation",
        }),
      ]);
      const captured = await dispatchCapability({
        capability: FOREGROUND_LOCATION_CAPABILITY,
        input: {},
      });
      const initialized = model.initialize(fieldGame);
      expect(initialized.kind).toBe("initialized");
      if (initialized.kind !== "initialized") throw new Error("field-initialization-invalid");
      const result = model.execute({
        aggregate: initialized.aggregate,
        command: {
          id: "offline-check-in",
          type: "advance",
          target: { kind: "player", id: initialized.aggregate.aggregateId },
          expectedStateVersion: 0,
          payload: { action: "check-in" },
        },
        observations: [{ kind: "location.foreground", key: "current", value: captured.output }],
      });

      expect(result).toMatchObject({
        kind: "recorded",
        aggregate: {
          stateVersion: 1,
          state: { visitedCheckpoints: ["first-checkpoint"], puzzleSolved: false },
        },
        record: {
          definitionId: "field.advance",
          terminal: "accepted",
          observationTrace: [{ kind: "location.foreground", key: "current" }],
        },
      });
      expect(store.events).toEqual(["persisted:offline-observation"]);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      await fileSystem.rm(outputFile, { force: true });
    }
  });
});
