import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { inspectDefinitionBundle } from "../../src/composition/inspect-definitions.js";
import type { DefinitionInspectionMetadata } from "../../src/composition/inspect-definitions.js";
import { buildCanonicalRegistries } from "../../src/composition/registries.js";
import type {
  CanonicalProjectRegistries,
  CompilationSnapshot,
  ProjectConfigurationV1,
  SnapshotFile,
} from "../../src/project/config.js";
import { validateCommands } from "../../src/validation/commands.js";
import { validateProgressions } from "../../src/validation/progression.js";
import { normalizeAjvErrors, validateSchemas } from "../../src/validation/schemas.js";

const encoder = new TextEncoder();
const fixtureRoot = new URL("../fixtures/projects/invalid/definitions/", import.meta.url);

function configuration(): ProjectConfigurationV1 {
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
        id: "solve.v1",
        type: "solve",
        definition: { source: "src/solve.ts", export: "solve" },
        aggregateSchema: "player.v1",
        payloadSchema: "payload.v1",
        outcomeSchema: "outcome.v1",
      },
    ],
    aggregateSchemas: [
      { id: "player.v1", kind: "player", version: 1, path: "schemas/player.json" },
    ],
    schemas: [
      { id: "payload.v1", path: "schemas/payload.json" },
      { id: "outcome.v1", path: "schemas/outcome.json" },
    ],
    progressions: [
      {
        id: "main.v1",
        version: 1,
        kind: "player",
        definition: { source: "src/progression.ts", export: "main" },
        aggregateSchema: "player.v1",
        commands: ["solve.v1"],
        content: [],
        components: [],
      },
    ],
    components: [],
    content: [],
    assets: [],
  };
}

function registries(config = configuration()): CanonicalProjectRegistries {
  const result = buildCanonicalRegistries(config);
  if (result.kind !== "valid") throw new Error("invalid fixture registries");
  return result.registries;
}

function metadata(): DefinitionInspectionMetadata {
  return {
    commands: [
      {
        registrationId: "solve.v1",
        definitionId: "solve.v1",
        commandType: "solve",
        aggregateKind: "player",
      },
    ],
    progressions: [
      {
        registrationId: "main.v1",
        graphId: "main.v1",
        graphVersion: 1,
        aggregateKind: "player",
        nodes: [{ nodeId: "stage", initialStatus: "active" }],
        automaticRules: [],
      },
    ],
  };
}

function snapshot(schemaDocument: unknown): CompilationSnapshot {
  const config = configuration();
  const schema = (path: string): SnapshotFile => ({
    kind: "schema",
    projectPath: path,
    bytes: encoder.encode(JSON.stringify(schemaDocument)),
  });
  return {
    projectRoot: "/fixture",
    config,
    registries: registries(config),
    files: new Map([
      ["schemas/player.json", schema("schemas/player.json")],
      ["schemas/payload.json", schema("schemas/payload.json")],
      ["schemas/outcome.json", schema("schemas/outcome.json")],
    ]),
    fingerprints: new Map(),
    toolchain: { node: "test", rolldown: "test", oxcParser: "test", ajv: "test" },
  };
}

describe("command definition validation", () => {
  it("accepts exact definition, aggregate, and schema agreement", () => {
    expect(validateCommands(registries(), metadata())).toEqual([]);
  });

  it("reports definition drift and duplicate command types deterministically", async () => {
    const drift = JSON.parse(
      await readFile(new URL("command-definition-drift.json", fixtureRoot), "utf8"),
    ) as DefinitionInspectionMetadata;
    const config = configuration();
    const duplicate = {
      ...config,
      commands: [
        ...config.commands,
        {
          ...config.commands[0]!,
          id: "other.v1",
          definition: { source: "src/other.ts", export: "other" },
        },
      ],
    };
    const duplicateMetadata: DefinitionInspectionMetadata = {
      commands: [
        ...metadata().commands,
        {
          registrationId: "other.v1",
          definitionId: "other.v1",
          commandType: "solve",
          aggregateKind: "player",
        },
      ],
      progressions: metadata().progressions,
    };

    expect(validateCommands(registries(), drift).map(({ code }) => code)).toContain(
      "definition-metadata-mismatch",
    );
    expect(
      validateCommands(registries(duplicate), duplicateMetadata).map(({ code }) => code),
    ).toContain("command-type-duplicate");
  });

  it("reports missing payload/outcome schemas with command-specific diagnostics", () => {
    const config = configuration();
    const broken = {
      ...config,
      commands: [{ ...config.commands[0]!, payloadSchema: "missing.payload" }],
    };
    expect(validateCommands(registries(broken), metadata())).toMatchObject([
      { code: "command-schema-missing", location: { field: "payloadSchema" } },
    ]);
  });
});

