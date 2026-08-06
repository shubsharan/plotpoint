import { describe, expect, it } from "vitest";

import type { GameComposition, SharedProjection } from "@plotpoint/protocol";

import { buildRuntimeBootstrap, deriveSharedCommandIntent } from "../src/runtime/bootstrap";
import { mountGameComposition, type ComponentContext } from "../src/runtime/composition";

const composition = {
  application: { components: ["field-map"] },
  aggregateModels: [
    {
      id: "field-player",
      authority: "local",
      kind: "player",
      stateSchema: { id: "field-state" },
      initializationSchema: { id: "field-initialization" },
      events: [],
      effects: [],
    },
  ],
  commands: [
    {
      id: "complete-checkpoint",
      type: "complete-checkpoint",
      aggregateModel: "field-player",
      payloadSchema: { id: "checkpoint-command" },
      outcomeSchema: { id: "checkpoint-outcome" },
      execution: "local",
    },
  ],
  progressions: [],
  components: [
    {
      id: "field-map",
      commands: ["complete-checkpoint"],
      content: ["field-copy"],
      assets: ["field-map-image"],
      capabilities: [{ id: "plotpoint.location.foreground", major: 1, minimumMinor: 0 }],
    },
  ],
  resources: [
    { id: "field-state", role: "schema", path: "schemas/field-state.json" },
    {
      id: "field-initialization",
      role: "schema",
      path: "schemas/field-initialization.json",
    },
    { id: "checkpoint-command", role: "schema", path: "schemas/checkpoint-command.json" },
    { id: "checkpoint-outcome", role: "schema", path: "schemas/checkpoint-outcome.json" },
    { id: "field-copy", role: "content", path: "content/field-copy.json" },
    { id: "field-map-image", role: "asset", path: "assets/field-map.svg" },
    {
      id: "field-map",
      role: "component-descriptor",
      path: "composition/components/field-map.json",
    },
  ],
} satisfies GameComposition;

function runtimeGlue(): string {
  return buildRuntimeBootstrap({
    logicSource: "export const aggregateModels = Object.freeze({});",
    presentationSource:
      "export const application = Object.freeze({ mount({ root, components }) { root.replaceChildren(components['field-map']()); return { unmount() {} }; } }); export const components = Object.freeze({});",
    gameComposition: composition,
  });
}

const sharedComposition = {
  ...composition,
  aggregateModels: [
    ...composition.aggregateModels,
    {
      id: "shared-model",
      authority: "server",
      kind: "team",
      stateSchema: { id: "shared-state" },
      initializationSchema: { id: "shared-initialization" },
      events: [],
      effects: [],
    },
  ],
  commands: [
    ...composition.commands,
    {
      id: "shared-action",
      type: "shared.action",
      aggregateModel: "shared-model",
      payloadSchema: { id: "shared-action-payload" },
      outcomeSchema: { id: "shared-action-outcome" },
      execution: "trusted-mechanic",
    },
  ],
  components: [
    {
      ...composition.components[0]!,
      commands: ["complete-checkpoint", "shared-action"],
      sharedProjection: { id: "shared-projection" },
    },
  ],
  trustedMechanic: {
    id: "shared-adapter",
    aggregateModel: "shared-model",
    commands: ["shared-action"],
    configuration: "field-copy",
    projectionSchema: { id: "shared-projection" },
    capabilities: [],
  },
} satisfies GameComposition;

const sharedProjection = {
  aggregateKind: "team",
  aggregateId: "team-1",
  schemaId: "shared-projection",
  schemaVersion: 1,
  stateVersion: 3,
  value: { ready: true },
} satisfies SharedProjection;

