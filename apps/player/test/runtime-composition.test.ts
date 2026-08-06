import { describe, expect, it } from "vitest";

import type { GameComposition } from "@plotpoint/protocol";

import { buildRuntimeBootstrap } from "../src/runtime/bootstrap";
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
  });
}

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

  it("rolls component cleanup back in reverse order exactly once", () => {
    const html = runtimeGlue();

    expect(html, "runtime-composition-reverse-cleanup-missing").toMatch(
      /cleanup[^\n]*\.reverse\(\)/,
    );
    expect(html, "runtime-composition-exactly-once-cleanup-missing").toContain(
      "runtime-component-cleanup-already-invoked",
    );
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
