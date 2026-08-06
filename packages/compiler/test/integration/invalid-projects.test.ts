import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { compileProject } from "@plotpoint/compiler";

const fixtureRoot = fileURLToPath(
  new URL("../../../../examples/releases/minimal-local-puzzle/", import.meta.url),
);
const configurationFixtureRoot = fileURLToPath(
  new URL("../fixtures/projects/invalid/configuration/", import.meta.url),
);
const expectations = JSON.parse(
  await readFile(new URL("../fixtures/expected/invalid-diagnostics.json", import.meta.url), "utf8"),
) as Readonly<Record<string, readonly string[]>>;
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "plotpoint-invalid-project-"));
  temporaryRoots.push(root);
  await cp(fixtureRoot, root, { recursive: true });
  await writeFile(
    join(root, "src/logic.ts"),
    "export const initializePlayer = () => ({ attempts: 0, solved: false });\n",
  );
  await writeFile(
    join(root, "src/presentation.ts"),
    "export const application = Object.freeze({ mount() { return Object.freeze({ unmount() {} }); } });\n",
  );
  await writeFile(
    join(root, "schemas/initialization.schema.json"),
    JSON.stringify({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "minimal.initialization",
      type: "object",
      additionalProperties: false,
      properties: {},
    }),
  );
  await writeFile(
    join(root, "plotpoint.project.json"),
    JSON.stringify({
      projectFormatVersion: 1,
      environment: "web",
      hostApi: { major: 1, minimumMinor: 0 },
      application: {
        definition: { source: "src/presentation.ts", export: "application" },
        components: [],
      },
      aggregateModels: [
        {
          id: "minimal.player",
          authority: "local",
          kind: "player",
          stateSchema: "minimal.player-state",
          initializationSchema: "minimal.initialization",
          initializer: { source: "src/logic.ts", export: "initializePlayer" },
          events: [],
          effects: [],
        },
      ],
      commands: [
        {
          id: "minimal.solve",
          type: "solve",
          execution: "local",
          definition: { source: "src/commands/solve.ts", export: "solveCommand" },
          aggregateModel: "minimal.player",
          payloadSchema: "minimal.solve-payload",
          outcomeSchema: "minimal.solve-outcome",
        },
      ],
      schemas: [
        { id: "minimal.initialization", path: "schemas/initialization.schema.json" },
        { id: "minimal.player-state", path: "schemas/player-state.schema.json" },
        { id: "minimal.solve-outcome", path: "schemas/solve-outcome.schema.json" },
        { id: "minimal.solve-payload", path: "schemas/solve-payload.schema.json" },
      ],
      progressions: [],
      components: [],
      content: [],
      assets: [],
    }),
  );
  return root;
}

async function configurationProject(caseName: string): Promise<string> {
  const root = await project();
  const fixture = await readFile(
    join(configurationFixtureRoot, caseName, "plotpoint.project.json"),
    "utf8",
  );
  await writeFile(join(root, "plotpoint.project.json"), fixture);
  return root;
}

async function compileInvalid(root: string, caseName: string) {
  const outputFile = join(root, "output.pprelease");
  const result = await compileProject({ projectRoot: root, outputFile });
  expect(result.kind).toBe("invalid");
  if (result.kind !== "invalid") throw new Error(`${caseName} unexpectedly compiled`);
  expect(result.diagnostics.map(({ code }) => code)).toEqual(expectations[caseName]);
  await expect(readFile(outputFile)).rejects.toMatchObject({ code: "ENOENT" });
  return result;
}

describe("invalid project publication boundary", () => {
  it("rejects unknown configuration fields before output", async () => {
    const root = await project();
    const configPath = join(root, "plotpoint.project.json");
    const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
    config.releaseLabel = "must-not-exist";
    await writeFile(configPath, JSON.stringify(config));

    await compileInvalid(root, "unknown-config-field");
  });

  it("rejects forbidden logic imports before output", async () => {
    const root = await project();
    const logicPath = join(root, "src/logic.ts");
    const logic = await readFile(logicPath, "utf8");
    await writeFile(logicPath, `import "node:fs";\n${logic}`);

    await compileInvalid(root, "forbidden-node-import");
  });

  it("rejects configured definition exports that do not exist", async () => {
    const root = await project();
    await writeFile(
      join(root, "src/commands/solve.ts"),
      "export const notTheConfiguredCommand = Object.freeze({});\n",
    );

    const result = await compileInvalid(root, "missing-logic-definition-export");
    expect(result.diagnostics.map(({ location }) => location)).toEqual([
      expect.objectContaining({ registration: "commands", field: "definition" }),
    ]);
  });

  it("collects and orders independently discoverable reference failures", async () => {
    const root = await project();
    const configPath = join(root, "plotpoint.project.json");
    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      commands: { payloadSchema: string; outcomeSchema: string }[];
    };
    const command = config.commands[0];
    if (command === undefined) throw new Error("fixture command missing");
    command.payloadSchema = "missing.payload";
    command.outcomeSchema = "missing.outcome";
    await writeFile(configPath, JSON.stringify(config));

    const result = await compileInvalid(root, "missing-command-schemas");
    expect(result.diagnostics.map(({ location }) => location)).toEqual([
      expect.objectContaining({ field: "outcomeSchema" }),
      expect.objectContaining({ field: "payloadSchema" }),
    ]);
  });

  it("preserves an unrelated existing output", async () => {
    const root = await project();
    const outputFile = join(root, "output.pprelease");
    await writeFile(outputFile, "unrelated");

    const result = await compileProject({ projectRoot: root, outputFile });
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") throw new Error("collision unexpectedly compiled");
    expect(result.diagnostics.map(({ code }) => code)).toEqual(expectations["output-collision"]);
    await expect(readFile(outputFile, "utf8")).resolves.toBe("unrelated");
  });
});

