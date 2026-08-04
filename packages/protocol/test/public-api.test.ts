import { describe, expect, expectTypeOf, it } from "vitest";

import packageJson from "../package.json" with { type: "json" };
import {
  assessCompatibility,
  inspectRelease,
  verifyRelease,
  type CompatibilityAssessment,
  type HostReleaseSupport,
  type InspectedRelease,
  type ReleaseManifestV1,
  type VerifyReleaseInput,
  type VerifiedRelease,
} from "@plotpoint/protocol";

describe("protocol public API", () => {
  it("exports portable inspection and compatibility operations from the package root", () => {
    expectTypeOf(inspectRelease).returns.resolves.toMatchTypeOf<
      InspectedRelease | { kind: "invalid" }
    >();
    expectTypeOf(assessCompatibility).parameter(0).toEqualTypeOf<ReleaseManifestV1>();
    expectTypeOf(assessCompatibility).parameter(1).toEqualTypeOf<HostReleaseSupport>();
    expectTypeOf(assessCompatibility).returns.toEqualTypeOf<CompatibilityAssessment>();
    expectTypeOf(verifyRelease).parameter(0).toEqualTypeOf<VerifyReleaseInput>();
    expectTypeOf(verifyRelease).returns.resolves.toMatchTypeOf<
      VerifiedRelease | { kind: "invalid" }
    >();
  });

  it("publishes no supported compiler or deep-import surface", () => {
    expect(Object.keys(packageJson.exports)).toEqual(["."]);
    expect(packageJson.files).toEqual(["dist"]);
    expect(JSON.stringify(packageJson.exports)).not.toContain("compiler");
  });
});
