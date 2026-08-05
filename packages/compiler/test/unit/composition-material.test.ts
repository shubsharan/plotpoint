import { describe, expect, it } from "vitest";

import { buildCanonicalRegistries } from "../../src/composition/registries.js";
import { validateReferences } from "../../src/composition/validate-references.js";
import { validateAssets } from "../../src/validation/assets.js";
import { validateContent } from "../../src/validation/content.js";
import { validateSchemas } from "../../src/validation/schemas.js";
import type {
  CompilationSnapshot,
  ProjectConfiguration,
  SnapshotFile,
} from "../../src/project/config.js";

const encoder = new TextEncoder();

function configuration(): ProjectConfiguration {
  return {
    projectFormatVersion: 1,
    environment: "web",
    hostApi: { major: 1, minimumMinor: 0 },
    entries: {
      logic: { source: "src/logic.ts", export: "logic" },
      presentation: { source: "src/presentation.ts", export: "presentation" },
    },
    commands: [
      {
        id: "z-command",
        type: "solve",
        definition: { source: "src/solve.ts", export: "solve" },
        aggregateSchema: "player-state",
        payloadSchema: "solve-payload",
        outcomeSchema: "solve-outcome",
      },
      {
        id: "a-command",
        type: "hint",
        definition: { source: "src/hint.ts", export: "hint" },
        aggregateSchema: "player-state",
        payloadSchema: "hint-payload",
        outcomeSchema: "hint-outcome",
      },
    ],
    aggregateSchemas: [
      { id: "player-state", kind: "player", version: 1, path: "schemas/player.json" },
    ],
    schemas: [
      { id: "solve-outcome", path: "schemas/solve-outcome.json" },
      { id: "hint-payload", path: "schemas/hint-payload.json" },
      { id: "content", path: "schemas/content.json" },
      { id: "solve-payload", path: "schemas/solve-payload.json" },
      { id: "hint-outcome", path: "schemas/hint-outcome.json" },
    ],
    progressions: [
      {
        id: "main",
        version: 1,
        kind: "player",
        definition: { source: "src/progression.ts", export: "main" },
        aggregateSchema: "player-state",
        commands: ["z-command", "a-command"],
        content: ["puzzle"],
        components: ["card"],
      },
    ],
    components: [
      {
        id: "card",
        implementation: { source: "src/card.ts", export: "Card" },
        commands: ["z-command"],
        content: ["puzzle"],
        assets: ["clue"],
        capabilities: [],
      },
    ],
    content: [{ id: "puzzle", path: "content/puzzle.json", schema: "content" }],
    assets: [{ id: "clue", path: "assets/clue.txt", releasePath: "assets/clue.txt" }],
  };
}

function jsonFile(kind: SnapshotFile["kind"], projectPath: string, value: unknown): SnapshotFile {
  return { kind, projectPath, bytes: encoder.encode(JSON.stringify(value)) };
}

function snapshot(config = configuration()): CompilationSnapshot {
  const objectSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
  };
  const files = new Map<string, SnapshotFile>([
    [
      "schemas/player.json",
      jsonFile("schema", "schemas/player.json", {
        ...objectSchema,
        required: ["solved"],
        properties: { solved: { type: "boolean" } },
      }),
    ],
    ["schemas/solve-outcome.json", jsonFile("schema", "schemas/solve-outcome.json", objectSchema)],
    ["schemas/hint-payload.json", jsonFile("schema", "schemas/hint-payload.json", objectSchema)],
    [
      "schemas/content.json",
      jsonFile("schema", "schemas/content.json", {
        ...objectSchema,
        required: ["title"],
        properties: { title: { type: "string" } },
      }),
    ],
    ["schemas/solve-payload.json", jsonFile("schema", "schemas/solve-payload.json", objectSchema)],
    ["schemas/hint-outcome.json", jsonFile("schema", "schemas/hint-outcome.json", objectSchema)],
    ["content/puzzle.json", jsonFile("content", "content/puzzle.json", { title: "Puzzle" })],
    [
      "assets/clue.txt",
      { kind: "asset", projectPath: "assets/clue.txt", bytes: encoder.encode("clue") },
    ],
  ]);

  const registries = buildCanonicalRegistries(config);
  if (registries.kind !== "valid") throw new Error("expected registries");
  return {
    config,
    registries: registries.registries,
    files,
  };
}

describe("composition registries", () => {
  it("ordinally orders and deeply detaches every registry", () => {
    const config = configuration();
    const result = buildCanonicalRegistries(config);

    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") return;
    expect(result.registries.commands.map(({ id }) => id)).toEqual(["a-command", "z-command"]);
    expect(result.registries.schemas.map(({ id }) => id)).toEqual([
      "content",
      "hint-outcome",
      "hint-payload",
      "solve-outcome",
      "solve-payload",
    ]);
    expect(Object.isFrozen(result.registries.commands)).toBe(true);
    expect(Object.isFrozen(result.registries.commands[0]?.definition)).toBe(true);
    expect(Object.isFrozen(result.registries.progressions[0]?.commands)).toBe(true);
    expect(validateReferences(result.registries)).toEqual([]);
  });

  it("rejects duplicate identities before building a success-shaped registry", () => {
    const config = configuration();
    const result = buildCanonicalRegistries({
      ...config,
      content: [...config.content, { id: "puzzle", path: "content/other.json" }],
    });

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.diagnostics[0]?.code).toBe("composition-reference-duplicate");
    }
  });
});

describe("valid material", () => {
  it("canonicalizes schemas and schema-valid content and preserves non-empty asset bytes", () => {
    const project = snapshot();
    const schemas = validateSchemas(project);
    expect(schemas.kind).toBe("valid");
    if (schemas.kind !== "valid") return;

    const content = validateContent(project, schemas.schemas);
    const assets = validateAssets(project);

    expect(content.kind).toBe("valid");
    expect(assets.kind).toBe("valid");
    if (content.kind === "valid") {
      expect(new TextDecoder().decode(content.content[0]?.canonicalBytes)).toBe(
        '{"title":"Puzzle"}',
      );
    }
    if (assets.kind === "valid") {
      expect(new TextDecoder().decode(assets.assets[0]?.bytes)).toBe("clue");
    }
  });
});
