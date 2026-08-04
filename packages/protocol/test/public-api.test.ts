import { describe, expect, expectTypeOf, it } from "vitest";

import packageJson from "../package.json" with { type: "json" };
import * as protocol from "@plotpoint/protocol";
import {
  assessCompatibility,
  createReleaseArtifact,
  inspectRelease,
  openRelease,
  verifyRelease,
  type CompatibilityAssessment,
  type HostReleaseSupport,
  type InspectedRelease,
  type OpenedRelease,
  type ReleaseArtifact,
  type ReleaseManifestV1,
  type VerifyReleaseInput,
  type VerifiedRelease,
} from "@plotpoint/protocol";

describe("protocol public API", () => {
  it("exports portable inspection and compatibility operations from the package root", () => {
    expectTypeOf(inspectRelease).returns.resolves.toMatchTypeOf<
      InspectedRelease | { kind: "invalid" }
    >();
    expectTypeOf(openRelease).returns.resolves.toMatchTypeOf<OpenedRelease | { kind: "invalid" }>();
    expectTypeOf(createReleaseArtifact).returns.resolves.toMatchTypeOf<
      ReleaseArtifact | { kind: "invalid" }
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
    expect(Object.keys(protocol)).not.toEqual(
      expect.arrayContaining([
        "crc32",
        "encodeCanonicalJson",
        "sha256Digest",
        "validateReleaseManifest",
        "writeStoredZip",
      ]),
    );
  });

  it("constructs and opens verified immutable release entries", async () => {
    const logic = new TextEncoder().encode("export const logic = true;");
    const presentation = new TextEncoder().encode("export const view = true;");
    const artifact = await createReleaseArtifact({
      hostApi: { major: 1, minimumMinor: 0 },
      aggregateSchemas: [],
      capabilities: [],
      entrypoints: { logic: "bundles/logic.js", presentation: "bundles/presentation.js" },
      entries: [
        { path: "bundles/logic.js", kind: "logic-bundle", bytes: logic },
        { path: "bundles/presentation.js", kind: "presentation-bundle", bytes: presentation },
        { path: "content/example.json", kind: "content", value: { answer: 42 } },
      ],
    });
    expect(artifact).not.toHaveProperty("kind", "invalid");
    if ("diagnostics" in artifact) return;

    logic[0] = 0;
    const opened = await openRelease(artifact.bytes);
    expect(opened.kind).toBe("opened");
    if (opened.kind !== "opened") return;
    expect(opened.entries.map(({ path }) => path)).toEqual([
      "bundles/logic.js",
      "bundles/presentation.js",
      "content/example.json",
    ]);
    const exposed = opened.entries[0]?.bytes;
    if (exposed !== undefined) exposed[0] = 0;
    expect(opened.entries[0]?.bytes[0]).toBe("e".charCodeAt(0));
  });
});
