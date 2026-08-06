import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import {
  inspectGameRelease,
  openRelease,
  type CanonicalJsonObject,
  type LocalAggregateView,
} from "@plotpoint/protocol";
import { type ExecutableAggregateModel } from "@plotpoint/runtime";
import { afterEach, describe, expect, it, vi } from "vitest";

import { compileProject, validateProject } from "../../../packages/compiler/dist/index.js";
import { routeHostBridgeMessage } from "../src/bridge/host-bridge";
import { installReleaseFromDescriptor } from "../src/install/install-release";
import { PlayerDatabase } from "../src/persistence/database";
import { createGamePlayReport } from "../src/reports/create-game-play-report";
import { buildRuntimeBootstrap } from "../src/runtime/bootstrap";
import { deriveHostSupportFromManifest } from "../src/runtime/host-support";
import { createProductionHostBridgeHandlers } from "../src/runtime/production-handlers";
import { recoverRun, verifyRecoveryArtifact } from "../src/runtime/recovery";
import { playerRunLifecycleStore, selectReleaseRun } from "../src/runtime/run-lifecycle";
import {
  GeneratedRuntimeElement as TestElement,
  mountGeneratedWebRuntime,
} from "./helpers/generated-web-runtime";

const descriptorUrl = "http://127.0.0.1:4000/install.json";
const releaseUrl = "http://127.0.0.1:4000/field-puzzle.pprelease";
const artifactUri = "memory://installed/field-puzzle.pprelease";
const startedAt = "2020-01-01T00:00:00.000Z";

const sqliteMock = vi.hoisted(() => ({ database: null as unknown }));

vi.mock("expo-sqlite", () => ({
  openDatabaseAsync: vi.fn(async () => {
    if (sqliteMock.database === null) throw new Error("test-sqlite-database-missing");
    return sqliteMock.database;
  }),
}));

vi.mock("expo-location", () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: vi.fn(),
  getCurrentPositionAsync: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sqliteMock.database = null;
});

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

function sqlValues(parameters: readonly unknown[]): SQLInputValue[] {
  return parameters.map((value) => {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "bigint"
    ) {
      return value;
    }
    throw new Error("test-sql-parameter-invalid");
  });
}

class TestSqliteDatabase {
  constructor(readonly database = new DatabaseSync(":memory:")) {}

  async execAsync(query: string): Promise<void> {
    this.database.exec(query);
  }

  async runAsync(query: string, ...parameters: unknown[]): Promise<{ readonly changes: number }> {
    const result = this.database.prepare(query).run(...sqlValues(parameters)) as {
      readonly changes: number | bigint;
    };
    return { changes: Number(result.changes) };
  }

  async getAllAsync<T>(query: string, ...parameters: unknown[]): Promise<T[]> {
    return this.database.prepare(query).all(...sqlValues(parameters)) as T[];
  }

  async getFirstAsync<T>(query: string, ...parameters: unknown[]): Promise<T | null> {
    return (this.database.prepare(query).get(...sqlValues(parameters)) as T | undefined) ?? null;
  }

  async withExclusiveTransactionAsync(
    operation: (database: TestSqliteDatabase) => Promise<void>,
  ): Promise<void> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      await operation(this);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function importBundle(bytes: Uint8Array): Promise<Readonly<Record<string, unknown>>> {
  const url = `data:text/javascript,${encodeURIComponent(new TextDecoder().decode(bytes))}`;
  const imported: unknown = await import(url);
  if (!isRecord(imported)) throw new Error("compiled-module-invalid");
  return imported;
}

function isExecutableFieldModel(value: unknown): value is ExecutableAggregateModel<"player"> {
  return (
    isRecord(value) &&
    value.aggregateKind === "player" &&
    value.authority === "local" &&
    typeof value.modelId === "string" &&
    isRecord(value.stateSchema) &&
    typeof value.stateSchema.id === "string" &&
    typeof value.stateSchema.schemaDigest === "string" &&
    isRecord(value.initializationSchema) &&
    typeof value.initializationSchema.id === "string" &&
    typeof value.initializationSchema.schemaDigest === "string" &&
    isRecord(value.commandContracts) &&
    typeof value.initialize === "function" &&
    typeof value.execute === "function"
  );
}

function requireFieldModel(
  module: Readonly<Record<string, unknown>>,
): ExecutableAggregateModel<"player"> {
  const aggregateModels = module.aggregateModels;
  if (!isRecord(aggregateModels)) throw new Error("generated-runtime-adapter-missing");
  const model = aggregateModels["field.player"];
  if (!isExecutableFieldModel(model)) throw new Error("generated-field-model-invalid");
  return model;
}

function canonicalContent(bytes: Uint8Array): CanonicalJsonObject {
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!isRecord(value)) throw new Error("field-content-invalid");
  return value as CanonicalJsonObject;
}

