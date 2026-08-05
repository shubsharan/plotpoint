import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { buildCanonicalRegistries } from "../../src/composition/registries.js";
import type { ImportGraph } from "../../src/imports/resolve-graph.js";
import type {
  CompilationSnapshot,
  ProjectConfiguration,
  SnapshotFile,
} from "../../src/project/config.js";
import { validateAssets } from "../../src/validation/assets.js";
import {
  validateCapabilities,
  validateCompatibilityRequirements,
} from "../../src/validation/capabilities.js";
import { validateComponents } from "../../src/validation/components.js";
import { validateContent } from "../../src/validation/content.js";
import { validateSchemas } from "../../src/validation/schemas.js";

const encoder = new TextEncoder();
const fixtureRoot = new URL("../fixtures/projects/invalid/material/", import.meta.url);

async function fixture<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(new URL(path, fixtureRoot), "utf8")) as T;
}

function baseConfiguration(): ProjectConfiguration {
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
        id: "solve",
        type: "solve",
        definition: { source: "src/solve.ts", export: "solve" },
        aggregateSchema: "player",
        payloadSchema: "payload",
        outcomeSchema: "outcome",
      },
    ],
    aggregateSchemas: [{ id: "player", kind: "player", version: 1, path: "schemas/player.json" }],
    schemas: [
      { id: "content", path: "schemas/content.json" },
      { id: "outcome", path: "schemas/outcome.json" },
      { id: "payload", path: "schemas/payload.json" },
    ],
    progressions: [],
    components: [
      {
        id: "card",
        implementation: { source: "src/card.ts", export: "Card" },
        commands: ["solve"],
        content: ["puzzle"],
        assets: ["clue"],
        capabilities: [],
      },
    ],
    content: [{ id: "puzzle", path: "content/puzzle.json", schema: "content" }],
    assets: [{ id: "clue", path: "assets/clue.txt", releasePath: "assets/clue.txt" }],
  };
}

function jsonFile(kind: SnapshotFile["kind"], path: string, value: unknown): SnapshotFile {
  return { kind, projectPath: path, bytes: encoder.encode(JSON.stringify(value)) };
}

function snapshot(
  config: ProjectConfiguration,
  overrides: ReadonlyMap<string, SnapshotFile> = new Map(),
): CompilationSnapshot {
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
        properties: { solved: { type: "boolean" } },
      }),
    ],
    [
      "schemas/content.json",
      jsonFile("schema", "schemas/content.json", {
        ...objectSchema,
        required: ["title"],
        properties: { title: { type: "string" } },
      }),
    ],
    ["schemas/outcome.json", jsonFile("schema", "schemas/outcome.json", objectSchema)],
    ["schemas/payload.json", jsonFile("schema", "schemas/payload.json", objectSchema)],
    ["content/puzzle.json", jsonFile("content", "content/puzzle.json", { title: "Puzzle" })],
    [
      "assets/clue.txt",
      { kind: "asset", projectPath: "assets/clue.txt", bytes: encoder.encode("clue") },
    ],
  ]);
  for (const [path, file] of overrides) files.set(path, file);
  const registries = buildCanonicalRegistries(config);
  if (registries.kind !== "valid") throw new Error("expected canonical registries");
  return {
    config,
    registries: registries.registries,
    files,
  };
}

function presentationGraph(exports: readonly string[]): ImportGraph {
  return {
    environment: "presentation",
    entry: { source: "src/presentation.ts", export: "presentation" },
    nodes: [
      {
        path: "src/card.ts",
        bytes: encoder.encode("export function Card() {}"),
        analysis: { kind: "analyzed", path: "src/card.ts", exports, references: [] },
      },
    ],
    edges: [],
  };
}

