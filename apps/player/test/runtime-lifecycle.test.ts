import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { routeHostBridgeMessage } from "../src/bridge/host-bridge";
import {
  commitCandidateTransition,
  type TransitionStore,
  type TransitionTransaction,
} from "../src/persistence/commit-transition";
import type {
  CandidateTransition,
  DurableCommandRecord,
  DurableTransitionResult,
  SnapshotRecord,
} from "../src/model";
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

  async getReceipt(_runId: string, commandId: string): Promise<DurableCommandRecord | null> {
    const value = this.serialized.receipts.get(commandId);
    return value === undefined ? null : (JSON.parse(value) as DurableCommandRecord);
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
    if (candidate.terminal !== "accepted") throw new Error("fixture-terminal-invalid");
    this.serialized.records += 1;
    const result = {
      commandId: candidate.commandId,
      disposition: "committed",
      terminal: candidate.terminal,
      resultingStateVersion: candidate.expectedStateVersion + 1,
      outcome: candidate.outcome,
    } satisfies DurableTransitionResult;
    this.serialized.receipts.set(
      candidate.commandId,
      JSON.stringify({ candidate, result } satisfies DurableCommandRecord),
    );
    this.serialized.snapshot = JSON.stringify({
      runId,
      modelId: candidate.modelId,
      aggregateId: candidate.target.aggregateId,
      aggregateKind: candidate.target.aggregateKind,
      schemaId: candidate.target.schemaId,
      stateVersion: result.resultingStateVersion,
      state: candidate.nextState ?? {},
      ...(candidate.nextProgression === undefined
        ? {}
        : { progression: candidate.nextProgression }),
      journalPosition: 1,
    } satisfies SnapshotRecord);
    return result;
  }
}

const originalCandidate = {
  commandId: "command-reloaded",
  modelId: "field.player",
  commandType: "advance",
  payload: { action: "check-in" },
  target: {
    aggregateId: "player-1",
    aggregateKind: "player",
    schemaId: "field.player-state",
  },
  expectedStateVersion: 0,
  terminal: "accepted",
  outcome: { result: "original-advanced" },
  nextState: { visitedCheckpoints: ["first-checkpoint"] },
  domainEvents: [{ type: "field.advanced", payload: {} }],
  effectIntents: [],
  progressionTrace: [],
  observationIds: [],
} satisfies CandidateTransition;

