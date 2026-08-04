import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { compileProject, type CompiledProject } from "@plotpoint/compiler";
import { inspectRelease } from "@plotpoint/protocol";

const fixtureRoot = fileURLToPath(
  new URL("../../../../examples/releases/minimal-local-puzzle/", import.meta.url),
);
const expectedRelease = JSON.parse(
  await readFile(
    fileURLToPath(
      new URL("../fixtures/expected/minimal-local-puzzle/release.json", import.meta.url),
    ),
    "utf8",
  ),
) as { readonly releaseId: string; readonly manifest: unknown };

describe("complete immutable release acceptance", () => {
  it("emits identical source-independent bytes across twenty cwd and output contexts", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "plotpoint-release-acceptance-"));
    const originalCwd = process.cwd();
    const projectRoot = join(sandbox, "external-project");
    const outputRoot = join(sandbox, "outputs");

    try {
      await cp(fixtureRoot, projectRoot, { recursive: true });

      const results: CompiledProject[] = [];
      const artifacts: Uint8Array[] = [];
      for (let index = 0; index < 20; index += 1) {
        const cwd = join(sandbox, "working-directories", String(index % 3));
        const outputFile = join(outputRoot, `context-${index}`, "minimal.pprelease");
        await mkdir(cwd, { recursive: true });
        await mkdir(dirname(outputFile), { recursive: true });
        process.chdir(cwd);

        const result = await compileProject({ projectRoot, outputFile });

        expect(result.kind).toBe("compiled");
        if (result.kind !== "compiled") {
          throw new Error(
            `valid external fixture was rejected: ${JSON.stringify(result.diagnostics)}`,
          );
        }
        expect(result.outputFile).toBe(outputFile);
        results.push(result);
        artifacts.push(await readFile(outputFile));
      }

      const [firstResult] = results;
      const [firstArtifact] = artifacts;
      if (firstResult === undefined || firstArtifact === undefined) {
        throw new Error("twenty-build acceptance did not produce a baseline artifact");
      }
      expect(firstResult.releaseId).toBe(expectedRelease.releaseId);
      expect(firstResult.manifest).toEqual(expectedRelease.manifest);
      for (let index = 1; index < artifacts.length; index += 1) {
        const artifact = artifacts[index];
        const result = results[index];
        if (artifact === undefined || result === undefined) {
          throw new Error(`build context ${index} did not produce a result and artifact`);
        }
        expect(artifact).toEqual(firstArtifact);
        expect(result.releaseId).toBe(firstResult.releaseId);
        expect(result.manifest).toEqual(firstResult.manifest);
      }

      // Source and authoring dependencies are unavailable for every check below.
      await rm(projectRoot, { recursive: true });
      for (let index = 0; index < artifacts.length; index += 1) {
        const artifact = artifacts[index];
        const result = results[index];
        if (artifact === undefined || result === undefined) {
          throw new Error(`build context ${index} was lost before source-free inspection`);
        }
        const inspected = await inspectRelease(artifact);
        expect(inspected).toEqual({
          kind: "inspected",
          releaseId: result.releaseId,
          manifest: result.manifest,
        });
      }
    } finally {
      process.chdir(originalCwd);
      await rm(sandbox, { recursive: true, force: true });
    }
  }, 120_000);
});