function findByAction(root: TestElement, action: string): TestElement {
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.shift();
    if (current?.dataset.action === action) return current;
    if (current !== undefined) pending.push(...current.children);
  }
  throw new Error(`field-action-missing:${action}`);
}

async function waitForDataset(element: TestElement, key: string, expected: string): Promise<void> {
  for (let attempt = 0; attempt < 100 && element.dataset[key] !== expected; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  expect(
    element.dataset[key],
    JSON.stringify({
      dataset: element.dataset,
      children: element.children.map((child) => ({
        action: child.dataset.action,
        textContent: child.textContent,
      })),
    }),
  ).toBe(expected);
}

describe("installed field puzzle vertical journey", () => {
  it("compiles, installs, mounts, commits, recreates, recovers, and exports a generic report", async () => {
    const fileSystem = nodeFileSystem();
    const projectRoot = new URL("../../../examples/releases/field-puzzle/", import.meta.url)
      .pathname;
    const outputFile = `/tmp/plotpoint-field-puzzle-${globalThis.crypto.randomUUID()}.pprelease`;
    const sql = new TestSqliteDatabase();
    sqliteMock.database = sql;
    const artifacts = new Map<string, Uint8Array>();

    try {
      vi.stubGlobal("document", {
        createElement: () => new TestElement(),
      });
      const validation = await validateProject({ projectRoot });
      expect(validation.kind).toBe("valid");
      if (validation.kind !== "valid") {
        throw new Error(`field-validation-failed:${JSON.stringify(validation.diagnostics)}`);
      }

      const compilation = await compileProject({ projectRoot, outputFile });
      expect(compilation.kind).toBe("compiled");
      if (compilation.kind !== "compiled") {
        throw new Error(`field-compilation-failed:${JSON.stringify(compilation.diagnostics)}`);
      }
      const bytes = await fileSystem.readFile(outputFile);
      const opened = await openRelease(bytes);
      if (opened.kind !== "opened") {
        throw new Error(`field-release-open-failed:${JSON.stringify(opened.diagnostics)}`);
      }
      const inspection = await inspectGameRelease(bytes);
      if ("kind" in inspection) {
        throw new Error(`field-inspection-failed:${JSON.stringify(inspection.diagnostics)}`);
      }
      const database = await PlayerDatabase.open();
      const installed = await installReleaseFromDescriptor({
        descriptorUrl,
        support: deriveHostSupportFromManifest,
        transport: {
          fetchJson: async () => ({
            finalUrl: descriptorUrl,
            value: { releaseUrl, expectedReleaseId: compilation.releaseId },
          }),
          fetchBytes: async () => ({ finalUrl: releaseUrl, bytes }),
        },
        publisher: {
          publish: async ({ bytes: installedBytes, manifest }) => {
            artifacts.set(artifactUri, new Uint8Array(installedBytes));
            await database.publishRelease({
              releaseId: compilation.releaseId,
              artifactUri,
              manifestJson: JSON.stringify(manifest),
              installedAt: startedAt,
            });
          },
        },
      });
      expect(installed).toMatchObject({
        kind: "installed",
        descriptor: { expectedReleaseId: compilation.releaseId },
      });

      const logicEntry = opened.entries.find(
        ({ path }) => path === opened.manifest.entrypoints.logic,
      );
      const presentationEntry = opened.entries.find(
        ({ path }) => path === opened.manifest.entrypoints.presentation,
      );
      const contentPath = inspection.gameComposition.resources.find(
        ({ id, role }) => id === "field.game" && role === "content",
      )?.path;
      const contentEntry = opened.entries.find(({ path }) => path === contentPath);
      if (
        logicEntry === undefined ||
        presentationEntry === undefined ||
        contentEntry === undefined
      ) {
        throw new Error("compiled-field-entry-missing");
      }
      const model = requireFieldModel(await importBundle(logicEntry.bytes));
      expect(Object.keys(model.commandContracts)).toEqual(["advance"]);
      const content = canonicalContent(contentEntry.bytes);
      const runtimeHtml = buildRuntimeBootstrap({
        logicSource: new TextDecoder().decode(logicEntry.bytes),
        presentationSource: new TextDecoder().decode(presentationEntry.bytes),
        gameComposition: inspection.gameComposition,
        content: { "field.game": content },
        assets: {},
      });
      const initialized = model.initialize(content);
      expect(initialized.kind).toBe("initialized");
      if (initialized.kind !== "initialized") throw new Error("field-initialization-invalid");
      const initialView: LocalAggregateView = initialized.aggregate;
      const selected = await selectReleaseRun(
        playerRunLifecycleStore(database),
        compilation.releaseId,
        initialView,
        {
          createRunId: () => "field-puzzle-acceptance-run",
          now: () => startedAt,
        },
      );
      expect(selected.kind).toBe("created");
      const verifiedArtifact = await verifyRecoveryArtifact({
        bytes,
        expectedReleaseId: compilation.releaseId,
        manifestJson: JSON.stringify(opened.manifest),
      });
      if (verifiedArtifact.kind !== "valid") {
        throw new Error(`field-recovery-artifact-invalid:${verifiedArtifact.code}`);
      }
      const capturedLocations = [
        { latitude: 37.76942, longitude: -122.48621 },
        { latitude: 37.76815, longitude: -122.48372 },
      ];
      let captureIndex = 0;
      const handlers = createProductionHostBridgeHandlers({
        store: database,
        runtime: {
          bootstrap: {
            runId: selected.run.runId,
            releaseId: selected.run.releaseId,
            aggregate: initialView,
          },
          composition: inspection.gameComposition,
          aggregateSchemaId: model.stateSchema.id,
          validateSchema: verifiedArtifact.validateSchema,
          validateProgression: verifiedArtifact.validateProgression,
        },
        location: {
          database,
          runId: selected.run.runId,
          startedAt,
          adapter: {
            requestPermission: async () => "granted",
            capture: async () => {
              const location = capturedLocations[captureIndex];
              if (location === undefined) throw new Error("field-location-fixture-exhausted");
              captureIndex += 1;
              return {
                timestamp: Date.parse("2020-01-01T00:00:04.000Z"),
                ...location,
                horizontalAccuracy: 8,
              };
            },
          },
          now: () => new Date("2020-01-01T00:00:05.000Z"),
          createObservationId: () => `field-location-${captureIndex}`,
        },
      });

      const invalidCleanup: string[] = [];
      vi.stubGlobal("__plotpointInvalidCleanup", invalidCleanup);
      const invalidRuntimeHtml = buildRuntimeBootstrap({
        logicSource: new TextDecoder().decode(logicEntry.bytes),
        presentationSource: `
          export const components = Object.freeze({
            "field.puzzle": (context) => {
              context.lifecycle.defer(() => globalThis.__plotpointInvalidCleanup.push("first"));
              context.lifecycle.defer(() => globalThis.__plotpointInvalidCleanup.push("second"));
              return {};
            }
          });
          export const application = Object.freeze({
            mount({ components }) {
              components["field.puzzle"]();
              return Object.freeze({ unmount() {} });
            }
          });
        `,
        gameComposition: inspection.gameComposition,
        content: { "field.game": content },
        assets: {},
      });
      await expect(
        mountGeneratedWebRuntime(invalidRuntimeHtml, (message) =>
          routeHostBridgeMessage(message, handlers),
        ),
      ).rejects.toThrow("runtime-component-element-invalid:field.puzzle");
      expect(invalidCleanup).toEqual(["second", "first"]);

      const firstMount = await mountGeneratedWebRuntime(runtimeHtml, (message) =>
        routeHostBridgeMessage(message, handlers),
      );
      expect(firstMount.root.children).toHaveLength(1);
      const field = firstMount.root.children[0];
      if (field === undefined) throw new Error("field-component-missing");
      await waitForDataset(field, "stateVersion", "0");
      await findByAction(field, "check-in").dispatchEvent("click");
      await waitForDataset(field, "stateVersion", "1");
      const answer = findByAction(field, "answer");
      answer.value = "map";
      await findByAction(field, "solve").dispatchEvent("click");
      await waitForDataset(field, "stateVersion", "2");
      await findByAction(field, "check-in").dispatchEvent("click");
      await waitForDataset(field, "stateVersion", "3");
      expect(field.dataset.complete).toBe("true");
      await firstMount.unmount();
      expect(firstMount.root.children).toHaveLength(0);

      const recovered = await recoverRun(database, selected.run, {
        recordRestore: true,
        readArtifact: async (uri) => {
          const artifact = artifacts.get(uri);
          if (artifact === undefined) throw new Error("installed-artifact-missing");
          return new Uint8Array(artifact);
        },
      });
      expect(recovered).toMatchObject({
        runId: selected.run.runId,
        aggregate: {
          modelId: "field.player",
          schemaId: "field.player-state",
          stateVersion: 3,
          state: {
            visitedCheckpoints: ["first-checkpoint", "second-checkpoint"],
            puzzleSolved: true,
          },
        },
      });
      if (recovered === null || recovered.aggregate === null) {
        throw new Error("field-recovery-missing");
      }
      const recreatedHandlers = createProductionHostBridgeHandlers({
        store: database,
        runtime: {
          bootstrap: {
            runId: recovered.runId,
            releaseId: recovered.releaseId,
            aggregate: recovered.aggregate,
          },
          composition: inspection.gameComposition,
          aggregateSchemaId: model.stateSchema.id,
          validateSchema: verifiedArtifact.validateSchema,
          validateProgression: verifiedArtifact.validateProgression,
        },
        location: {
          database,
          runId: recovered.runId,
          startedAt,
          adapter: {
            requestPermission: async () => "granted",
            capture: async () => ({
              timestamp: Date.parse("2020-01-01T00:00:04.000Z"),
              latitude: 37.76942,
              longitude: -122.48621,
              horizontalAccuracy: 8,
            }),
          },
          now: () => new Date("2020-01-01T00:00:05.000Z"),
          createObservationId: () => "field-location-2",
        },
      });
      const recreatedMount = await mountGeneratedWebRuntime(runtimeHtml, (message) =>
        routeHostBridgeMessage(message, recreatedHandlers),
      );
      expect(recreatedMount.root.children).toHaveLength(1);
      const recreatedField = recreatedMount.root.children[0];
      if (recreatedField === undefined) throw new Error("recreated-field-component-missing");
      await waitForDataset(recreatedField, "stateVersion", "3");
      expect(recreatedField.dataset.complete).toBe("true");
      await recreatedMount.unmount();

      const journalColumns = (
        await database.raw().getAllAsync<{ name: string }>("PRAGMA table_info(journal)")
      ).map(({ name }) => name);
      expect(journalColumns).toContain("record_json");
      expect(journalColumns).not.toContain("progression_json");
      const report = await createGamePlayReport(database, selected.run.runId, "ios");
      expect(report).toMatchObject({
        releaseId: compilation.releaseId,
        platform: "ios",
        events: expect.arrayContaining([
          expect.objectContaining({ kind: "capability", disposition: "captured" }),
          expect.objectContaining({
            kind: "command",
            terminal: "accepted",
            resultingStateVersion: 3,
          }),
          expect.objectContaining({ kind: "recovery", disposition: "run-restored" }),
        ]),
      });
      expect(report.events.filter(({ kind }) => kind === "command")).toHaveLength(3);
      expect(
        report.events.filter(
          (event) => event.kind === "capability" && event.disposition === "captured",
        ),
      ).toHaveLength(2);
      expect(
        report.events.filter(
          (event) => event.kind === "capability" && event.disposition === "consumed",
        ),
      ).toHaveLength(2);
      expect(report).not.toHaveProperty("version");
      expect(report).not.toHaveProperty("runId");
      expect(JSON.stringify(report)).not.toMatch(
        /"(?:latitude|longitude|horizontalAccuracy|capturedAt|recordedAt|payload|state|progression|outcome|visitedCheckpoints|puzzleSolved|sessionId|participantId|teamId|serviceOrigin)"/,
      );
    } finally {
      sql.close();
      await fileSystem.rm(outputFile, { force: true });
    }
  });
});
