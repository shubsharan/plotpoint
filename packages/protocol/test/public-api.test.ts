import { access, readdir, readFile } from "node:fs/promises";
import { describe, expect, expectTypeOf, it } from "vitest";

import packageJson from "../package.json" with { type: "json" };
import * as protocol from "@plotpoint/protocol";
import * as playerProtocol from "../src/player.js";
import {
  assessCompatibility,
  createReleaseArtifact,
  inspectGameRelease,
  inspectRelease,
  openRelease,
  verifyRelease,
  type CompatibilityAssessment,
  type HostReleaseSupport,
  type InspectedRelease,
  type OpenedRelease,
  type ReleaseArtifact,
  type ReleaseManifest,
  type VerifyReleaseInput,
  type VerifiedRelease,
} from "@plotpoint/protocol";

async function filesUnder(root: URL): Promise<readonly URL[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, root);
      if (entry.isDirectory()) return filesUnder(path);
      return entry.isFile() ? [path] : [];
    }),
  );
  return nested.flat();
}

async function exists(path: URL): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function relativeUrl(root: URL, file: URL): string {
  return decodeURIComponent(file.href.slice(root.href.length));
}

describe("protocol public API", () => {
  it("publishes compatibility constants only from their owning boundaries", () => {
    expect(protocol).toMatchObject({
      RELEASE_FORMAT_VERSION: 1,
      HOST_API_VERSION: { major: 1, minor: 1 },
      HOST_BRIDGE_VERSION: 1,
    });
    expect(protocol).not.toHaveProperty("CONTRACT_VERSIONS");
    expect(protocol).not.toHaveProperty("PROJECT_FORMAT_VERSION");
    expect(Object.isFrozen(protocol.HOST_API_VERSION)).toBe(true);
    expect(playerProtocol).toMatchObject({
      HOST_API_VERSION: { major: 1, minor: 1 },
      HOST_BRIDGE_VERSION: 1,
    });
    expect(playerProtocol).not.toHaveProperty("CONTRACT_VERSIONS");
    expect(playerProtocol).not.toHaveProperty("RELEASE_FORMAT_VERSION");
  });

  it("has no universal version catalog, superseded reader, or independent contract counters", async () => {
    const sourceRoot = new URL("../src/", import.meta.url);
    const files = (await filesUnder(sourceRoot)).filter((file) => file.pathname.endsWith(".ts"));
    const sources = await Promise.all(
      files.map(async (file) => ({ file, source: await readFile(file, "utf8") })),
    );

    expect(await exists(new URL("contract-versions.ts", sourceRoot))).toBe(false);
    expect(await exists(new URL("shared/report.ts", sourceRoot))).toBe(false);
    expect(sources.map(({ source }) => source).join("\n")).not.toMatch(
      /\bCONTRACT_VERSIONS\b|\bContractVersion(?:s|Catalog)?\b/,
    );

    const boundaryOwners = new Set(["player/bridge.ts", "release/types.ts"]);
    const independentCounters = sources.flatMap(({ file, source }) => {
      const owner = relativeUrl(sourceRoot, file);
      if (boundaryOwners.has(owner)) return [];
      return [...source.matchAll(/\b(?:readonly\s+)?(?:version|generation|revision)\??\s*:/g)].map(
        ([counter]) => `${owner}:${counter}`,
      );
    });
    expect(independentCounters).toEqual([]);
  });

  it("keeps repository-owned public names and logical IDs free of generation suffixes", async () => {
    const repositoryRoot = new URL("../../../", import.meta.url);
    const roots = [
      "apps/api/src",
      "apps/player/src",
      "packages/compiler/src",
      "packages/modules/src",
      "packages/protocol/src",
      "packages/runtime/src",
      "packages/testkit/src",
      "examples/releases",
      "docs/features/0005-unified-game-composition/contracts",
    ].map((path) => new URL(`${path}/`, repositoryRoot));
    const files = (await Promise.all(roots.map(filesUnder)))
      .flat()
      .filter((file) => /\.(?:json|md|ts|tsx)$/.test(file.pathname));
    const generationSuffix =
      /\b[A-Za-z][A-Za-z0-9]*(?:V|Generation)\d+\b|(?:^|[._/-])v\d+(?=$|[._/-])/g;
    const violations: string[] = [];
    for (const file of files) {
      const source = (await readFile(file, "utf8")).replaceAll("/v1", "/http-route");
      for (const match of source.matchAll(generationSuffix)) {
        violations.push(`${relativeUrl(repositoryRoot, file)}:${match[0]}`);
      }
      for (const match of relativeUrl(repositoryRoot, file).matchAll(generationSuffix)) {
        violations.push(`${relativeUrl(repositoryRoot, file)}:${match[0]}`);
      }
    }
    expect(violations.sort()).toEqual([]);
  });

  it("exports portable inspection and compatibility operations from the package root", () => {
    expectTypeOf(inspectRelease).returns.resolves.toMatchTypeOf<
      InspectedRelease | { kind: "invalid" }
    >();
    expectTypeOf(openRelease).returns.resolves.toMatchTypeOf<OpenedRelease | { kind: "invalid" }>();
    expectTypeOf(createReleaseArtifact).returns.resolves.toMatchTypeOf<
      ReleaseArtifact | { kind: "invalid" }
    >();
    expectTypeOf(assessCompatibility).parameter(0).toEqualTypeOf<ReleaseManifest>();
    expectTypeOf(assessCompatibility).parameter(1).toEqualTypeOf<HostReleaseSupport>();
    expectTypeOf(assessCompatibility).returns.toEqualTypeOf<CompatibilityAssessment>();
    expectTypeOf(verifyRelease).parameter(0).toEqualTypeOf<VerifyReleaseInput>();
    expectTypeOf(verifyRelease).returns.resolves.toMatchTypeOf<
      VerifiedRelease | { kind: "invalid" }
    >();
  });

  it("publishes only the root and explicit release-facing player surface", () => {
    expect(Object.keys(packageJson.exports)).toEqual([".", "./player"]);
    expect(packageJson.files).toEqual(["dist"]);
    expect(JSON.stringify(packageJson.exports)).not.toContain("compiler");
    expect(JSON.stringify(packageJson.exports)).not.toContain("*");
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

  it("exports only the plain composition, inspection, and report operations", () => {
    expect(protocol).toMatchObject({
      inspectGameRelease: expect.any(Function),
      isGamePlayReport: expect.any(Function),
    });
    expect(Object.keys(protocol)).not.toEqual(
      expect.arrayContaining([
        "inspectGameReleaseV1",
        "isGamePlayReportV1",
        "isPlayReport",
        "isSharedHuntReport",
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

  it("requires Game Composition before treating a release as playable", async () => {
    const artifact = await createReleaseArtifact({
      hostApi: { major: 1, minimumMinor: 0 },
      aggregateSchemas: [],
      capabilities: [],
      entrypoints: { logic: "bundles/logic.js", presentation: "bundles/presentation.js" },
      entries: [
        {
          path: "bundles/logic.js",
          kind: "logic-bundle",
          bytes: new TextEncoder().encode("export const aggregateModels = {}"),
        },
        {
          path: "bundles/presentation.js",
          kind: "presentation-bundle",
          bytes: new TextEncoder().encode(
            "export const application = {}; export const components = {}",
          ),
        },
      ],
    });
    if ("diagnostics" in artifact) throw new Error("composition-less release fixture invalid");

    await expect(inspectGameRelease(artifact.bytes)).resolves.toMatchObject({
      kind: "invalid",
      diagnostics: [expect.objectContaining({ code: "game-composition-missing" })],
    });
  });
});
