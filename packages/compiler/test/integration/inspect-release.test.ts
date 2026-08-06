import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { compileProject } from "@plotpoint/compiler";
import {
  assessCompatibility,
  inspectRelease,
  type HostReleaseSupport,
  type ReleaseManifest,
} from "@plotpoint/protocol";

const goldenProjects = ["minimal-local-puzzle", "branching-media-tour", "co-op-game"] as const;

interface RegistryMetadata {
  readonly label: string;
  readonly channel: string;
  readonly projectId: string;
  readonly createdAt: string;
}

function fixtureRoot(project: (typeof goldenProjects)[number]): string {
  return fileURLToPath(new URL(`../../../../examples/releases/${project}/`, import.meta.url));
}

function supportedHost(manifest: ReleaseManifest): HostReleaseSupport {
  return {
    releaseFormatVersions: [manifest.releaseFormatVersion],
    hostApi: {
      major: manifest.hostApi.major,
      minor: manifest.hostApi.minimumMinor,
    },
    aggregateSchemas: manifest.aggregateSchemas.map((schema) => ({
      id: schema.id,
      kind: schema.kind,
      versions: [schema.version],
    })),
    capabilities: manifest.capabilities.map((capability) => ({
      id: capability.id,
      major: capability.major,
      minor: capability.minimumMinor,
    })),
  };
}

function expectIncompatibleCode(
  assessment: ReturnType<typeof assessCompatibility>,
  code: string,
): void {
  expect(assessment.kind).toBe("incompatible");
  if (assessment.kind === "incompatible") {
    expect(assessment.diagnostics.map((diagnostic) => diagnostic.code)).toContain(code);
  }
}

function expectCompatibilityMatrix(manifest: ReleaseManifest): void {
  const supported = supportedHost(manifest);
  expect(assessCompatibility(manifest, supported)).toEqual({ kind: "compatible" });

  expectIncompatibleCode(
    assessCompatibility(manifest, { ...supported, releaseFormatVersions: [] }),
    "release-format-unsupported",
  );
  expectIncompatibleCode(
    assessCompatibility(manifest, {
      ...supported,
      hostApi: { major: supported.hostApi.major + 1, minor: supported.hostApi.minor },
    }),
    "host-api-unsupported",
  );
  expectIncompatibleCode(
    assessCompatibility(manifest, { ...supported, aggregateSchemas: [] }),
    "aggregate-schema-unsupported",
  );
  if (manifest.capabilities.length > 0) {
    expectIncompatibleCode(
      assessCompatibility(manifest, { ...supported, capabilities: [] }),
      "capability-unsupported",
    );
  }
}

async function writeRegistryMetadata(path: string, metadata: RegistryMetadata): Promise<void> {
  await writeFile(path, JSON.stringify(metadata));
}

describe("source-free release inspection acceptance", () => {
  it.each(goldenProjects)(
    "compiles, removes, and inspects %s with operational metadata invariance",
    async (project) => {
      const sandbox = await mkdtemp(join(tmpdir(), `plotpoint-inspect-${project}-`));
      const projectRoot = join(sandbox, "external-project");
      const outputRoot = join(sandbox, "artifacts");
      const firstOutput = join(outputRoot, "first.pprelease");
      const secondOutput = join(outputRoot, "second.pprelease");
      const registryRecord = join(sandbox, "registry-metadata.json");

      try {
        await cp(fixtureRoot(project), projectRoot, { recursive: true });
        await mkdir(outputRoot, { recursive: true });

        await writeRegistryMetadata(registryRecord, {
          label: "preview",
          channel: "staging",
          projectId: `project-one-${project}`,
          createdAt: "2030-01-01T00:00:00.000Z",
        });
        const first = await compileProject({ projectRoot, outputFile: firstOutput });
        if (first.kind !== "compiled") {
          throw new Error(`first compile failed: ${JSON.stringify(first.diagnostics)}`);
        }
        expect(first.kind).toBe("compiled");

        await writeRegistryMetadata(registryRecord, {
          label: "production",
          channel: "stable",
          projectId: `project-two-${project}`,
          createdAt: "2040-12-31T23:59:59.999Z",
        });
        const second = await compileProject({ projectRoot, outputFile: secondOutput });
        if (second.kind !== "compiled") {
          throw new Error(`second compile failed: ${JSON.stringify(second.diagnostics)}`);
        }
        expect(second.kind).toBe("compiled");

        const firstBytes = await readFile(firstOutput);
        const secondBytes = await readFile(secondOutput);
        expect(secondBytes).toEqual(firstBytes);
        expect(second.releaseId).toBe(first.releaseId);
        expect(second.manifest).toEqual(first.manifest);

        // From here on the project and all author modules are unavailable.
        await rm(projectRoot, { recursive: true });
        const firstInspected = await inspectRelease(firstBytes);
        const secondInspected = await inspectRelease(secondBytes);
        expect(firstInspected).toEqual({
          kind: "inspected",
          releaseId: first.releaseId,
          manifest: first.manifest,
        });
        expect(secondInspected).toEqual(firstInspected);
        if (firstInspected.kind !== "inspected") {
          throw new Error(`source-free inspection failed: ${JSON.stringify(firstInspected)}`);
        }

        const inventoryKinds = new Set(firstInspected.manifest.inventory.map(({ kind }) => kind));
        expect(inventoryKinds).toEqual(
          new Set([
            "logic-bundle",
            "presentation-bundle",
            "aggregate-schema",
            "command-schema",
            "progression",
            "component-data",
            "content",
            "asset",
          ]),
        );
        expect(firstInspected.manifest.entrypoints).toEqual({
          logic: "bundles/logic.js",
          presentation: "bundles/presentation.js",
        });
        expectCompatibilityMatrix(firstInspected.manifest);
      } finally {
        await rm(sandbox, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
