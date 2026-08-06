import { describe, expect, it } from "vitest";

import type { GameComposition, SharedProjection } from "@plotpoint/protocol";

import { buildRuntimeBootstrap, deriveSharedCommandIntent } from "../src/runtime/bootstrap";

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
  stateVersion: 3,
  value: { ready: true },
} satisfies SharedProjection;

describe("generated runtime composition", () => {
  it("derives shared authority fields and rejects author-supplied authority", () => {
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

  it("owns duplicate reconciliation and version validation in the generated kernel", () => {
    const html = runtimeGlue();

    expect(html).toContain("localCommandAttempts");
    expect(html).toContain("localCommandLane");
    expect(html).toContain("runtime-local-command-identity-conflict");
    expect(html).toContain(
      "result.disposition !== 'committed' && result.disposition !== 'duplicate'",
    );
    expect(html).toContain("runtime-local-transition-version-invalid");
  });

  it("constructs exact capability clients inside each component scope", () => {
    const html = runtimeGlue();

    expect(html).toContain("createCapabilityClient");
    expect(html).not.toContain("const capabilityRegistry");
  });

  it("registers component cleanup directly with the root mount scope", () => {
    const html = runtimeGlue();

    expect(html).not.toContain("componentCleanup");
    expect(html).not.toContain("void result.catch");
    expect(html).toContain("lifecycle.defer(cleanup)");
  });
});
