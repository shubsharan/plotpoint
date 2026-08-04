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
});
