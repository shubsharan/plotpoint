import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { compileProject } from "@plotpoint/compiler";
import { computeReleaseId } from "@plotpoint/protocol";

import { createExternalProject } from "../helpers/external-project.js";

const goldenProjects = ["minimal-local-puzzle", "branching-media-tour", "co-op-game"] as const;

const buildsPerProject = 20;
const clockEpoch = Date.UTC(2030, 0, 1);

interface BuildEvidence {
  readonly run: number;
  readonly cwdContext: string;
  readonly outputContext: string;
  readonly tempContext: string;
  readonly clockContext: string;
  readonly byteLength: number;
  readonly byteDigest: string;
  readonly releaseId: string;
}

describe("golden release reproducibility", () => {
  it("keeps ambient definition metadata out of release identity", async () => {
    const externalProject = await createExternalProject("minimal-local-puzzle");
    try {
      const progressionPath = join(externalProject.root, "src/progression/main.ts");
      const original = await readFile(progressionPath, "utf8");
      const nondeterministic = original
        .replace(
          "export const puzzleProgression",
          "const volatileNodeId = `celebrate-${Math.random()}`;\n\nexport const puzzleProgression",
        )
        .replace(
          '{ nodeId: "celebrate", initialStatus: "locked" }',
          '{ nodeId: volatileNodeId, initialStatus: "locked" }',
        )
        .replace('targetNodeId: "celebrate"', "targetNodeId: volatileNodeId");
      expect(nondeterministic).not.toBe(original);
      await writeFile(progressionPath, nondeterministic);

      const outputs = ["ambient-a.pprelease", "ambient-b.pprelease"].map((name) =>
        join(externalProject.sandbox, name),
      );
      const results = [];
      for (const outputFile of outputs) {
        results.push(await compileProject({ projectRoot: externalProject.root, outputFile }));
      }
      expect(results.every(({ kind }) => kind === "compiled")).toBe(true);
      expect(await readFile(outputs[0]!)).toEqual(await readFile(outputs[1]!));
    } finally {
      await externalProject.cleanup();
    }
  });

  it.each(goldenProjects)(
    "retains identical byte and identity evidence for twenty %s builds",
    async (fixture) => {
      const externalProject = await createExternalProject(fixture);
      const originalCwd = process.cwd();
      const originalTmpdir = process.env.TMPDIR;
      const originalDateNow = Date.now;
      const evidence: BuildEvidence[] = [];
      let baselineBytes: Uint8Array | undefined;
      let baselineReleaseId: string | undefined;

      try {
        for (let index = 0; index < buildsPerProject; index += 1) {
          const cwdContext = `cwd-${index % 4}`;
          const outputContext = `output-${index % 5}`;
          const tempContext = `temp-${index % 4}`;
          const clock = clockEpoch + index * 86_400_000;
          const cwd = join(externalProject.sandbox, "working-directories", cwdContext);
          const temporaryRoot = join(externalProject.sandbox, "temporary-roots", tempContext);
          const outputFile = join(
            externalProject.sandbox,
            "release-outputs",
            outputContext,
            `build-${index}.pprelease`,
          );
          await Promise.all([
            mkdir(cwd, { recursive: true }),
            mkdir(temporaryRoot, { recursive: true }),
            mkdir(dirname(outputFile), { recursive: true }),
          ]);

          process.chdir(cwd);
          process.env.TMPDIR = temporaryRoot;
          Date.now = () => clock;

          const result = await compileProject({
            projectRoot: externalProject.root,
            outputFile,
          });
          if (result.kind !== "compiled") {
            throw new Error(
              `${fixture} build ${index} failed: ${JSON.stringify(result.diagnostics)}`,
            );
          }

          const bytes = await readFile(outputFile);
          const byteDigest = computeReleaseId(bytes);
          expect(computeReleaseId(bytes)).toBe(result.releaseId);

          if (baselineBytes === undefined) {
            baselineBytes = bytes;
            baselineReleaseId = result.releaseId;
          } else {
            expect(bytes).toEqual(baselineBytes);
            expect(result.releaseId).toBe(baselineReleaseId);
          }

          evidence.push({
            run: index + 1,
            cwdContext,
            outputContext,
            tempContext,
            clockContext: new Date(clock).toISOString(),
            byteLength: bytes.byteLength,
            byteDigest,
            releaseId: result.releaseId,
          });
        }

        expect(evidence).toHaveLength(buildsPerProject);
        expect(new Set(evidence.map(({ byteDigest }) => byteDigest)).size).toBe(1);
        expect(new Set(evidence.map(({ releaseId }) => releaseId)).size).toBe(1);
        expect(new Set(evidence.map(({ byteLength }) => byteLength)).size).toBe(1);
        expect(new Set(evidence.map(({ cwdContext }) => cwdContext)).size).toBeGreaterThan(1);
        expect(new Set(evidence.map(({ outputContext }) => outputContext)).size).toBeGreaterThan(1);
        expect(new Set(evidence.map(({ tempContext }) => tempContext)).size).toBeGreaterThan(1);
        expect(new Set(evidence.map(({ clockContext }) => clockContext)).size).toBe(
          buildsPerProject,
        );
      } finally {
        process.chdir(originalCwd);
        Date.now = originalDateNow;
        if (originalTmpdir === undefined) {
          delete process.env.TMPDIR;
        } else {
          process.env.TMPDIR = originalTmpdir;
        }
        await externalProject.cleanup();
      }
    },
    180_000,
  );
});
