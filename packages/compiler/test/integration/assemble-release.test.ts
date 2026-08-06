import { describe, expect, it } from "vitest";

import { GAME_COMPOSITION_PATH, inspectGameRelease, inspectRelease } from "@plotpoint/protocol";

import { buildCanonicalRegistries } from "../../src/composition/registries.js";
import type {
  CompilationSnapshot,
  ProjectConfiguration,
  SnapshotFile,
} from "../../src/project/config.js";
import { assembleRelease } from "../../src/release/assemble.js";
import { generatedReleaseEntryPath } from "../../src/release/entry-paths.js";
import { validateAssets } from "../../src/validation/assets.js";
import { validateContent } from "../../src/validation/content.js";
import { validateSchemas } from "../../src/validation/schemas.js";
import { parseStoredZip } from "../../../protocol/src/release/zip-profile.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function jsonFile(kind: SnapshotFile["kind"], path: string, value: unknown): SnapshotFile {
  return { kind, projectPath: path, bytes: encoder.encode(JSON.stringify(value)) };
}

function createSnapshot(): CompilationSnapshot {
  const baseConfiguration: ProjectConfiguration = {
    projectFormatVersion: 1,
    environment: "web",
    hostApi: { major: 1, minimumMinor: 2 },
    application: {
      definition: { source: "src/private-presentation.ts", export: "application" },
      components: ["puzzle-card"],
    },
    aggregateModels: [
      {
        id: "player-model",
        authority: "local",
        kind: "player",
        stateSchema: "player-state",
        initializationSchema: "player-initialization",
        initializer: { source: "src/private-logic.ts", export: "initialize" },
        events: [],
        effects: [],
      },
    ],
    commands: [
      {
        id: "solve",
        type: "solve",
        execution: "local",
        definition: { source: "src/private-solve.ts", export: "solveCommand" },
        aggregateModel: "player-model",
        payloadSchema: "solve-payload",
        outcomeSchema: "solve-outcome",
      },
    ],
    schemas: [
      { id: "player-state", path: "schemas/private-player-state.json" },
      { id: "player-initialization", path: "schemas/private-initialization.json" },
      { id: "puzzle-content", path: "schemas/private-content.json" },
      { id: "solve-outcome", path: "schemas/private-outcome.json" },
      { id: "solve-payload", path: "schemas/private-payload.json" },
    ],
    progressions: [
      {
        id: "main-progression",
        definition: { source: "src/private-progression.ts", export: "puzzleProgression" },
        aggregateModel: "player-model",
      },
    ],
    components: [
      {
        id: "puzzle-card",
        implementation: { source: "src/private-component.ts", export: "PuzzleCard" },
        commands: ["solve"],
        content: ["puzzle"],
        assets: ["clue"],
        capabilities: [
          { id: "plotpoint.haptics", major: 1, minimumMinor: 0 },
          { id: "plotpoint.haptics", major: 1, minimumMinor: 2 },
        ],
      },
    ],
    content: [
      {
        id: "puzzle",
        path: "content/private-puzzle.json",
        schema: { id: "puzzle-content" },
      },
    ],
    assets: [{ id: "clue", path: "assets/private-clue.txt", releasePath: "assets/clue.txt" }],
  };
  const configuration = Object.freeze({
    ...baseConfiguration,
    projectId: "OPERATIONAL_PROJECT_ID",
    releaseLabel: "OPERATIONAL_RELEASE_LABEL",
    releaseChannel: "OPERATIONAL_RELEASE_CHANNEL",
    createdAt: "OPERATIONAL_TIMESTAMP",
  }) as ProjectConfiguration;
  const registries = buildCanonicalRegistries(configuration);
  if (registries.kind !== "valid") throw new Error("expected valid registries");

  const objectSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
  };
  const files = new Map<string, SnapshotFile>([
    [
      "schemas/private-player-state.json",
      jsonFile("schema", "schemas/private-player-state.json", {
        ...objectSchema,
        required: ["solved"],
        properties: { solved: { type: "boolean" } },
      }),
    ],
    [
      "schemas/private-initialization.json",
      jsonFile("schema", "schemas/private-initialization.json", objectSchema),
    ],
    [
      "schemas/private-content.json",
      jsonFile("schema", "schemas/private-content.json", {
        ...objectSchema,
        required: ["title"],
        properties: { title: { type: "string" } },
      }),
    ],
    [
      "schemas/private-outcome.json",
      jsonFile("schema", "schemas/private-outcome.json", objectSchema),
    ],
    [
      "schemas/private-payload.json",
      jsonFile("schema", "schemas/private-payload.json", objectSchema),
    ],
    [
      "content/private-puzzle.json",
      jsonFile("content", "content/private-puzzle.json", { title: "The Puzzle" }),
    ],
    [
      "assets/private-clue.txt",
      {
        kind: "asset",
        projectPath: "assets/private-clue.txt",
        bytes: encoder.encode("clue bytes"),
      },
    ],
  ]);

  return { config: configuration, registries: registries.registries, files };
}

