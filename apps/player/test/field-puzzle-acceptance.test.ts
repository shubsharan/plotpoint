import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import {
  FOREGROUND_LOCATION_CAPABILITY,
  inspectGameRelease,
  openRelease,
  type CanonicalJsonObject,
  type GameComposition,
  type LocalAggregateView,
  type TransitionCandidate,
  type TypedRecord,
} from "@plotpoint/protocol";
import {
  type Aggregate,
  type ExecutableAggregateModel,
  type ExecutionResult,
  type JsonObject,
  type Observation,
} from "@plotpoint/runtime";
import { afterEach, describe, expect, it, vi } from "vitest";

import { compileProject, validateProject } from "../../../packages/compiler/dist/index.js";
import { installReleaseFromDescriptor } from "../src/install/install-release";
import { PlayerDatabase } from "../src/persistence/database";
import { createPlayReport } from "../src/reports/create-play-report";
import { mountGameComposition, type ComponentImplementation } from "../src/runtime/composition";
import {
  createLocalModelAdapter,
  type HostObservationReference,
  type LocalCommandBinding,
} from "../src/runtime/local-model-adapter";
import { deriveHostSupportFromManifest } from "../src/runtime/host-support";
import { createProductionHostBridgeHandlers } from "../src/runtime/production-handlers";
import { recoverRun, verifyRecoveryArtifact } from "../src/runtime/recovery";
import { playerRunLifecycleStore, selectReleaseRun } from "../src/runtime/run-lifecycle";

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

interface GeneratedPresentation {
  readonly application: unknown;
  readonly components: Readonly<Record<string, ComponentImplementation>>;
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

function requirePresentation(module: Readonly<Record<string, unknown>>): GeneratedPresentation {
  if (!isRecord(module.components)) throw new Error("generated-component-registry-missing");
  return {
    application: module.application,
    components: module.components as Readonly<Record<string, ComponentImplementation>>,
  };
}

function canonicalContent(bytes: Uint8Array): CanonicalJsonObject {
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!isRecord(value)) throw new Error("field-content-invalid");
  return value as CanonicalJsonObject;
}

function typedRecords(records: readonly JsonObject[] | undefined): readonly TypedRecord[] {
  return (records ?? []).map((record) => {
    if (typeof record.type !== "string") throw new Error("runtime-record-type-invalid");
    return { ...record, type: record.type };
  });
}

function runtimeObservations(
  observations: readonly HostObservationReference[],
): readonly Observation[] {
  return observations.map((observation) => {
    const kind = observation.kind;
    const key = observation.key;
    const value = observation.value;
    if (typeof kind !== "string" || typeof key !== "string" || value === undefined) {
      throw new Error("runtime-observation-reference-invalid");
    }
    return { kind, key, value } as Observation;
  });
}

function candidateFromExecution(
  result: ExecutionResult<JsonObject, JsonObject, JsonObject, "player">,
  observationIds: readonly string[],
): TransitionCandidate | null {
  if (result.kind === "preflight-invalid") return null;
  const record = result.record;
  const base = {
    commandId: record.command.id,
    modelId: record.aggregateBefore.modelId,
    commandType: record.command.type,
    payload: record.command.payload,
    target: {
      aggregateId: record.aggregateBefore.aggregateId,
      aggregateKind: record.aggregateBefore.aggregateKind,
      schemaId: record.aggregateBefore.schemaId,
    },
    expectedStateVersion: record.aggregateBefore.stateVersion,
    observationIds,
  } as const;
  if (record.terminal === "invalid") {
    return {
      ...base,
      terminal: "invalid",
      phase: "execution",
      diagnosticCodes: record.diagnostics.map(({ code }) => code),
      attemptedProgressionTrace: record.progressionTrace.map((entry) => ({ ...entry })),
    };
  }
  if (record.outcome === undefined) throw new Error("runtime-outcome-missing");
  if (record.terminal === "no-op" || record.terminal === "rejected") {
    return { ...base, terminal: record.terminal, outcome: record.outcome };
  }
  if (record.aggregateAfter === undefined) throw new Error("runtime-aggregate-after-missing");
  return {
    ...base,
    terminal: "accepted",
    nextState: record.aggregateAfter.state,
    ...(record.aggregateAfter.progression === undefined
      ? {}
      : { nextProgression: record.aggregateAfter.progression }),
    outcome: record.outcome,
    domainEvents: typedRecords(record.domainEvents),
    effectIntents: typedRecords(record.effectIntents),
    progressionTrace: record.progressionTrace.map((entry) => ({ ...entry })),
  };
}

function fieldBinding(model: ExecutableAggregateModel<"player">): LocalCommandBinding {
  if (model.commandContracts.advance === undefined) {
    throw new Error("generated-field-command-missing");
  }
  return {
    prepare({ view, commandId, payload, observations }) {
      const aggregate: Aggregate<JsonObject, "player"> = {
        aggregateId: view.aggregateId,
        modelId: view.modelId,
        aggregateKind: "player",
        schemaId: view.schemaId,
        stateVersion: view.stateVersion,
        state: view.state,
        ...(view.progression === undefined ? {} : { progression: view.progression }),
      };
      const result = model.execute({
        aggregate,
        command: {
          id: commandId,
          type: "advance",
          target: { kind: "player", id: view.aggregateId },
          expectedStateVersion: view.stateVersion,
          payload,
        },
        observations: runtimeObservations(observations),
      });
      const candidate = candidateFromExecution(
        result,
        observations.map(({ observationId }) => observationId),
      );
      return (
        candidate ?? {
          commandId,
          disposition: "not-recorded",
          terminal: "invalid",
          phase: "preflight",
          diagnosticCodes:
            result.kind === "preflight-invalid"
              ? result.diagnostics.map(({ code }) => code)
              : ["runtime-preflight-invalid"],
        }
      );
    },
  };
}