describe("corrected project configuration boundary", () => {
  it.each([
    [
      "per-entry-generations",
      [
        "/aggregateModels/0/version",
        "/progressions/0/version",
        "/schemas/0/version",
        "/trustedMechanic/version",
      ],
    ],
    [
      "reverse-model-relationships",
      [
        "/aggregateModels/0/commands",
        "/aggregateModels/0/progression",
        "/aggregateModels/0/trustedMechanic",
      ],
    ],
  ] as const)("rejects %s at deterministic strict-shape pointers", async (caseName, pointers) => {
    const root = await configurationProject(caseName);
    const outputFile = join(root, "output.pprelease");

    const result = await compileProject({ projectRoot: root, outputFile });

    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") throw new Error(`${caseName} unexpectedly compiled`);
    expect(
      result.diagnostics.map(({ code, location }) => ({
        code,
        pointer: location.kind === "configuration" ? location.pointer : undefined,
      })),
    ).toEqual(pointers.map((pointer) => ({ code: "configuration-unknown-field", pointer })));
    await expect(readFile(outputFile)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("requires local authority to use the player aggregate kind", async () => {
    const root = await configurationProject("authority-kind-mismatch");
    const outputFile = join(root, "output.pprelease");

    const result = await compileProject({ projectRoot: root, outputFile });

    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") throw new Error("authority-kind mismatch unexpectedly compiled");
    expect(result.diagnostics.map(({ code, location }) => ({ code, location }))).toEqual([
      {
        code: "configuration-value-invalid",
        location: expect.objectContaining({
          kind: "configuration",
          pointer: "/aggregateModels/0/kind",
        }),
      },
    ]);
    await expect(readFile(outputFile)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("requires initialization content to declare the model initialization schema", async () => {
    const root = await configurationProject("initialization-schema-mismatch");
    const outputFile = join(root, "output.pprelease");

    const result = await compileProject({ projectRoot: root, outputFile });

    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") {
      throw new Error("initialization schema mismatch unexpectedly compiled");
    }
    expect(result.diagnostics.map(({ code, location }) => ({ code, location }))).toEqual([
      {
        code: "content-schema-invalid",
        location: {
          kind: "registration",
          registration: "aggregateModels",
          id: "minimal.player",
          field: "initializationContent",
        },
      },
    ]);
    await expect(readFile(outputFile)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects duplicate command types within a model-derived command set", async () => {
    const root = await configurationProject("duplicate-derived-command-type");
    const outputFile = join(root, "output.pprelease");

    const result = await compileProject({ projectRoot: root, outputFile });

    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") throw new Error("duplicate command type unexpectedly compiled");
    expect(result.diagnostics.map(({ code, location }) => ({ code, location }))).toEqual([
      {
        code: "command-type-duplicate",
        location: {
          kind: "registration",
          registration: "commands",
          id: "minimal.solve-again",
          field: "type",
        },
      },
    ]);
    await expect(readFile(outputFile)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects the superseded entries and aggregateSchemas project shape", async () => {
    const root = await configurationProject("superseded-shape");
    const outputFile = join(root, "output.pprelease");

    const result = await compileProject({ projectRoot: root, outputFile });

    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid")
      throw new Error("superseded configuration unexpectedly compiled");
    expect(
      result.diagnostics
        .filter(({ code }) => code === "configuration-unknown-field")
        .map(({ location }) => (location.kind === "configuration" ? location.pointer : undefined)),
    ).toEqual(["/aggregateSchemas", "/entries"]);
    await expect(readFile(outputFile)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
