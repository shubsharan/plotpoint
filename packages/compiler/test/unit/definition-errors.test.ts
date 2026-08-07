import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { inspectDefinitionBundle } from "../../src/composition/inspect-definitions.js";
import type { DefinitionInspectionMetadata } from "../../src/composition/inspect-definitions.js";
import { buildCanonicalRegistries } from "../../src/composition/registries.js";
import { validateReferences } from "../../src/composition/validate-references.js";
import type {
  CanonicalProjectRegistries,
  CompilationSnapshot,
  ProjectConfiguration,
  SnapshotFile,
} from "../../src/project/config.js";
import { validateCommands } from "../../src/validation/commands.js";
import { validateProgressions } from "../../src/validation/progression.js";
import {
  normalizeAjvErrors,
  validateRuntimeSchemaRoots,
  validateSchemas,
} from "../../src/validation/schemas.js";

const encoder = new TextEncoder();
const fixtureRoot = new URL("../fixtures/projects/invalid/definitions/", import.meta.url);

function configuration(): ProjectConfiguration {
  return {
    projectFormatVersion: 1,
    environment: "web",
    hostApi: { major: 1, minimumMinor: 0 },
    application: {
      definition: { source: "src/presentation.ts", export: "application" },
      components: [],
    },
    aggregateModels: [
      {
        id: "player",
        authority: "local",
        kind: "player",
        stateSchema: "player-state",
        initializationSchema: "player-initialization",
        initializer: { source: "src/logic.ts", export: "initialize" },
        events: [],
        effects: [],
      },
    ],
    commands: [
      {
        id: "solve",
        type: "solve",
        execution: "local",
        definition: { source: "src/solve.ts", export: "solve" },
        aggregateModel: "player",
        payloadSchema: "payload",
        outcomeSchema: "outcome",
      },
    ],
    schemas: [
      { id: "player-state", path: "schemas/player.json" },
      { id: "player-initialization", path: "schemas/initialization.json" },
      { id: "payload", path: "schemas/payload.json" },
      { id: "outcome", path: "schemas/outcome.json" },
    ],
    progressions: [
      {
        id: "main",
        definition: { source: "src/progression.ts", export: "main" },
        aggregateModel: "player",
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
    application: { keys: ["mount"], mountType: "function" },
    aggregateModels: [{ registrationId: "player", initializerType: "function" }],
    commands: [
      {
        registrationId: "solve",
        definitionId: "solve",
        commandType: "solve",
        aggregateKind: "player",
      },
    ],
    progressions: [
      {
        registrationId: "main",
        graphId: "main",
        aggregateKind: "player",
        nodes: [{ nodeId: "stage", initialStatus: "active" }],
        transitions: [],
      },
    ],
    components: [],
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
    config,
    registries: registries(config),
    files: new Map([
      ["schemas/player.json", schema("schemas/player.json")],
      ["schemas/initialization.json", schema("schemas/initialization.json")],
      ["schemas/payload.json", schema("schemas/payload.json")],
      ["schemas/outcome.json", schema("schemas/outcome.json")],
    ]),
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
          id: "other",
          definition: { source: "src/other.ts", export: "other" },
        },
      ],
    };
    const duplicateMetadata: DefinitionInspectionMetadata = {
      commands: [
        ...metadata().commands,
        {
          registrationId: "other",
          definitionId: "other",
          commandType: "solve",
          aggregateKind: "player",
        },
      ],
      application: metadata().application,
      aggregateModels: metadata().aggregateModels,
      progressions: metadata().progressions,
      components: metadata().components,
    };

    expect(validateCommands(registries(), drift).map(({ code }) => code)).toContain(
      "definition-metadata-mismatch",
    );
    expect(
      validateCommands(registries(duplicate), duplicateMetadata).map(({ code }) => code),
    ).toContain("command-type-duplicate");
  });

  it("reports missing payload/outcome schemas through composition validation", () => {
    const config = configuration();
    const broken = {
      ...config,
      commands: [{ ...config.commands[0]!, payloadSchema: "missing.payload" }],
    };
    expect(validateReferences(registries(broken))).toMatchObject([
      { code: "composition-reference-missing", location: { field: "payloadSchema" } },
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

  it("rejects scalar schemas selected by runtime model and command contracts", () => {
    const result = validateSchemas(
      snapshot({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "string",
      }),
    );
    expect(result.kind).toBe("valid");
    if (result.kind !== "valid") return;

    expect(validateRuntimeSchemaRoots(registries(), result.schemas)).toMatchObject([
      {
        code: "schema-value-invalid",
        location: { registration: "aggregateModels", field: "initializationSchema" },
        details: { reason: "runtime-schema-root-must-be-object" },
      },
      {
        code: "schema-value-invalid",
        location: { registration: "aggregateModels", field: "stateSchema" },
        details: { reason: "runtime-schema-root-must-be-object" },
      },
      {
        code: "schema-value-invalid",
        location: { registration: "commands", field: "outcomeSchema" },
        details: { reason: "runtime-schema-root-must-be-object" },
      },
      {
        code: "schema-value-invalid",
        location: { registration: "commands", field: "payloadSchema" },
        details: { reason: "runtime-schema-root-must-be-object" },
      },
    ]);
  });

  it("rejects unsupported semantic formats at their stable schema pointer", async () => {
    const document = JSON.parse(
      await readFile(new URL("unsupported.schema.json", fixtureRoot), "utf8"),
    ) as unknown;
    const result = validateSchemas(snapshot(document));
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.diagnostics).toHaveLength(4);
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
    const normalized = normalizeAjvErrors("payload", [
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
        schemaId: "payload",
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
      application: metadata().application,
      aggregateModels: metadata().aggregateModels,
      commands: metadata().commands,
      progressions: [
        {
          ...metadata().progressions[0]!,
          graphId: "drifted",
          transitions: [
            {
              transitionId: "missing",
              targetNodeId: "absent",
              from: ["locked"],
              to: "available",
              priority: 0,
              trigger: "automatic",
            },
          ],
        },
      ],
      components: metadata().components,
    };

    expect(validateProgressions(registries(), unknownTarget).map(({ code }) => code)).toEqual(
      expect.arrayContaining(["progression-definition-mismatch", "progression-reference-missing"]),
    );
    expect(validateProgressions(registries(), cycle).map(({ code }) => code)).toContain(
      "progression-cycle",
    );
  });

  it("rejects an unknown configured aggregate model reference", () => {
    const config = configuration();
    const broken = {
      ...config,
      progressions: [
        {
          ...config.progressions[0]!,
          aggregateModel: "missing-model",
        },
      ],
    };
    expect(validateReferences(registries(broken)).map(({ code }) => code)).toEqual([
      "composition-reference-missing",
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