class TestElement {
  readonly dataset: Record<string, string> = {};
  readonly children: TestElement[] = [];
  textContent: string | null = null;
  parent: TestElement | null = null;

  append(...children: TestElement[]): void {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children: TestElement[]): void {
    for (const child of this.children) child.parent = null;
    this.children.splice(0, this.children.length, ...children);
    for (const child of children) child.parent = this;
  }

  remove(): void {
    if (this.parent === null) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = null;
  }
}

async function mountGeneratedApplication(input: {
  readonly composition: GameComposition;
  readonly presentation: GeneratedPresentation;
  readonly local: ReturnType<typeof createLocalModelAdapter>;
  readonly content: CanonicalJsonObject;
  readonly requestCapability: (input: object) => Promise<object>;
}) {
  const root = new TestElement();
  const handle = await mountGameComposition({
    root: root as unknown as HTMLElement,
    composition: input.composition,
    application: input.presentation.application,
    components: input.presentation.components,
    providers: {
      local: input.local,
      content: { "field.game": input.content },
      assets: {},
      capabilities: {
        [FOREGROUND_LOCATION_CAPABILITY.id]: { request: input.requestCapability },
      },
    },
    isElement: (value): value is HTMLElement => value instanceof TestElement,
  });
  return { handle, root };
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
      const presentation = requirePresentation(await importBundle(presentationEntry.bytes));
      const content = canonicalContent(contentEntry.bytes);
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
            capture: async () => ({
              timestamp: Date.parse("2020-01-01T00:00:04.000Z"),
              latitude: 37.76942,
              longitude: -122.48621,
              horizontalAccuracy: 8,
            }),
          },
          now: () => new Date("2020-01-01T00:00:05.000Z"),
          createObservationId: () => "field-location-1",
        },
      });
      const local = createLocalModelAdapter({
        initialView,
        bindings: { "field.advance": fieldBinding(model) },
        commit: (candidate) => handlers.commitTransition({ candidate }),
      });
      const requestCapability = async (requestInput: object) =>
        (
          await handlers.requestCapability({
            capability: FOREGROUND_LOCATION_CAPABILITY,
            input: requestInput as CanonicalJsonObject,
          })
        ).output;

      const firstMount = await mountGeneratedApplication({
        composition: inspection.gameComposition,
        presentation,
        local,
        content,
        requestCapability,
      });
      expect(firstMount.root.children).toHaveLength(1);
      const observation = await requestCapability({});
      if (!isRecord(observation) || typeof observation.observationId !== "string") {
        throw new Error("field-observation-invalid");
      }
      await expect(
        local.commands["field.advance"]?.execute({
          commandId: "field-check-in",
          payload: { action: "check-in" },
          observations: [
            {
              observationId: observation.observationId,
              kind: "location.foreground",
              key: "current",
              value: observation,
            },
          ],
        }),
      ).resolves.toMatchObject({
        disposition: "committed",
        terminal: "accepted",
        resultingStateVersion: 1,
      });
      await firstMount.handle.unmount();
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
          stateVersion: 1,
          state: { visitedCheckpoints: ["first-checkpoint"], puzzleSolved: false },
        },
      });
      if (recovered === null || recovered.aggregate === null) {
        throw new Error("field-recovery-missing");
      }
      expect(recovered.aggregate.progression).toEqual((await local.getView()).progression);

      const recreatedLocal = createLocalModelAdapter({
        initialView: recovered.aggregate,
        bindings: { "field.advance": fieldBinding(model) },
        commit: (candidate) => handlers.commitTransition({ candidate }),
      });
      const recreatedMount = await mountGeneratedApplication({
        composition: inspection.gameComposition,
        presentation,
        local: recreatedLocal,
        content,
        requestCapability,
      });
      expect(recreatedMount.root.children).toHaveLength(1);
      expect(await recreatedLocal.getView()).toEqual(recovered.aggregate);
      await recreatedMount.handle.unmount();

      const journalColumns = (
        await database.raw().getAllAsync<{ name: string }>("PRAGMA table_info(journal)")
      ).map(({ name }) => name);
      expect(journalColumns).toContain("record_json");
      expect(journalColumns).not.toContain("progression_json");
      const report = await createPlayReport(database, selected.run.runId, "ios");
      expect(report).toMatchObject({
        releaseId: compilation.releaseId,
        platform: "ios",
        events: expect.arrayContaining([
          expect.objectContaining({ kind: "capability", disposition: "captured" }),
          expect.objectContaining({
            kind: "command",
            terminal: "accepted",
            resultingStateVersion: 1,
          }),
          expect.objectContaining({ kind: "recovery", disposition: "run-restored" }),
        ]),
      });
      expect(JSON.stringify(report)).not.toMatch(
        /"(?:latitude|longitude|horizontalAccuracy|capturedAt|recordedAt|payload|state)"/,
      );
    } finally {
      sql.close();
      await fileSystem.rm(outputFile, { force: true });
    }
  });
});