describe("runtime composition lifecycle", () => {
  it("mounts __proto__ component and dependency keys without prototype loss", async () => {
    const adversarialComposition = {
      application: { components: ["__proto__"] },
      aggregateModels: [
        {
          id: "player",
          authority: "local",
          kind: "player",
          stateSchema: { id: "state" },
          initializationSchema: { id: "initialization" },
          events: [],
          effects: [],
        },
      ],
      commands: [
        {
          id: "__proto__",
          type: "__proto__",
          aggregateModel: "player",
          payloadSchema: { id: "payload" },
          outcomeSchema: { id: "outcome" },
          execution: "local",
        },
      ],
      progressions: [],
      components: [
        {
          id: "__proto__",
          commands: ["__proto__"],
          content: ["__proto__"],
          assets: ["__proto__"],
          capabilities: [{ id: "__proto__", major: 1, minimumMinor: 0 }],
        },
      ],
      resources: [],
    } satisfies GameComposition;
    const root = {} as HTMLElement;
    const element = {} as HTMLElement;
    let mountedContext: ComponentContext | undefined;
    const handle = await mountGameComposition({
      root,
      composition: adversarialComposition,
      application: Object.freeze({
        mount({
          components,
        }: {
          readonly components: Readonly<Record<string, () => HTMLElement>>;
        }) {
          expect(Object.keys(components)).toEqual(["__proto__"]);
          expect(components["__proto__"]?.()).toBe(element);
          return Object.freeze({ unmount() {} });
        },
      }),
      components: Object.freeze({
        ["__proto__"]: (context: ComponentContext) => {
          mountedContext = context;
          return element;
        },
      }),
      providers: {
        local: {
          async getView() {
            throw new Error("not invoked");
          },
          onChanged() {
            return () => {};
          },
          commands: Object.freeze({
            ["__proto__"]: Object.freeze({
              async execute() {
                throw new Error("not invoked");
              },
            }),
          }),
        },
        content: Object.freeze({ ["__proto__"]: Object.freeze({ value: "content" }) }),
        assets: Object.freeze({ ["__proto__"]: Object.freeze({ value: "asset" }) }),
        capabilities: Object.freeze({
          ["__proto__"]: Object.freeze({
            async request() {
              throw new Error("not invoked");
            },
          }),
        }),
      },
      isElement: (value): value is HTMLElement => value === element,
    });

    expect(mountedContext).toBeDefined();
    for (const selected of [
      mountedContext?.local.commands,
      mountedContext?.content,
      mountedContext?.assets,
      mountedContext?.capabilities,
    ]) {
      expect(Object.keys(selected ?? {})).toEqual(["__proto__"]);
    }
    await handle.unmount();
  });

  it("rolls component cleanup back in reverse order exactly once", async () => {
    const cleanup: string[] = [];
    const element = {} as HTMLElement;

    await expect(
      mountGameComposition({
        root: {} as HTMLElement,
        composition,
        application: {
          mount({
            components,
          }: {
            readonly components: Readonly<Record<string, () => HTMLElement>>;
          }) {
            components["field-map"]?.();
            throw new Error("application-mount-failed");
          },
        },
        components: {
          "field-map": ({ lifecycle }) => {
            lifecycle.defer(() => {
              cleanup.push("first");
            });
            lifecycle.defer(() => {
              cleanup.push("second");
            });
            return element;
          },
        },
        providers: {
          local: {
            async getView() {
              throw new Error("not invoked");
            },
            onChanged() {
              return () => {};
            },
            commands: {
              "complete-checkpoint": {
                async execute(input) {
                  return {
                    commandId: input.commandId,
                    disposition: "not-recorded",
                    terminal: "invalid",
                    phase: "preflight",
                    diagnosticCodes: ["not-invoked"],
                  };
                },
              },
            },
          },
          content: { "field-copy": {} },
          assets: { "field-map-image": {} },
          capabilities: {
            "plotpoint.location.foreground": {
              async request() {
                return {};
              },
            },
          },
        },
        isElement: (value): value is HTMLElement => value === element,
      }),
    ).rejects.toThrow("application-mount-failed");
    expect(cleanup).toEqual(["second", "first"]);

    const html = runtimeGlue();
    expect(html).toContain(
      "lifecycle.defer(() => window.removeEventListener('plotpoint-host', onSharedSyncChanged))",
    );
    expect(html).toContain("window.__plotpointDispose = disposeRuntime");
  });

  it("scopes Shared Play to declared projections and trusted commands", async () => {
    const element = {} as HTMLElement;
    let mounted: ComponentContext | undefined;
    const handle = await mountGameComposition({
      root: {} as HTMLElement,
      composition: sharedComposition,
      application: {
        mount({
          components,
        }: {
          readonly components: Readonly<Record<string, () => HTMLElement>>;
        }) {
          components["field-map"]?.();
          return { unmount() {} };
        },
      },
      components: {
        "field-map": (context) => {
          mounted = context;
          return element;
        },
      },
      providers: {
        local: {
          async getView() {
            throw new Error("not invoked");
          },
          onChanged() {
            return () => {};
          },
          commands: {
            "complete-checkpoint": {
              async execute(input) {
                return {
                  commandId: input.commandId,
                  disposition: "not-recorded",
                  terminal: "invalid",
                  phase: "preflight",
                  diagnosticCodes: ["not-invoked"],
                };
              },
            },
          },
        },
        shared: {
          async getView() {
            throw new Error("not invoked");
          },
          onSyncChanged() {
            return () => {};
          },
          commands: {
            "shared-action": { async execute() {} },
            undeclared: { async execute() {} },
          },
        },
        content: { "field-copy": {} },
        assets: { "field-map-image": {} },
        capabilities: {
          "plotpoint.location.foreground": {
            async request() {
              return {};
            },
          },
        },
      },
      isElement: (value): value is HTMLElement => value === element,
    });

    expect(Object.keys(mounted?.shared?.commands ?? {})).toEqual(["shared-action"]);
    await handle.unmount();
  });

  it("derives shared authority fields and rejects author-supplied target, type, or version", () => {
    const command = sharedComposition.commands.find(({ id }) => id === "shared-action");
    const model = sharedComposition.aggregateModels.find(({ id }) => id === "shared-model");
    if (command === undefined || model?.authority !== "server") {
      throw new Error("runtime-shared-fixture-invalid");
    }

    expect(
      deriveSharedCommandIntent(
        { commandId: "action-1", payload: { choice: "alpha" }, observationIds: ["proof-1"] },
        command,
        model,
        "shared-projection",
        1,
        sharedProjection,
      ),
    ).toEqual({
      commandId: "action-1",
      payload: { choice: "alpha" },
      observationIds: ["proof-1"],
      expectedStateVersion: 3,
      type: "shared.action",
      target: {
        aggregateKind: "team",
        aggregateId: "team-1",
        schemaId: "shared-state",
        schemaVersion: 1,
      },
    });
    for (const authorityField of [
      { target: sharedProjection },
      { type: "another.action" },
      { expectedStateVersion: 99 },
    ]) {
      expect(() =>
        deriveSharedCommandIntent(
          { commandId: "action-2", payload: {}, ...authorityField },
          command,
          model,
          "shared-projection",
          1,
          sharedProjection,
        ),
      ).toThrow("runtime-shared-command-input-invalid");
    }
  });

  it("constructs each component map from only its declared dependencies", () => {
    const html = runtimeGlue();
    const component = composition.components[0];
    if (component === undefined) throw new Error("runtime-composition-fixture-invalid");

    for (const dependency of ["commands", "content", "assets", "capabilities"] as const) {
      expect(
        html,
        `runtime-composition-scoped-${dependency}-map-missing:${component.id}`,
      ).toContain(`componentDescriptor.${dependency}`);
    }
  });

  it("keeps committed state reads and subscriptions inside component contexts", () => {
    const html = runtimeGlue();

    expect(html, "runtime-composition-component-get-view-missing").toContain("local.getView");
    expect(html, "runtime-composition-component-subscription-missing").toContain("local.onChanged");
    expect(html, "runtime-composition-application-context-leak").toContain(
      "application.mount({ root, components })",
    );
    expect(html).not.toMatch(/application\.mount\([^)]*(?:bootstrap|aggregate|state|host)/);
  });
});
