import { describe, expect, it, vi } from "vitest";

import { type GameComposition } from "@plotpoint/protocol";

import { routeHostBridgeMessage, type HostBridgeHandlers } from "../src/bridge/host-bridge";
import { buildRuntimeBootstrap } from "../src/runtime/bootstrap";
import { mountGeneratedWebRuntime } from "./helpers/generated-web-runtime";

const baseComposition: GameComposition = {
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
  commands: [
    {
      id: "advance",
      type: "advance",
      aggregateModel: "player",
      payloadSchema: { id: "advance-payload" },
      outcomeSchema: { id: "advance-outcome" },
      execution: "local",
    },
  ],
  progressions: [],
  components: [
    {
      id: "runner",
      commands: ["advance"],
      content: [],
      assets: [],
      capabilities: [],
    },
  ],
  resources: [],
};

const logicSource = `
export const aggregateModels = Object.freeze({
  player: Object.freeze({
    modelId: 'player', aggregateKind: 'player', authority: 'local',
    stateSchema: Object.freeze({ id: 'player-state' }),
    commandContracts: Object.freeze({
      advance: Object.freeze({
        registrationId: 'advance',
        payloadSchema: Object.freeze({ id: 'advance-payload' }),
        outcomeSchema: Object.freeze({ id: 'advance-outcome' })
      })
    }),
    eventSchemas: Object.freeze({}), effectSchemas: Object.freeze({}),
    execute({ aggregate, command }) {
      const resultingStateVersion = aggregate.stateVersion + 1;
      return Object.freeze({
        kind: 'recorded',
        record: Object.freeze({
          command, terminal: 'accepted', outcome: Object.freeze({ advanced: true }),
          priorStateVersion: aggregate.stateVersion, resultingStateVersion,
          domainEvents: Object.freeze([]), effectIntents: Object.freeze([]),
          progressionTrace: Object.freeze([]), observationTrace: Object.freeze([])
        }),
        aggregate: Object.freeze({
          ...aggregate, stateVersion: resultingStateVersion,
          state: Object.freeze({ count: aggregate.state.count + 1 })
        })
      });
    }
  })
});`;

function bootstrap() {
  return {
    runId: "run-1",
    releaseId: `sha256:${"a".repeat(64)}` as const,
    aggregate: {
      modelId: "player",
      aggregateId: "player-1",
      aggregateKind: "player" as const,
      schemaId: "player-state",
      stateVersion: 0,
      state: { count: 0 },
    },
  };
}

function handlers(
  commit: HostBridgeHandlers["commitTransition"],
  requestCapability: HostBridgeHandlers["requestCapability"] = async ({ capability }) => ({
    capability,
    output: {},
  }),
): HostBridgeHandlers {
  return { runtimeReady: async () => bootstrap(), commitTransition: commit, requestCapability };
}

