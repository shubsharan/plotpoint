import { describe, expect, it } from "vitest";

import type { GameComposition } from "@plotpoint/protocol";

import { allowRuntimeNavigation, buildRuntimeBootstrap } from "../src/runtime/bootstrap";

const gameComposition = {
  application: { components: [] },
  aggregateModels: [
    {
      id: "example.player",
      authority: "local",
      kind: "player",
      stateSchema: { id: "example.state" },
      initializationSchema: { id: "example.initialization" },
      events: [],
      effects: [],
    },
  ],
  commands: [],
  progressions: [],
  components: [],
  resources: [
    { id: "example.state", role: "schema", path: "schemas/example.state.json" },
    {
      id: "example.initialization",
      role: "schema",
      path: "schemas/example.initialization.json",
    },
  ],
} satisfies GameComposition;

describe("trusted runtime bootstrap", () => {
  it("locks remote connectivity and safely embeds verified sources", () => {
    const html = buildRuntimeBootstrap({
      logicSource: "export default '</script>'",
      presentationSource: "export default { mount() {} }",
      gameComposition,
    });
    expect(html).toContain("connect-src 'none'");
    expect(html).not.toContain("export default '</script>'");
    expect(allowRuntimeNavigation("https://example.com")).toBe(false);
    expect(allowRuntimeNavigation("blob:runtime")).toBe(true);
  });

  it("selects and statically validates the named application lifecycle", () => {
    const html = buildRuntimeBootstrap({
      logicSource: "export const aggregateModels = Object.freeze({});",
      presentationSource:
        "export const application = Object.freeze({ mount() { throw new Error('must-not-run'); } });",
      gameComposition,
    });

    expect(html, "runtime-composition-static-application-validation-missing").toContain(
      "presentationModule.application",
    );
    expect(html).not.toContain("presentationModule.default");
  });

  it("validates the application handle before exposing a mounted runtime", () => {
    const html = buildRuntimeBootstrap({
      logicSource: "export const aggregateModels = Object.freeze({});",
      presentationSource:
        "export const application = Object.freeze({ mount() { return Object.freeze({}); } });",
      gameComposition,
    });

    expect(html, "runtime-composition-handle-validation-missing").toContain(
      "runtime-application-handle-invalid",
    );
    expect(html).toContain("applicationHandle.unmount");
  });

  it("reconciles an accepted duplicate after response loss", () => {
    const html = buildRuntimeBootstrap({
      logicSource: "export const aggregateModels = Object.freeze({});",
      presentationSource:
        "export const application = Object.freeze({ mount() { return { unmount() {} }; } }); export const components = Object.freeze({});",
      gameComposition,
    });

    expect(html).toContain("if (result.terminal === 'accepted')");
    expect(html).not.toContain(
      "if (result.disposition === 'committed' && result.terminal === 'accepted')",
    );
  });
});
