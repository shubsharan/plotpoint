import { describe, expect, it } from "vitest";

import { allowRuntimeNavigation, buildRuntimeBootstrap } from "../src/runtime/bootstrap";

describe("trusted runtime bootstrap", () => {
  it("locks remote connectivity and safely embeds verified sources", () => {
    const html = buildRuntimeBootstrap({
      logicSource: "export default '</script>'",
      presentationSource: "export default { mount() {} }",
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
    });

    expect(html, "runtime-composition-handle-validation-missing").toContain(
      "runtime-application-handle-invalid",
    );
    expect(html).toContain("applicationHandle.unmount");
  });
});