async function exists(path: URL): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("runtime view lifecycle", () => {
  it("gates native runtime removal on one managed disposal acknowledgement", async () => {
    const [app, managedView] = await Promise.all([
      readFile(new URL("../App.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/runtime/managed-runtime-webview.tsx", import.meta.url), "utf8"),
    ]);

    expect(app).not.toContain("useLayoutEffect");
    expect(app).not.toContain("__plotpointDispose");
    expect(app).toContain("await disposeMountedRuntime();");
    expect(app.indexOf("await disposeMountedRuntime();")).toBeLessThan(
      app.indexOf("sharedPlayController.current?.dispose();"),
    );
    expect(app).toMatch(
      /if \(!sharedStateMountsRuntime\(state\)\) await disposeMountedRuntime\(\);/,
    );
    expect(app).toMatch(/await disposeMountedRuntime\(\);\s+setScanning\(true\);/);
    expect(app).toContain(
      "key={`${runtime.recovery.runId}:${runtime.recovery.releaseId}:${runtimeMountGeneration}`}",
    );

    expect(managedView).toContain('pointerEvents={phase === "disposing" ? "none" : "auto"}');
    expect(managedView).toContain('phase === "disposing" ? styles.disposing : null');
    expect(managedView).toContain("onContentProcessDidTerminate");
    expect(managedView).toContain("onRenderProcessGone");
    expect(managedView).not.toMatch(/setTimeout|deadline|timeout/i);
  });

  it("requires composition at the playable bootstrap and recovery boundaries", async () => {
    const bootstrap = await readFile(
      new URL("../src/runtime/web-runtime.generated.ts", import.meta.url),
      "utf8",
    );
    const kernel = await readFile(
      new URL("../src/runtime/web-runtime-kernel.ts", import.meta.url),
      "utf8",
    );
    const recovery = await readFile(new URL("../src/runtime/recovery.ts", import.meta.url), "utf8");

    expect(kernel).toContain("readonly gameComposition: GameComposition;");
    expect(bootstrap).toContain("runtime-game-composition-missing");
    expect(recovery).toContain("inspectGameRelease(input.bytes)");
    expect(recovery).not.toMatch(/\binspectRelease\s*\(/);
  });

  it("keeps player routing independent of example games and mechanics", async () => {
    const files = [
      "../App.tsx",
      "../src/runtime/web-runtime-kernel.ts",
      "../src/runtime/production-handlers.ts",
      "../src/shared/host-bridge.ts",
      "../src/shared/session-controller.ts",
    ];
    const sources = await Promise.all(
      files.map((file) => readFile(new URL(file, import.meta.url), "utf8")),
    );

    expect(sources.join("\n")).not.toMatch(
      /field-puzzle|co-op-game|target-discovery|SharedHunt|HuntReport|hunt-sessions/,
    );
  });

  it("prepares shared-capable runtime metadata before controller-owned startup and notification", async () => {
    const source = await readFile(new URL("../App.tsx", import.meta.url), "utf8");
    const runtimePreparation = source.indexOf("setRuntime({");
    const controllerStartup = source.indexOf("await controller.start()");

    expect(runtimePreparation).toBeGreaterThan(-1);
    expect(controllerStartup).toBeGreaterThan(runtimePreparation);
    expect(source).toContain("sharedBindingAvailable: composition.trustedMechanic !== undefined");
    expect(source).not.toMatch(/sharedSessionId|sharedSurface|setSharedSessionId/);
    expect(source.match(/notifySharedSyncChanged\(\)/g)).toHaveLength(1);
    expect(source).not.toMatch(/\.then\(notifySharedSyncChanged\)/);
  });

  it("has no shadow composition, mount-scope, or local adapter implementation", async () => {
    await expect(
      Promise.all(
        [
          "../src/runtime/composition.ts",
          "../src/runtime/mount-scope.ts",
          "../src/runtime/local-model-adapter.ts",
        ].map((file) => exists(new URL(file, import.meta.url))),
      ),
    ).resolves.toEqual([false, false, false]);
  });

  it("has one mandatory envelope contract and no two-secret compatibility path", async () => {
    const [credentials, sharedDatabase] = await Promise.all([
      readFile(new URL("../src/shared/credentials.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/shared/database.ts", import.meta.url), "utf8"),
    ]);

    expect(credentials).toContain("putEnvelope(key: string");
    expect(credentials).toContain("getEnvelope(key: string");
    expect(credentials).toContain("removeEnvelope(key: string");
    expect(credentials).not.toMatch(/putCredential|getCredential|putInvitation|getInvitation/);
    expect(sharedDatabase).toContain("envelope_key TEXT NOT NULL");
    expect(sharedDatabase).not.toMatch(/invitation_key|credential_key/);
  });

  it("has no superseded local or game-specific report reader", async () => {
    await expect(
      Promise.all(
        ["../src/reports/create-play-report.ts", "../src/reports/create-shared-hunt-report.ts"].map(
          (file) => exists(new URL(file, import.meta.url)),
        ),
      ),
    ).resolves.toEqual([false, false]);
  });

  it("never resets or rewrites an incompatible player database automatically", async () => {
    const files = [
      "../src/persistence/database.ts",
      "../src/persistence/schema-policy.ts",
      "../src/shared/database.ts",
    ];
    const sources = await Promise.all(
      files.map((file) => readFile(new URL(file, import.meta.url), "utf8")),
    );
    const combined = sources.join("\n");

    expect(combined).toContain("player-database-incompatible-reset-or-reinstall");
    expect(combined).not.toMatch(
      /deleteDatabase(?:Async)?\s*\(|\bDROP\s+(?:TABLE|TRIGGER|INDEX)\b|\bALTER\s+TABLE\b/i,
    );
  });

  it("redelivers the original durable result after view recreation", () => {
    const original = {
      commandId: "command-1",
      disposition: "committed",
      terminal: "accepted",
      resultingStateVersion: 3,
      outcome: { result: "original-advanced" },
    } satisfies DurableTransitionResult;
    const duplicate = { ...original, disposition: "duplicate" } satisfies DurableTransitionResult;

    expect(transitionResultFromDurable(original)).toEqual(original);
    expect(transitionResultFromDurable(duplicate)).toEqual(duplicate);
  });

  it("redelivers durable non-changing and invalid terminals exactly", () => {
    expect(
      transitionResultFromDurable({
        commandId: "command-rejected",
        disposition: "duplicate",
        terminal: "rejected",
        resultingStateVersion: 3,
        outcome: { result: "outside" },
      }),
    ).toMatchObject({ terminal: "rejected", outcome: { result: "outside" } });
    expect(
      transitionResultFromDurable({
        commandId: "command-invalid",
        disposition: "duplicate",
        terminal: "invalid",
        phase: "execution",
        resultingStateVersion: 3,
        diagnosticCodes: ["release-command-failed"],
      }),
    ).toMatchObject({ terminal: "invalid", diagnosticCodes: ["release-command-failed"] });
  });

  it("redelivers the serialized original result after database and view recreation", async () => {
    const serialized: SerializedDatabase = {
      receipts: new Map(),
      snapshot: null,
      records: 0,
    };
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
        payload: { candidate: originalCandidate },
      }),
      {
        runtimeReady: async () => {
          throw new Error("unexpected-runtime-ready");
        },
        requestCapability: async () => {
          throw new Error("unexpected-capability-request");
        },
        commitTransition: async ({ candidate }) => {
          const result = await commitCandidateTransition({
            store: reloadedStore,
            runId: "run-1",
            candidate,
          });
          if ("code" in result) throw new Error(result.code);
          return transitionResultFromDurable(result);
        },
      },
    );

    expect(response).toMatchObject({
      type: "transition.result",
      payload: {
        disposition: "duplicate",
        outcome: { result: "original-advanced" },
        resultingStateVersion: 1,
      },
    });
    expect(serialized.records).toBe(1);
  });
});