describe("material validation failures", () => {
  it("reports a configured component export missing from the presentation graph", async () => {
    const testCase = await fixture<{ componentId: string; source: string; export: string }>(
      "component-missing-export/case.json",
    );
    const config = baseConfiguration();
    const project = snapshot({
      ...config,
      components: [
        {
          ...config.components[0]!,
          id: testCase.componentId,
          implementation: { source: testCase.source, export: testCase.export },
        },
      ],
    });

    const result = validateComponents(project, presentationGraph(["Card"]));
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.diagnostics.map(({ code }) => code)).toEqual(["component-export-missing"]);
    }
  });

  it("collects every independently missing component material reference", async () => {
    const testCase = await fixture<{
      componentId: string;
      missingCommand: string;
      missingContent: string;
      missingAsset: string;
      missingSchema: string;
    }>("missing-reference/case.json");
    const config = baseConfiguration();
    const project = snapshot({
      ...config,
      components: [
        {
          ...config.components[0]!,
          id: testCase.componentId,
          commands: [testCase.missingCommand],
          content: [testCase.missingContent],
          assets: [testCase.missingAsset],
        },
      ],
    });

    const result = validateComponents(project, presentationGraph(["Card"]));
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.diagnostics.map(({ code }) => code)).toEqual([
        "component-reference-missing",
        "component-reference-missing",
        "component-reference-missing",
      ]);
      expect(result.diagnostics.map(({ details }) => details.target)).toEqual([
        testCase.missingAsset,
        testCase.missingCommand,
        testCase.missingContent,
      ]);
    }

    const contentProject = snapshot({
      ...config,
      content: [
        {
          ...config.content[0]!,
          schema: testCase.missingSchema,
        },
      ],
    });
    const contentResult = validateContent(contentProject, new Map());
    expect(contentResult.kind).toBe("invalid");
    if (contentResult.kind === "invalid") {
      expect(contentResult.diagnostics[0]).toMatchObject({
        code: "content-reference-missing",
        details: { target: testCase.missingSchema },
      });
    }
  });

  it("rejects schema-invalid content with a stable content diagnostic", async () => {
    const invalidContent = await fixture<{ title: number }>("content-schema-mismatch/content.json");
    const project = snapshot(
      baseConfiguration(),
      new Map([
        ["content/puzzle.json", jsonFile("content", "content/puzzle.json", invalidContent)],
      ]),
    );
    const schemas = validateSchemas(project);
    if (schemas.kind !== "valid") throw new Error("expected schemas");

    const result = validateContent(project, schemas.schemas);
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.diagnostics[0]?.code).toBe("content-schema-invalid");
      expect(result.diagnostics[0]?.details).toMatchObject({
        schema: "content",
        instancePath: "/title",
      });
    }
  });

  it("rejects empty assets and case-equivalent duplicate release destinations", async () => {
    const empty = await fixture<{ bytes: readonly number[] }>("empty-asset/case.json");
    const duplicate = await fixture<{ first: string; second: string }>(
      "duplicate-destination/case.json",
    );
    const config = baseConfiguration();
    const project = snapshot(
      {
        ...config,
        assets: [
          { id: "first", path: "assets/clue.txt", releasePath: duplicate.first },
          { id: "second", path: "assets/second.txt", releasePath: duplicate.second },
        ],
      },
      new Map([
        [
          "assets/clue.txt",
          {
            kind: "asset",
            projectPath: "assets/clue.txt",
            bytes: Uint8Array.from(empty.bytes),
          },
        ],
        [
          "assets/second.txt",
          { kind: "asset", projectPath: "assets/second.txt", bytes: encoder.encode("second") },
        ],
      ]),
    );

    const result = validateAssets(project);
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.diagnostics.map(({ code }) => code)).toEqual([
        "asset-destination-duplicate",
        "asset-empty",
      ]);
    }
  });

  it("rejects conflicting capability majors and retains the highest compatible minor", async () => {
    const conflict = await fixture<{ id: string; firstMajor: number; secondMajor: number }>(
      "capability-conflict/case.json",
    );
    const config = baseConfiguration();
    const conflicting = snapshot({
      ...config,
      components: [
        {
          ...config.components[0]!,
          capabilities: [
            { id: conflict.id, major: conflict.firstMajor, minimumMinor: 3 },
            { id: conflict.id, major: conflict.secondMajor, minimumMinor: 1 },
          ],
        },
      ],
    });
    const conflictResult = validateCapabilities(conflicting);
    expect(conflictResult.kind).toBe("invalid");
    if (conflictResult.kind === "invalid") {
      expect(conflictResult.diagnostics[0]?.code).toBe("capability-major-conflict");
    }

    const compatible = snapshot({
      ...config,
      components: [
        {
          ...config.components[0]!,
          capabilities: [
            { id: conflict.id, major: 1, minimumMinor: 1 },
            { id: conflict.id, major: 1, minimumMinor: 4 },
          ],
        },
      ],
    });
    expect(validateCapabilities(compatible)).toMatchObject({
      kind: "valid",
      capabilities: [{ id: conflict.id, major: 1, minimumMinor: 4 }],
    });
  });

  it("rejects capability requirements outside the closed namespaced version model", async () => {
    const invalid = await fixture<{ id: string; major: number; minimumMinor: number }>(
      "capability-invalid/case.json",
    );
    const config = baseConfiguration();
    const project = snapshot({
      ...config,
      components: [
        {
          ...config.components[0]!,
          capabilities: [invalid],
        },
      ],
    });

    const result = validateCapabilities(project);
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.diagnostics[0]?.code).toBe("capability-invalid");
    }
  });

  it("rejects invalid host and aggregate compatibility declarations", async () => {
    const testCase = await fixture<{
      hostApi: { major: number; minimumMinor: number };
      aggregateVersion: number;
    }>("compatibility-invalid/case.json");
    const config = baseConfiguration();
    const project = snapshot({
      ...config,
      hostApi: testCase.hostApi,
      aggregateSchemas: [{ ...config.aggregateSchemas[0]!, version: testCase.aggregateVersion }],
    });

    const result = validateCompatibilityRequirements(project);
    expect(result.map(({ code }) => code)).toEqual([
      "compatibility-invalid",
      "compatibility-invalid",
      "compatibility-invalid",
    ]);
  });
});