async function waitForDataset(
  element: { readonly dataset: Record<string, string> },
  key: string,
  value: string,
): Promise<void> {
  await vi.waitFor(() => expect(element.dataset[key]).toBe(value));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("generated local command lane", () => {
  it("shares identical attempts, conflicts changed reuse, and prepares distinct commands in order", async () => {
    const presentationSource = `
export const components = Object.freeze({
  runner(context) {
    const element = document.createElement('div');
    const command = context.local.commands.advance;
    const first = command.execute({ commandId: 'same', payload: { nested: [[{ a: 1, b: 2 }]] } });
    const retry = command.execute({ commandId: 'same', payload: { nested: [[{ b: 2, a: 1 }]] } });
    try { command.execute({ commandId: 'same', payload: { nested: [[{ a: 2, b: 1 }]] } }); }
    catch (error) { element.dataset.conflict = error.message; }
    Promise.all([first, retry]).then(([left, right]) => {
      element.dataset.shared = String(left.resultingStateVersion === right.resultingStateVersion);
      return command.execute({ commandId: 'same', payload: { nested: [[{ b: 2, a: 1 }]] } });
    }).then((cached) => {
      element.dataset.cached = String(cached.resultingStateVersion === 1);
      return Promise.all([
        command.execute({ commandId: 'second', payload: {} }),
        command.execute({ commandId: 'third', payload: {} })
      ]);
    }).then(() => { element.dataset.complete = 'true'; });
    return element;
  }
});
export const application = Object.freeze({
  mount({ root, components }) {
    root.replaceChildren(components.runner());
    return Object.freeze({ unmount() { root.replaceChildren(); } });
  }
});`;
    const committedVersions: number[] = [];
    const html = buildRuntimeBootstrap({
      logicSource,
      presentationSource,
      gameComposition: baseComposition,
    });
    const mounted = await mountGeneratedWebRuntime(html, (message) =>
      routeHostBridgeMessage(
        message,
        handlers(async ({ candidate }) => {
          if (candidate.terminal !== "accepted") throw new Error("unexpected-terminal");
          committedVersions.push(candidate.expectedStateVersion);
          await new Promise((resolve) => setTimeout(resolve, 2));
          return {
            commandId: candidate.commandId,
            disposition: "committed",
            terminal: "accepted",
            resultingStateVersion: candidate.expectedStateVersion + 1,
            outcome: candidate.outcome,
          };
        }),
      ),
    );
    const element = mounted.root.children[0]!;
    await waitForDataset(element, "complete", "true");
    expect(element.dataset.conflict).toBe("runtime-local-command-identity-conflict");
    expect(element.dataset.shared).toBe("true");
    expect(element.dataset.cached).toBe("true");
    expect(committedVersions).toEqual([0, 1, 2]);
    await mounted.unmount();
  });

  it("reissues an exact command after a lost bridge response and advances once", async () => {
    const presentationSource = `
export const components = Object.freeze({
  runner(context) {
    const element = document.createElement('div');
    const command = context.local.commands.advance;
    const execute = () => command.execute({ commandId: 'response-loss', payload: { value: 1 } })
      .then((result) => { element.dataset.result = result.disposition; })
      .catch((error) => { element.dataset.failure = error.message; });
    element.addEventListener('execute', () => { void execute(); });
    element.addEventListener('changed', () => {
      try { command.execute({ commandId: 'response-loss', payload: { value: 2 } }); }
      catch (error) { element.dataset.conflict = error.message; }
    });
    context.local.onChanged(() => {
      element.dataset.notifications = String(Number(element.dataset.notifications || '0') + 1);
    });
    return element;
  }
});
export const application = Object.freeze({
  mount({ root, components }) {
    root.replaceChildren(components.runner());
    return Object.freeze({ unmount() { root.replaceChildren(); } });
  }
});`;
    const candidates: unknown[] = [];
    let durableVersion = 0;
    let transitionCount = 0;
    const commit = handlers(async ({ candidate }) => {
      candidates.push(candidate);
      transitionCount += 1;
      if (durableVersion === 0) durableVersion = 1;
      return {
        commandId: candidate.commandId,
        disposition: transitionCount === 1 ? "committed" : "duplicate",
        terminal: "accepted",
        resultingStateVersion: durableVersion,
        outcome: candidate.terminal === "accepted" ? candidate.outcome : {},
      };
    });
    const mounted = await mountGeneratedWebRuntime(
      buildRuntimeBootstrap({ logicSource, presentationSource, gameComposition: baseComposition }),
      async (message) => {
        const response = await routeHostBridgeMessage(message, commit);
        const envelope = JSON.parse(message) as { readonly type: string };
        if (envelope.type === "transition.commit" && transitionCount === 1) {
          return await new Promise<never>(() => undefined);
        }
        return response;
      },
    );
    const element = mounted.root.children[0]!;
    vi.useFakeTimers();
    try {
      await element.dispatchEvent("execute");
      await vi.waitFor(() => expect(transitionCount).toBe(1));
      await vi.advanceTimersByTimeAsync(15_000);
      await vi.waitFor(() =>
        expect(element.dataset.failure).toBe("runtime-local-transition-response-timeout"),
      );
      await element.dispatchEvent("changed");
      expect(element.dataset.conflict).toBe("runtime-local-command-identity-conflict");

      await element.dispatchEvent("execute");
      await vi.waitFor(() => expect(element.dataset.result).toBe("duplicate"));
      expect(transitionCount).toBe(2);
      expect(candidates[1]).toEqual(candidates[0]);
      expect(element.dataset.notifications).toBe("1");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
      await mounted.unmount();
    }
  });

  it("allows an exact retry after a settled host error without releasing identity", async () => {
    const presentationSource = `
export const components = Object.freeze({
  runner(context) {
    const element = document.createElement('div');
    const command = context.local.commands.advance;
    element.addEventListener('execute', () => {
      command.execute({ commandId: 'host-error', payload: { value: 1 } })
        .then((result) => { element.dataset.result = result.disposition; })
        .catch((error) => {
          element.dataset.failed = 'true';
          element.dataset.error = String(error && (error.message || error.code) || error);
        });
    });
    element.addEventListener('changed', () => {
      try { command.execute({ commandId: 'host-error', payload: { value: 2 } }); }
      catch (error) { element.dataset.conflict = error.message; }
    });
    return element;
  }
});
export const application = Object.freeze({
  mount({ root, components }) {
    root.replaceChildren(components.runner());
    return Object.freeze({ unmount() { root.replaceChildren(); } });
  }
});`;
    let transitionCount = 0;
    const mounted = await mountGeneratedWebRuntime(
      buildRuntimeBootstrap({ logicSource, presentationSource, gameComposition: baseComposition }),
      (message) =>
        routeHostBridgeMessage(
          message,
          handlers(async ({ candidate }) => {
            transitionCount += 1;
            if (transitionCount === 1) throw new Error("host-temporarily-unavailable");
            return {
              commandId: candidate.commandId,
              disposition: "committed",
              terminal: "accepted",
              resultingStateVersion: 1,
              outcome: candidate.terminal === "accepted" ? candidate.outcome : {},
            };
          }),
        ),
    );
    const element = mounted.root.children[0]!;
    await element.dispatchEvent("execute");
    await waitForDataset(element, "failed", "true");
    await element.dispatchEvent("changed");
    expect(element.dataset.conflict).toBe("runtime-local-command-identity-conflict");
    await element.dispatchEvent("execute");
    await waitForDataset(element, "result", "committed");
    expect({ transitionCount, error: element.dataset.error }).toEqual({
      transitionCount: 2,
      error: "host-temporarily-unavailable",
    });
    await mounted.unmount();
  });

  it("constructs exact capability clients for each component requirement", async () => {
    const composition: GameComposition = {
      ...baseComposition,
      application: { components: ["minor-zero", "minor-two"] },
      components: [
        {
          id: "minor-zero",
          commands: [],
          content: [],
          assets: [],
          capabilities: [{ id: "plotpoint.example", major: 1, minimumMinor: 0 }],
        },
        {
          id: "minor-two",
          commands: [],
          content: [],
          assets: [],
          capabilities: [{ id: "plotpoint.example", major: 1, minimumMinor: 2 }],
        },
      ],
    };
    const presentationSource = `
const component = (expected) => (context) => {
  const element = document.createElement('div');
  context.capabilities['plotpoint.example'].request({}).then((output) => {
    element.dataset.minor = String(output.minor);
    element.dataset.complete = String(output.minor === expected);
  });
  return element;
};
export const components = Object.freeze({
  'minor-zero': component(0),
  'minor-two': component(2)
});
export const application = Object.freeze({
  mount({ root, components }) {
    root.replaceChildren(components['minor-zero'](), components['minor-two']());
    return Object.freeze({ unmount() { root.replaceChildren(); } });
  }
});`;
    const requested: number[] = [];
    const mounted = await mountGeneratedWebRuntime(
      buildRuntimeBootstrap({ logicSource, presentationSource, gameComposition: composition }),
      (message) =>
        routeHostBridgeMessage(
          message,
          handlers(
            async () => {
              throw new Error("unexpected-transition");
            },
            async ({ capability }) => {
              requested.push(capability.minor);
              return { capability, output: { minor: capability.minor } };
            },
          ),
        ),
    );
    await Promise.all(
      mounted.root.children.map((element) => waitForDataset(element, "complete", "true")),
    );
    expect(requested).toEqual([0, 2]);
    await mounted.unmount();
  });

  it("closes queued work before disposal cleans the mounted runtime", async () => {
    const presentationSource = `
export const components = Object.freeze({
  runner(context) {
    const element = document.createElement('div');
    const command = context.local.commands.advance;
    element.addEventListener('execute', () => {
      command.execute({ commandId: 'first', payload: {} }).catch(() => undefined);
      command.execute({ commandId: 'queued', payload: {} }).catch((error) => {
        element.dataset.queued = error.message;
      });
    });
    return element;
  }
});
export const application = Object.freeze({
  mount({ root, components }) {
    root.replaceChildren(components.runner());
    return Object.freeze({ unmount() { root.replaceChildren(); } });
  }
});`;
    const firstCommit = deferred<{
      readonly commandId: string;
      readonly disposition: "committed";
      readonly terminal: "accepted";
      readonly resultingStateVersion: number;
      readonly outcome: { readonly advanced: true };
    }>();
    let commitCount = 0;
    const mounted = await mountGeneratedWebRuntime(
      buildRuntimeBootstrap({
        logicSource,
        presentationSource,
        gameComposition: baseComposition,
      }),
      (message) =>
        routeHostBridgeMessage(
          message,
          handlers(async () => {
            commitCount += 1;
            return firstCommit.promise;
          }),
        ),
    );
    const element = mounted.root.children[0]!;
    vi.useFakeTimers();
    try {
      await element.dispatchEvent("execute");
      await vi.waitFor(() => expect(commitCount).toBe(1));
      expect(vi.getTimerCount()).toBe(1);
      await mounted.unmount();

      expect(commitCount).toBe(1);
      expect(element.dataset.queued).toBe("runtime-local-command-lane-closed");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