async function assembleFixture(snapshot = createSnapshot()) {
  const schemas = validateSchemas(snapshot);
  if (schemas.kind !== "valid") throw new Error("expected valid schemas");
  const content = validateContent(snapshot, schemas.schemas);
  if (content.kind !== "valid") throw new Error("expected valid content");
  const assets = validateAssets(snapshot);
  if (assets.kind !== "valid") throw new Error("expected valid assets");

  return assembleRelease({
    snapshot,
    bundles: {
      logic: encoder.encode("export const aggregateModels = {};"),
      presentation: encoder.encode("export const application = {}; export const components = {};"),
    },
    schemas: schemas.schemas,
    content: content.content,
    assets: assets.assets,
    capabilities: [{ id: "plotpoint.haptics", major: 1, minimumMinor: 2 }],
  });
}

describe("release assembly", () => {
  it("assembles a complete ordinal inventory with a self-inspecting game catalog", async () => {
    const result = await assembleFixture();
    expect(result.kind).toBe("assembled");
    if (result.kind !== "assembled") return;

    const expectedInventory = [
      ["assets/clue.txt", "asset"],
      ["bundles/logic.js", "logic-bundle"],
      ["bundles/presentation.js", "presentation-bundle"],
      [generatedReleaseEntryPath("component", "puzzle-card"), "component-data"],
      [GAME_COMPOSITION_PATH, "content"],
      [generatedReleaseEntryPath("content", "puzzle"), "content"],
      [generatedReleaseEntryPath("progression", "main-progression"), "progression"],
      [generatedReleaseEntryPath("aggregate-schema", "player-state"), "aggregate-schema"],
      [generatedReleaseEntryPath("schema", "player-initialization"), "command-schema"],
      [generatedReleaseEntryPath("schema", "puzzle-content"), "command-schema"],
      [generatedReleaseEntryPath("schema", "solve-outcome"), "command-schema"],
      [generatedReleaseEntryPath("schema", "solve-payload"), "command-schema"],
    ];
    expect(result.artifact.manifest.inventory.map(({ path, kind }) => [path, kind])).toEqual(
      expectedInventory,
    );
    expect(result.artifact.manifest).toMatchObject({
      releaseFormatVersion: 1,
      hostApi: { major: 1, minimumMinor: 2 },
      aggregateSchemas: [
        {
          id: "player-state",
          kind: "player",
          version: 1,
          path: generatedReleaseEntryPath("aggregate-schema", "player-state"),
        },
      ],
      entrypoints: { logic: "bundles/logic.js", presentation: "bundles/presentation.js" },
      capabilities: [{ id: "plotpoint.haptics", major: 1, minimumMinor: 2 }],
    });

    const parsed = parseStoredZip(result.artifact.bytes);
    expect(parsed.kind).toBe("parsed");
    if (parsed.kind === "parsed") {
      expect(parsed.entries.map(({ path }) => path)).toEqual(
        [...expectedInventory.map(([path]) => path), "manifest.json"].sort(),
      );
    }
    await expect(inspectRelease(result.artifact.bytes)).resolves.toEqual({
      kind: "inspected",
      manifest: result.artifact.manifest,
      releaseId: result.artifact.releaseId,
    });
    await expect(inspectGameRelease(result.artifact.bytes)).resolves.toMatchObject({
      release: { kind: "inspected", releaseId: result.artifact.releaseId },
      gameComposition: {
        application: { components: ["puzzle-card"] },
        aggregateModels: [
          {
            id: "player-model",
            authority: "local",
            kind: "player",
            stateSchema: { id: "player-state" },
            initializationSchema: { id: "player-initialization" },
          },
        ],
        commands: [{ id: "solve", execution: "local", aggregateModel: "player-model" }],
      },
    });
  });

  it("emits config-derived descriptors without reverse references or entry versions", async () => {
    const result = await assembleFixture();
    expect(result.kind).toBe("assembled");
    if (result.kind !== "assembled") return;
    const parsed = parseStoredZip(result.artifact.bytes);
    expect(parsed.kind).toBe("parsed");
    if (parsed.kind !== "parsed") return;
    const progression = parsed.entries.find(
      ({ path }) => path === generatedReleaseEntryPath("progression", "main-progression"),
    );

    expect(JSON.parse(decoder.decode(progression?.bytes))).toEqual({
      id: "main-progression",
      aggregateModel: "player-model",
    });
  });

  it("keeps operational metadata and author source paths outside every artifact entry", async () => {
    const result = await assembleFixture();
    expect(result.kind).toBe("assembled");
    if (result.kind !== "assembled") return;
    const parsed = parseStoredZip(result.artifact.bytes);
    expect(parsed.kind).toBe("parsed");
    if (parsed.kind !== "parsed") return;

    const emittedText = parsed.entries
      .map(({ path, bytes }) => `${path}\n${decoder.decode(bytes)}`)
      .join("\n");
    for (const forbidden of [
      "OPERATIONAL_PROJECT_ID",
      "OPERATIONAL_RELEASE_LABEL",
      "OPERATIONAL_RELEASE_CHANNEL",
      "OPERATIONAL_TIMESTAMP",
      "OPERATIONAL_SOURCE_ROOT",
      "OPERATIONAL_BUILD_HOST",
      "src/private-logic.ts",
      "src/private-presentation.ts",
      "src/private-solve.ts",
      "src/private-progression.ts",
      "src/private-component.ts",
    ]) {
      expect(emittedText, `artifact contains forbidden metadata: ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });
});
