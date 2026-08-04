import { describe, expect, it } from "vitest";

import { inspectRelease } from "@plotpoint/protocol";

import { buildCanonicalRegistries } from "../../src/composition/registries.js";
import type {
  CompilationSnapshot,
  ProjectConfigurationV1,
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
  const baseConfiguration: ProjectConfigurationV1 = {
    projectFormatVersion: 1,
    environment: "web",
    hostApi: { major: 1, minimumMinor: 2 },
    entries: {
      logic: { source: "src/private-logic.ts", export: "logic" },
      presentation: { source: "src/private-presentation.ts", export: "presentation" },
    },
    commands: [
      {
        id: "solve.v1",
        type: "solve",
        definition: { source: "src/private-solve.ts", export: "solveCommand" },
        aggregateSchema: "player-state.v1",
        payloadSchema: "solve-payload.v1",
        outcomeSchema: "solve-outcome.v1",
      },
    ],
    aggregateSchemas: [
      {
        id: "player-state.v1",
        kind: "player",
        version: 1,
        path: "schemas/private-player-state.json",
      },
    ],
    schemas: [
      { id: "puzzle-content.v1", path: "schemas/private-content.json" },
      { id: "solve-outcome.v1", path: "schemas/private-outcome.json" },
      { id: "solve-payload.v1", path: "schemas/private-payload.json" },
    ],
    progressions: [
      {
        id: "puzzle.v1",
        version: 1,
        kind: "player",
        definition: { source: "src/private-progression.ts", export: "puzzleProgression" },
        aggregateSchema: "player-state.v1",
        commands: ["solve.v1"],
        content: ["puzzle.v1"],
        components: ["puzzle-card.v1"],
      },
    ],
    components: [
      {
        id: "puzzle-card.v1",
        implementation: { source: "src/private-component.ts", export: "PuzzleCard" },
        commands: ["solve.v1"],
        content: ["puzzle.v1"],
        assets: ["clue.v1"],
        capabilities: [
          { id: "plotpoint.haptics", major: 1, minimumMinor: 0 },
          { id: "plotpoint.haptics", major: 1, minimumMinor: 2 },
        ],
      },
    ],
    content: [
      { id: "puzzle.v1", path: "content/private-puzzle.json", schema: "puzzle-content.v1" },
    ],
    assets: [{ id: "clue.v1", path: "assets/private-clue.txt", releasePath: "assets/clue.txt" }],
  };
  const configuration = Object.freeze({
    ...baseConfiguration,
    projectId: "OPERATIONAL_PROJECT_ID",
    releaseLabel: "OPERATIONAL_RELEASE_LABEL",
    releaseChannel: "OPERATIONAL_RELEASE_CHANNEL",
    createdAt: "OPERATIONAL_TIMESTAMP",
  }) as ProjectConfigurationV1;
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

  return {
    config: configuration,
    registries: registries.registries,
    files,
  };
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
      logic: encoder.encode("export const logic = true;"),
      presentation: encoder.encode("export const presentation = true;"),
    },
    aggregateSchemas: schemas.aggregateSchemas,
    schemas: schemas.schemas,
    content: content.content,
    assets: assets.assets,
    capabilities: [{ id: "plotpoint.haptics", major: 1, minimumMinor: 2 }],
  });
}

describe("release assembly", () => {
  it("assembles a complete ordinal inventory that independently self-inspects", async () => {
    const result = await assembleFixture();
    expect(result.kind).toBe("assembled");
    if (result.kind !== "assembled") return;

    const expectedInventory = [
      ["assets/clue.txt", "asset"],
      ["bundles/logic.js", "logic-bundle"],
      ["bundles/presentation.js", "presentation-bundle"],
      [generatedReleaseEntryPath("component", "puzzle-card.v1"), "component-data"],
      [generatedReleaseEntryPath("content", "puzzle.v1"), "content"],
      [generatedReleaseEntryPath("progression", "puzzle.v1"), "progression"],
      [generatedReleaseEntryPath("aggregate-schema", "player-state.v1"), "aggregate-schema"],
      [generatedReleaseEntryPath("schema", "puzzle-content.v1"), "command-schema"],
      [generatedReleaseEntryPath("schema", "solve-outcome.v1"), "command-schema"],
      [generatedReleaseEntryPath("schema", "solve-payload.v1"), "command-schema"],
    ];
    expect(result.artifact.manifest.inventory.map(({ path, kind }) => [path, kind])).toEqual(
      expectedInventory,
    );
    expect(result.artifact.manifest).toMatchObject({
      releaseFormatVersion: 1,
      hostApi: { major: 1, minimumMinor: 2 },
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
  });

  it("emits config-derived progression descriptors without inspected ambient values", async () => {
    const result = await assembleFixture();
    expect(result.kind).toBe("assembled");
    if (result.kind !== "assembled") return;
    const parsed = parseStoredZip(result.artifact.bytes);
    expect(parsed.kind).toBe("parsed");
    if (parsed.kind !== "parsed") return;
    const progression = parsed.entries.find(
      ({ path }) => path === generatedReleaseEntryPath("progression", "puzzle.v1"),
    );

    expect(JSON.parse(decoder.decode(progression?.bytes))).toEqual({
      id: "puzzle.v1",
      version: 1,
      kind: "player",
      aggregateSchema: "player-state.v1",
      commands: ["solve.v1"],
      content: ["puzzle.v1"],
      components: ["puzzle-card.v1"],
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

  it("keeps equal aggregate and general schema IDs in separate release entries", async () => {
    const baseline = createSnapshot();
    const sharedId = baseline.config.aggregateSchemas[0]?.id;
    if (sharedId === undefined) throw new Error("fixture aggregate schema missing");
    const configuration = {
      ...baseline.config,
      schemas: baseline.config.schemas.map((schema, index) =>
        index === 0 ? { ...schema, id: sharedId } : schema,
      ),
      content: baseline.config.content.map((content) => ({ ...content, schema: sharedId })),
    };
    const registries = buildCanonicalRegistries(configuration);
    if (registries.kind !== "valid") throw new Error("expected colliding schema registries");
    const snapshot: CompilationSnapshot = {
      ...baseline,
      config: configuration,
      registries: registries.registries,
    };

    const validated = validateSchemas(snapshot);
    expect(validated.kind).toBe("valid");
    if (validated.kind !== "valid") return;
    expect(validated.aggregateSchemas.get(sharedId)?.path).toBe(
      "schemas/private-player-state.json",
    );
    expect(validated.schemas.get(sharedId)?.path).toBe("schemas/private-content.json");

    const result = await assembleFixture(snapshot);
    expect(result.kind).toBe("assembled");
    if (result.kind !== "assembled") return;
    const parsed = parseStoredZip(result.artifact.bytes);
    expect(parsed.kind).toBe("parsed");
    if (parsed.kind !== "parsed") return;
    const entries = new Map(
      parsed.entries.map((entry) => [entry.path, decoder.decode(entry.bytes)]),
    );

    expect(entries.get(generatedReleaseEntryPath("aggregate-schema", sharedId))).toContain(
      '"solved"',
    );
    expect(entries.get(generatedReleaseEntryPath("schema", sharedId))).toContain('"title"');
  });
});
