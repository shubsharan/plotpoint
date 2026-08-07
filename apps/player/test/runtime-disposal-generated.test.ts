import { afterEach, describe, expect, it, vi } from "vitest";

import type { GameComposition } from "@plotpoint/protocol";

import { routeHostBridgeMessage } from "../src/bridge/host-bridge";
import { buildRuntimeBootstrap } from "../src/runtime/bootstrap";
import { mountGeneratedWebRuntime } from "./helpers/generated-web-runtime";

const composition: GameComposition = {
  application: { components: ["runner"] },
  aggregateModels: [
    {
      id: "player",
      authority: "local",
      kind: "player",
      stateSchema: { id: "player-state" },
      initializationSchema: { id: "player-initialization" },
      events: [],
      effects: [],
    },
  ],
  commands: [],
  progressions: [],
  components: [
    {
      id: "runner",
      commands: [],
      content: [],
      assets: [],
      capabilities: [{ id: "plotpoint.location.foreground", major: 1, minimumMinor: 0 }],
    },
  ],
  resources: [],
};

const logicSource = `
export const aggregateModels = Object.freeze({
  player: Object.freeze({
    modelId: 'player', aggregateKind: 'player', authority: 'local',
    stateSchema: Object.freeze({ id: 'player-state' }),
    commandContracts: Object.freeze({}), eventSchemas: Object.freeze({}), effectSchemas: Object.freeze({}),
    execute() { throw new Error('unexpected-command'); }
  })
});`;

interface LifecycleHooks {
  readonly log: string[];
  readonly applicationGate?: Promise<void>;
  readonly mountGate?: Promise<void>;
}

const lifecycleGlobal = globalThis as typeof globalThis & {
  __plotpointLifecycle?: LifecycleHooks;
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function bootstrap() {
  return {
    runId: "run-disposal",
    releaseId: `sha256:${"d".repeat(64)}` as const,
    aggregate: {
      modelId: "player",
      aggregateId: "player-1",
      aggregateKind: "player" as const,
      schemaId: "player-state",
      stateVersion: 0,
      state: {},
    },
  };
}

afterEach(() => {
  delete lifecycleGlobal.__plotpointLifecycle;
});

describe("generated runtime disposal handshake", () => {
  it("waits for startup and asynchronous application cleanup and shares concurrent disposal", async () => {
    const mountGate = deferred();
    const applicationGate = deferred();
    const log: string[] = [];
    lifecycleGlobal.__plotpointLifecycle = {
      log,
      mountGate: mountGate.promise,
      applicationGate: applicationGate.promise,
    };
    const presentationSource = `
export const components = Object.freeze({
  runner() { return document.createElement('div'); }
});
export const application = Object.freeze({
  async mount({ root, components }) {
    root.replaceChildren(components.runner());
    await globalThis.__plotpointLifecycle.mountGate;
    return Object.freeze({
      async unmount() {
        globalThis.__plotpointLifecycle.log.push('application');
        await globalThis.__plotpointLifecycle.applicationGate;
        globalThis.__plotpointLifecycle.log.push('application-complete');
      }
    });
  }
});`;
    const mounted = await mountGeneratedWebRuntime(
      buildRuntimeBootstrap({ logicSource, presentationSource, gameComposition: composition }),
      (message) =>
        routeHostBridgeMessage(message, {
          runtimeReady: async () => bootstrap(),
          commitTransition: async () => {
            throw new Error("unexpected-transition");
          },
          requestCapability: async () => {
            throw new Error("unexpected-capability");
          },
        }),
    );

    let firstSettled = false;
    const first = mounted.requestDisposal("dispose-before-mount").then((value) => {
      firstSettled = true;
      return value;
    });
    const second = mounted.requestDisposal("dispose-concurrent");
    await Promise.resolve();
    expect(firstSettled).toBe(false);
    expect(log).toEqual([]);

    mountGate.resolve();
    await vi.waitFor(() => expect(log).toEqual(["application"]));
    expect(firstSettled).toBe(false);
    applicationGate.resolve();

    await expect(first).resolves.toMatchObject({
      requestId: "dispose-before-mount",
      payload: { status: "disposed" },
    });
    await expect(second).resolves.toMatchObject({
      requestId: "dispose-concurrent",
      payload: { status: "disposed" },
    });
    expect(log).toEqual(["application", "application-complete"]);
    await mounted.unmount();
    expect(log).toEqual(["application", "application-complete"]);
  });

  it("routes cleanup host work before a stable failure acknowledgement and attempts all cleanup", async () => {
    const capabilityGate = deferred();
    const log: string[] = [];
    lifecycleGlobal.__plotpointLifecycle = { log };
    const presentationSource = `
export const components = Object.freeze({
  runner({ capabilities, lifecycle }) {
    const element = document.createElement('div');
    lifecycle.defer(() => { globalThis.__plotpointLifecycle.log.push('first-cleanup'); });
    lifecycle.defer(async () => {
      globalThis.__plotpointLifecycle.log.push('second-cleanup');
      await capabilities['plotpoint.location.foreground'].request({ purpose: 'cleanup' });
      globalThis.__plotpointLifecycle.log.push('host-work-complete');
      throw new Error('private-cleanup-detail');
    });
    return element;
  }
});
export const application = Object.freeze({
  mount({ root, components }) {
    root.replaceChildren(components.runner());
    return Object.freeze({ unmount() { globalThis.__plotpointLifecycle.log.push('application'); } });
  }
});`;
    let capabilityRequests = 0;
    const mounted = await mountGeneratedWebRuntime(
      buildRuntimeBootstrap({ logicSource, presentationSource, gameComposition: composition }),
      (message) =>
        routeHostBridgeMessage(message, {
          runtimeReady: async () => bootstrap(),
          commitTransition: async () => {
            throw new Error("unexpected-transition");
          },
          requestCapability: async ({ capability }) => {
            capabilityRequests += 1;
            await capabilityGate.promise;
            return { capability, output: { recorded: true } };
          },
        }),
    );

    let acknowledged = false;
    const acknowledgement = mounted
      .requestDisposal("dispose-with-cleanup-failure")
      .then((value) => {
        acknowledged = true;
        return value;
      });
    await vi.waitFor(() => expect(capabilityRequests).toBe(1));
    expect(acknowledged).toBe(false);
    expect(log).toEqual(["application", "second-cleanup"]);

    capabilityGate.resolve();
    await expect(acknowledgement).resolves.toMatchObject({
      requestId: "dispose-with-cleanup-failure",
      payload: { status: "failed", code: "runtime-disposal-cleanup-failed" },
    });
    expect(log).toEqual(["application", "second-cleanup", "host-work-complete", "first-cleanup"]);
    await expect(mounted.unmount()).rejects.toThrow("runtime-disposal-cleanup-failed");
    expect(log.filter((entry) => entry === "first-cleanup")).toHaveLength(1);
    expect(log.filter((entry) => entry === "second-cleanup")).toHaveLength(1);
  });
});
