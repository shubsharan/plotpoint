import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { compileProject } from "@plotpoint/compiler";
import { inspectGameRelease, openRelease } from "@plotpoint/protocol";

import { generatedReleaseEntryPath } from "../../src/release/entry-paths.js";
import {
  createExternalProject,
  releaseExampleProjects,
  type ReleaseExampleProject,
} from "../helpers/external-project.js";

interface ReleaseMatrixExpectation {
  readonly hostApi: { readonly major: number; readonly minimumMinor: number };
  readonly capabilityIds: readonly string[];
  readonly componentCount: number;
  readonly localModelCount: number;
  readonly serverModelCount: number;
  readonly progressionCount: number;
  readonly trustedMechanic: string | null;
}

interface ExpectedRelease {
  readonly releaseId: string;
  readonly manifest: unknown;
}

const expectedMatrix = JSON.parse(
  await readFile(new URL("../fixtures/expected/release-matrix.json", import.meta.url), "utf8"),
) as Record<ReleaseExampleProject, ReleaseMatrixExpectation>;

describe("complete immutable release acceptance", () => {
  it("supplies the generated runtime root without authored runtime imports", async () => {
    const externalProject = await createExternalProject("minimal-local-puzzle");
    try {
      const configPath = join(externalProject.root, "plotpoint.project.json");
      const config = JSON.parse(await readFile(configPath, "utf8"));
      config.application.components = [];
      config.commands = [];
      config.progressions = [];
      config.components = [];
      config.schemas.push({ id: "scalar-content", path: "schemas/scalar-content.schema.json" });
      config.content.push({
        id: "scalar-content-value",
        path: "content/scalar-content.json",
        schema: { id: "scalar-content" },
      });
      await Promise.all([
        writeFile(configPath, JSON.stringify(config, null, 2)),
        writeFile(
          join(externalProject.root, "src/initial-state.ts"),
          "export function initializeMinimal() { return { attempts: 0, solved: false }; }\n",
        ),
        writeFile(
          join(externalProject.root, "schemas/scalar-content.schema.json"),
          JSON.stringify({
            $schema: "https://json-schema.org/draft/2020-12/schema",
            type: "string",
          }),
        ),
        writeFile(join(externalProject.root, "content/scalar-content.json"), '"allowed"'),
      ]);

      await expect(
        compileProject({
          projectRoot: externalProject.root,
          outputFile: join(externalProject.sandbox, "compiler-owned-runtime.pprelease"),
        }),
      ).resolves.toMatchObject({ kind: "compiled" });
    } finally {
      await externalProject.cleanup();
    }
  });

  it("preserves __proto__ map keys and complete standalone schema semantics", async () => {
    const externalProject = await createExternalProject("minimal-local-puzzle");
    try {
      const replacements = new Map([
        ["minimal.player", "__proto__"],
        ["minimal.puzzle-card", "__proto__"],
      ]);
      for (const relativePath of [
        "plotpoint.project.json",
        "src/application.ts",
        "src/components/puzzle.ts",
      ]) {
        const path = join(externalProject.root, relativePath);
        let source = await readFile(path, "utf8");
        for (const [original, replacement] of [...replacements].sort(
          ([left], [right]) => right.length - left.length,
        )) {
          source = source.replaceAll(original, replacement);
        }
        await writeFile(path, source);
      }
      const configPath = join(externalProject.root, "plotpoint.project.json");
      const config = JSON.parse(await readFile(configPath, "utf8"));
      config.commands[0].type = "__proto__";
      await writeFile(configPath, JSON.stringify(config, null, 2));
      const commandPath = join(externalProject.root, "src/commands/solve.ts");
      await writeFile(
        commandPath,
        (await readFile(commandPath, "utf8")).replace(
          'commandType: "solve"',
          'commandType: "__proto__"',
        ),
      );
      await writeFile(
        join(externalProject.root, "schemas/solve-payload.schema.json"),
        JSON.stringify({
          $schema: "https://json-schema.org/draft/2020-12/schema",
          description: 'export require("literal") import("literal")',
          type: "object",
          additionalProperties: false,
          required: ["answer", "metadata", "tags"],
          properties: {
            answer: { type: "string", minLength: 1 },
            metadata: { const: { a: 1, b: 0 } },
            tags: {
              type: "array",
              uniqueItems: true,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["value"],
                properties: { value: { type: "integer" } },
              },
            },
          },
        }),
      );

      const outputFile = join(externalProject.sandbox, "adversarial-ids.pprelease");
      const result = await compileProject({ projectRoot: externalProject.root, outputFile });
      if (result.kind !== "compiled") {
        throw new Error(`adversarial project was rejected: ${JSON.stringify(result.diagnostics)}`);
      }
      const opened = await openRelease(await readFile(outputFile));
      if (opened.kind !== "opened") throw new Error("adversarial release did not open");
      const logicBundle = opened.entries.find(({ kind }) => kind === "logic-bundle");
      const presentationBundle = opened.entries.find(({ kind }) => kind === "presentation-bundle");
      const logicModule = await import(
        `data:text/javascript;base64,${Buffer.from(logicBundle?.bytes ?? []).toString("base64")}`
      );
      const presentationModule = await import(
        `data:text/javascript;base64,${Buffer.from(presentationBundle?.bytes ?? []).toString("base64")}`
      );
      expect(Object.keys(logicModule.aggregateModels)).toEqual(["__proto__"]);
      const model = logicModule.aggregateModels["__proto__"];
      expect(Object.keys(model.commandContracts)).toEqual(["__proto__"]);
      expect(Object.keys(presentationModule.components)).toEqual(["__proto__"]);

      const source = {
        tags: [{ value: 1 }, { value: 2 }],
        metadata: { b: -0, a: 1 },
        answer: "echo",
      };
      const validation = model.commandContracts["__proto__"].payloadSchema.validate(source);
      expect(validation.valid).toBe(true);
      if (!validation.valid) return;
      expect(validation.value).not.toBe(source);
      expect(validation.value).toEqual({
        answer: "echo",
        metadata: { a: 1, b: 0 },
        tags: [{ value: 1 }, { value: 2 }],
      });
      expect(Object.isFrozen(validation.value)).toBe(true);
      expect(Object.isFrozen(validation.value.metadata)).toBe(true);
      source.metadata.a = 9;
      expect(validation.value.metadata).toEqual({ a: 1, b: 0 });

      const customPrototype = Object.assign(Object.create({ inherited: true }), source);
      expect(
        model.commandContracts["__proto__"].payloadSchema.validate(customPrototype),
      ).toMatchObject({
        valid: false,
        diagnostics: [{ code: "canonical-value-invalid" }],
      });
    } finally {
      await externalProject.cleanup();
    }
  });

  it("encodes printable registration IDs in generated paths while preserving logical IDs", async () => {
    const externalProject = await createExternalProject("minimal-local-puzzle");
    const replacements = new Map([
      ["minimal.solve", "Solve!?"],
      ["minimal.player-state", "Player/State"],
      ["minimal.player", "Player"],
      ["minimal.puzzle-content", "chapter/one"],
      ["minimal.puzzle-data", "Progression!-data"],
      ["minimal.solve-outcome", "Outcome!Schema"],
      ["minimal.solve-payload", "Payload+Schema"],
      ["minimal.puzzle-card", "Card?"],
      ["minimal.puzzle", "Progression!"],
      ["minimal.clue-image", "Clue!?"],
    ]);
    const relativeFiles = [
      "plotpoint.project.json",
      "content/puzzle.json",
      "schemas/player-state.schema.json",
      "schemas/puzzle-content.schema.json",
      "schemas/solve-outcome.schema.json",
      "schemas/solve-payload.schema.json",
      "src/application.ts",
      "src/commands/solve.ts",
      "src/components/puzzle.ts",
      "src/initial-state.ts",
      "src/progression/main.ts",
    ];

    try {
      await Promise.all(
        relativeFiles.map(async (relativePath) => {
          const path = join(externalProject.root, relativePath);
          let source = await readFile(path, "utf8");
          for (const [original, replacement] of [...replacements].sort(
            ([left], [right]) => right.length - left.length,
          )) {
            source = source.replaceAll(original, replacement);
          }
          await writeFile(path, source);
        }),
      );
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
          generatedReleaseEntryPath("progression", "Progression!"),
          generatedReleaseEntryPath("component", "Card?"),
          generatedReleaseEntryPath("content", "Progression!-data"),
        ]),
      );
      expect(paths.every((path) => /^[a-z0-9./-]+$/.test(path))).toBe(true);
      expect(opened.manifest.aggregateSchemas[0]?.id).toBe("Player/State");
      const progression = opened.entries.find(
        ({ path }) => path === generatedReleaseEntryPath("progression", "Progression!"),
      );
      expect(JSON.parse(new TextDecoder().decode(progression?.bytes))).toEqual({
        id: "Progression!",
        aggregateModel: "Player",
      });
      const logicBundle = opened.entries.find(({ kind }) => kind === "logic-bundle");
      const presentationBundle = opened.entries.find(({ kind }) => kind === "presentation-bundle");
      const logicModule = await import(
        `data:text/javascript;base64,${Buffer.from(logicBundle?.bytes ?? []).toString("base64")}`
      );
      const presentationModule = await import(
        `data:text/javascript;base64,${Buffer.from(presentationBundle?.bytes ?? []).toString("base64")}`
      );
      expect(Object.keys(logicModule)).toEqual(["aggregateModels"]);
      expect(Object.keys(logicModule.aggregateModels)).toEqual(["Player"]);
      const executableModel = logicModule.aggregateModels.Player;
      expect(executableModel).toMatchObject({
        modelId: "Player",
        stateSchema: {
          id: "Player/State",
          schemaDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        },
        initializationSchema: {
          id: "chapter/one",
          schemaDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        },
        commandContracts: {
          solve: {
            registrationId: "Solve!?",
            payloadSchema: { id: "Payload+Schema" },
            outcomeSchema: { id: "Outcome!Schema" },
          },
        },
        progression: { graphId: "Progression!" },
      });
      expect(executableModel.initialize).toEqual(expect.any(Function));
      expect(executableModel.execute).toEqual(expect.any(Function));
      const inventoryDigest = (path: string) =>
        opened.manifest.inventory.find((entry) => entry.path === path)?.digest;
      expect(executableModel.stateSchema.schemaDigest).toBe(
        inventoryDigest(generatedReleaseEntryPath("aggregate-schema", "Player/State")),
      );
      expect(executableModel.initializationSchema.schemaDigest).toBe(
        inventoryDigest(generatedReleaseEntryPath("schema", "chapter/one")),
      );
      expect(executableModel.commandContracts.solve.payloadSchema.schemaDigest).toBe(
        inventoryDigest(generatedReleaseEntryPath("schema", "Payload+Schema")),
      );
      expect(executableModel.commandContracts.solve.outcomeSchema.schemaDigest).toBe(
        inventoryDigest(generatedReleaseEntryPath("schema", "Outcome!Schema")),
      );
      expect(Object.keys(presentationModule)).toEqual(["application", "components"]);
      expect(Object.keys(presentationModule.application)).toEqual(["mount"]);
      expect(Object.keys(presentationModule.components)).toEqual(["Card?"]);
    } finally {
      await externalProject.cleanup();
    }
  });

  it.each(releaseExampleProjects)(
    "emits golden, reproducible, source-independent output for %s",
    async (project) => {
      const externalProject = await createExternalProject(project);
      const expected = expectedMatrix[project];
      const expectedRelease = JSON.parse(
        await readFile(
          new URL(`../fixtures/expected/${project}/release.json`, import.meta.url),
          "utf8",
        ),
      ) as ExpectedRelease;
      const firstOutput = join(externalProject.sandbox, `${project}-first.pprelease`);
      const secondOutput = join(externalProject.sandbox, `${project}-second.pprelease`);
      try {
        const first = await compileProject({
          projectRoot: externalProject.root,
          outputFile: firstOutput,
        });
        if (first.kind !== "compiled") {
          throw new Error(`${project} compile failed: ${JSON.stringify(first.diagnostics)}`);
        }
        const second = await compileProject({
          projectRoot: externalProject.root,
          outputFile: secondOutput,
        });
        if (second.kind !== "compiled") {
          throw new Error(
            `${project} repeat compile failed: ${JSON.stringify(second.diagnostics)}`,
          );
        }

        const firstBytes = await readFile(firstOutput);
        const secondBytes = await readFile(secondOutput);
        expect(secondBytes).toEqual(firstBytes);
        expect(second.releaseId).toBe(first.releaseId);
        expect(first.releaseId).toBe(expectedRelease.releaseId);
        expect(first.manifest).toEqual(expectedRelease.manifest);

        const inspected = await inspectGameRelease(firstBytes);
        if ("kind" in inspected) {
          throw new Error(`${project} inspection failed: ${JSON.stringify(inspected.diagnostics)}`);
        }
        const composition = inspected.gameComposition;
        expect({
          hostApi: inspected.release.manifest.hostApi,
          capabilityIds: inspected.release.manifest.capabilities.map(({ id }) => id),
          componentCount: composition.components.length,
          localModelCount: composition.aggregateModels.filter(
            ({ authority }) => authority === "local",
          ).length,
          serverModelCount: composition.aggregateModels.filter(
            ({ authority }) => authority === "server",
          ).length,
          progressionCount: composition.progressions.length,
          trustedMechanic: composition.trustedMechanic?.id ?? null,
        }).toEqual(expected);

        expect(inspected.release).toEqual({
          kind: "inspected",
          releaseId: first.releaseId,
          manifest: first.manifest,
        });
      } finally {
        await externalProject.cleanup();
      }
    },
    120_000,
  );
});
