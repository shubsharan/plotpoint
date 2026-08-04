import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { compileProject } from "@plotpoint/compiler";

const fixtureRoot = fileURLToPath(
  new URL("../../../../examples/releases/minimal-local-puzzle/", import.meta.url),
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

  it("rejects configured definitions that are absent from the logic graph", async () => {
    const root = await project();
    await writeFile(
      join(root, "src/logic.ts"),
      "export const logic = Object.freeze({ commands: [], progressions: [] });\n",
    );

    const result = await compileInvalid(root, "unreachable-logic-definitions");
    expect(result.diagnostics.map(({ location }) => location)).toEqual([
      expect.objectContaining({ registration: "commands", field: "definition" }),
      expect.objectContaining({ registration: "progressions", field: "definition" }),
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
