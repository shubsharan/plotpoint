import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { compileProject, type CompiledProject } from "@plotpoint/compiler";
import { inspectRelease, openRelease } from "@plotpoint/protocol";

import { generatedReleaseEntryPath } from "../../src/release/entry-paths.js";
import { createExternalProject } from "../helpers/external-project.js";

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
  it("encodes printable registration IDs in generated paths while preserving logical IDs", async () => {
    const externalProject = await createExternalProject("minimal-local-puzzle");
    const replacements = new Map([
      ["minimal.solve.v1", "Solve!?"],
      ["minimal.player-state.v1", "Player/State"],
      ["minimal.puzzle-content.v1", "chapter/one"],
      ["minimal.solve-outcome.v1", "Outcome!Schema"],
      ["minimal.solve-payload.v1", "Payload+Schema"],
      ["minimal.puzzle.v1", "Progression.V1"],
      ["minimal.puzzle-card.v1", "Card.V1"],
      ["minimal.clue-image.v1", "Clue!?"],
    ]);
    const relativeFiles = [
      "plotpoint.project.json",
      "content/puzzle.json",
      "schemas/player-state.schema.json",
      "schemas/puzzle-content.schema.json",
      "schemas/solve-outcome.schema.json",
      "schemas/solve-payload.schema.json",
      "src/commands/solve.ts",
      "src/components/puzzle.ts",
      "src/progression/main.ts",
    ];

    try {
      await Promise.all([
        ...relativeFiles.map(async (relativePath) => {
          const path = join(externalProject.root, relativePath);
          let source = await readFile(path, "utf8");
          for (const [original, replacement] of replacements) {
            source = source.replaceAll(original, replacement);
          }
          await writeFile(path, source);
        }),
        writeFile(
          join(externalProject.root, "src/logic.ts"),
          'export const logic = Object.freeze({ selected: "logic" });\n',
        ),
        writeFile(
          join(externalProject.root, "src/presentation.ts"),
          'export const presentation = Object.freeze({ selected: "presentation" });\n',
        ),
      ]);
      const outputFile = join(externalProject.sandbox, "printable-ids.pprelease");
      const result = await compileProject({ projectRoot: externalProject.root, outputFile });
      if (result.kind !== "compiled") {
        throw new Error(`printable IDs were rejected: ${JSON.stringify(result.diagnostics)}`);
      }

      const opened = await openRelease(await readFile(outputFile));
      expect(opened.kind).toBe("opened");
      if (opened.kind !== "opened") return;
      const paths = opened.entries.map(({ path }) => path);
      expect(paths).toEqual(
        expect.arrayContaining([
          generatedReleaseEntryPath("aggregate-schema", "Player/State"),
          generatedReleaseEntryPath("schema", "chapter/one"),
          generatedReleaseEntryPath("progression", "Progression.V1"),
          generatedReleaseEntryPath("component", "Card.V1"),
          generatedReleaseEntryPath("content", "chapter/one"),
        ]),
      );
      expect(paths.every((path) => /^[a-z0-9./-]+$/.test(path))).toBe(true);
      expect(opened.manifest.aggregateSchemas[0]?.id).toBe("Player/State");
      const progression = opened.entries.find(
        ({ path }) => path === generatedReleaseEntryPath("progression", "Progression.V1"),
      );
      expect(JSON.parse(new TextDecoder().decode(progression?.bytes))).toMatchObject({
        id: "Progression.V1",
        aggregateSchema: "Player/State",
        commands: ["Solve!?"],
        content: ["chapter/one"],
        components: ["Card.V1"],
      });
      const logicBundle = opened.entries.find(({ kind }) => kind === "logic-bundle");
      const presentationBundle = opened.entries.find(({ kind }) => kind === "presentation-bundle");
      const logicModule = await import(
        `data:text/javascript;base64,${Buffer.from(logicBundle?.bytes ?? []).toString("base64")}`
      );
      const presentationModule = await import(
        `data:text/javascript;base64,${Buffer.from(presentationBundle?.bytes ?? []).toString("base64")}`
      );
      expect(logicModule.default).toEqual({ selected: "logic" });
      expect(Object.keys(logicModule.commands)).toEqual(["Solve!?"]);
      expect(Object.keys(logicModule.progressions)).toEqual(["Progression.V1"]);
      expect(presentationModule.default).toEqual({ selected: "presentation" });
      expect(Object.keys(presentationModule.components)).toEqual(["Card.V1"]);
    } finally {
      await externalProject.cleanup();
    }
  });

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