describe("closed durable schema subset", () => {
  it("accepts the canonical JSON-compatible object subset", () => {
    const result = validateSchemas(
      snapshot({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
        required: ["count"],
        properties: { count: { type: "integer", minimum: 0 } },
      }),
    );
    expect(result.kind).toBe("valid");
  });

  it("rejects unsupported semantic formats at their stable schema pointer", async () => {
    const document = JSON.parse(
      await readFile(new URL("unsupported.schema.json", fixtureRoot), "utf8"),
    ) as unknown;
    const result = validateSchemas(snapshot(document));
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.diagnostics).toHaveLength(3);
      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "schema-keyword-unsupported",
            details: { keyword: "format", pointer: "/properties/createdAt/format" },
          }),
        ]),
      );
    }
  });

  it("normalizes Ajv validation errors without raw messages or library objects", () => {
    const normalized = normalizeAjvErrors("payload.v1", [
      {
        instancePath: "/answer",
        schemaPath: "#/properties/answer/minLength",
        keyword: "minLength",
        params: { limit: 1 },
        message: "must NOT expose this prose",
      },
    ]);
    expect(normalized).toEqual([
      {
        schemaId: "payload.v1",
        instancePath: "/answer",
        schemaPath: "#/properties/answer/minLength",
        keyword: "minLength",
        params: { limit: 1 },
      },
    ]);
    expect(JSON.stringify(normalized)).not.toContain("prose");
  });
});

describe("progression definition validation", () => {
  it("accepts exact metadata and configured references", () => {
    expect(validateProgressions(registries(), metadata())).toEqual([]);
  });

  it("rejects metadata drift, unknown rule targets, and declarative status cycles", async () => {
    const cycle = JSON.parse(
      await readFile(new URL("progression-cycle.json", fixtureRoot), "utf8"),
    ) as DefinitionInspectionMetadata;
    const unknownTarget: DefinitionInspectionMetadata = {
      commands: metadata().commands,
      progressions: [
        {
          ...metadata().progressions[0]!,
          graphVersion: 2,
          automaticRules: [
            {
              ruleId: "missing",
              targetNodeId: "absent",
              from: ["locked"],
              to: "available",
              priority: 0,
            },
          ],
        },
      ],
    };

    expect(validateProgressions(registries(), unknownTarget).map(({ code }) => code)).toEqual(
      expect.arrayContaining(["progression-definition-mismatch", "progression-reference-missing"]),
    );
    expect(validateProgressions(registries(), cycle).map(({ code }) => code)).toContain(
      "progression-cycle",
    );
  });

  it("rejects unknown configured command/content/component references", () => {
    const config = configuration();
    const broken = {
      ...config,
      progressions: [
        {
          ...config.progressions[0]!,
          commands: ["missing-command"],
          content: ["missing-content"],
          components: ["missing-component"],
        },
      ],
    };
    expect(validateProgressions(registries(broken), metadata()).map(({ code }) => code)).toEqual([
      "progression-reference-missing",
      "progression-reference-missing",
      "progression-reference-missing",
    ]);
  });
});

describe("definition inspection invalid output fixture", () => {
  it("normalizes invalid subprocess output", async () => {
    const source = await readFile(new URL("inspection-invalid-output.mjs", fixtureRoot), "utf8");
    const result = await inspectDefinitionBundle(source, { timeoutMs: 1_000 });
    expect(result).toMatchObject({
      kind: "invalid",
      diagnostic: { code: "definition-inspection-output-invalid" },
    });
  });
});
