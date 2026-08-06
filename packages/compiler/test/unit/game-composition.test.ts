import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { openRelease } from "@plotpoint/protocol";

import { inspectDefinitionBundle } from "../../src/composition/inspect-definitions.js";
import { buildCanonicalRegistries } from "../../src/composition/registries.js";
import type {
  CapabilityRequirement,
  CompilationSnapshot,
  ProjectConfiguration,
  SnapshotFile,
} from "../../src/project/config.js";
import { assembleRelease } from "../../src/release/assemble.js";
import { generatedReleaseEntryPath } from "../../src/release/entry-paths.js";
import { validateSchemas } from "../../src/validation/schemas.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const fixtureRoot = new URL("../fixtures/projects/invalid/composition/", import.meta.url);
const foregroundCapability = {
  id: "plotpoint.location.foreground",
  major: 1,
  minimumMinor: 1,
} as const;

function configuration(): ProjectConfiguration {
  return {
    projectFormatVersion: 1,
    environment: "web",
    hostApi: { major: 1, minimumMinor: 1 },
    application: {
      definition: { source: "src/application.ts", export: "plainApplication" },
      components: ["plain.component"],
    },
    aggregateModels: [
      {
        id: "plain.player",
        authority: "local",
        kind: "player",
        stateSchema: "plain.player-state",
        initializationSchema: "plain.initialization",
        initializer: { source: "src/initialize.ts", export: "initializePlain" },
        events: [],
        effects: [],
      },
    ],
    commands: [
      {
        id: "plain.command",
        type: "act",
        execution: "local",
        definition: { source: "src/command.ts", export: "plainCommand" },
        aggregateModel: "plain.player",
        payloadSchema: "plain.command-payload",
        outcomeSchema: "plain.command-outcome",
      },
    ],
    schemas: [
      { id: "plain.player-state", path: "schemas/player-state.json" },
      { id: "plain.initialization", path: "schemas/initialization.json" },
      { id: "plain.command-payload", path: "schemas/command-payload.json" },
      { id: "plain.command-outcome", path: "schemas/command-outcome.json" },
    ],
    progressions: [
      {
        id: "plain.progression",
        aggregateModel: "plain.player",
        definition: { source: "src/progression.ts", export: "plainProgression" },
      },
    ],
    components: [
      {
        id: "plain.component",
        implementation: { source: "src/component.ts", export: "PlainComponent" },
        commands: ["plain.command"],
        content: [],
        assets: [],
        capabilities: [foregroundCapability],
      },
    ],
    content: [],
    assets: [],
  };
}

function schemaFile(projectPath: string): SnapshotFile {
  return {
    kind: "schema",
    projectPath,
    bytes: encoder.encode(
      JSON.stringify({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
        properties: {},
      }),
    ),
  };
}

function snapshot(): CompilationSnapshot {
  const config = configuration();
  const canonical = buildCanonicalRegistries(config);
  if (canonical.kind !== "valid") throw new Error("composition fixture registries are invalid");
  return {
    config,
    registries: canonical.registries,
    files: new Map(config.schemas.map(({ path }) => [path, schemaFile(path)] as const)),
  };
}

async function assemble(capabilities: readonly CapabilityRequirement[] = [foregroundCapability]) {
  const project = snapshot();
  const schemas = validateSchemas(project);
  if (schemas.kind !== "valid") throw new Error("composition fixture schemas are invalid");
  return assembleRelease({
    snapshot: project,
    bundles: {
      logic: encoder.encode("export const aggregateModels = Object.freeze({});"),
      presentation: encoder.encode(
        "export const application = Object.freeze({}); export const components = Object.freeze({});",
      ),
    },
    schemas: schemas.schemas,
    content: [],
    assets: [],
    capabilities,
  });
}

describe("definition inspection diagnostics", () => {
  it.each([
    ["application-shape-mismatch.mjs", "application", "application", "definition"],
    ["initializer-shape-mismatch.mjs", "aggregateModels", "plain.player", "initializer"],
    ["component-shape-mismatch.mjs", "components", "plain.component", "implementation"],
  ] as const)(
    "attributes %s to its configured registration",
    async (fixture, registration, id, field) => {
      const source = await readFile(new URL(fixture, fixtureRoot), "utf8");

      const result = await inspectDefinitionBundle(source, { timeoutMs: 1_000 });

      expect(result).toMatchObject({
        kind: "invalid",
        diagnostic: {
          code: "definition-metadata-mismatch",
          location: { kind: "registration", registration, id, field },
        },
      });
    },
  );
});

describe("canonical Game Composition", () => {
  it("uses plain logical names and one-way, scoped relationships", async () => {
    const result = await assemble();
    expect(result.kind).toBe("assembled");
    if (result.kind !== "assembled") throw new Error("valid composition did not assemble");

    const opened = await openRelease(result.artifact.bytes);
    expect(opened.kind).toBe("opened");
    if (opened.kind !== "opened") throw new Error("assembled composition did not open");
    const entry = opened.entries.find(({ path }) => path === "composition/game.json");
    if (entry === undefined) throw new Error("Game Composition entry is missing");
    const composition = JSON.parse(decoder.decode(entry.bytes)) as Record<string, unknown>;

    expect(composition).toMatchObject({
      application: { components: ["plain.component"] },
      aggregateModels: [
        {
          id: "plain.player",
          authority: "local",
          kind: "player",
          stateSchema: { id: "plain.player-state" },
          initializationSchema: { id: "plain.initialization" },
        },
      ],
      commands: [
        {
          id: "plain.command",
          type: "act",
          aggregateModel: "plain.player",
          payloadSchema: { id: "plain.command-payload" },
          outcomeSchema: { id: "plain.command-outcome" },
          execution: "local",
        },
      ],
      progressions: [{ id: "plain.progression", aggregateModel: "plain.player" }],
      components: [
        {
          id: "plain.component",
          commands: ["plain.command"],
          content: [],
          assets: [],
          capabilities: [foregroundCapability],
        },
      ],
    });
    expect(composition).not.toHaveProperty("requiredHostApi");
    expect(composition).not.toHaveProperty("capabilities");
    expect(composition.aggregateModels).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ commands: expect.anything() })]),
    );
    expect(composition.aggregateModels).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ progression: expect.anything() })]),
    );
    expect(JSON.stringify(composition)).not.toMatch(/generation|schemaVersion|definition|export/);
    expect(composition).toMatchObject({
      resources: expect.arrayContaining([
        {
          id: "plain.initialization",
          role: "schema",
          path: generatedReleaseEntryPath("schema", "plain.initialization"),
        },
      ]),
    });
  });

  it.each([
    ["missing", []],
    [
      "extra",
      [foregroundCapability, { id: "plotpoint.camera.capture", major: 1, minimumMinor: 0 }],
    ],
  ] as const)("rejects a manifest with %s composition-derived capabilities", async (_, value) => {
    const result = await assemble(value);

    expect(result).toMatchObject({
      kind: "invalid",
      diagnostics: [
        {
          code: "release-assembly-failed",
          details: { reason: "manifest-capability-mismatch" },
        },
      ],
    });
  });
});
