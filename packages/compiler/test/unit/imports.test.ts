import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { analyzeSource } from "../../src/imports/analyze-source.js";
import { resolveImportGraph } from "../../src/imports/resolve-graph.js";
import { loadProject } from "../../src/project/load-project.js";
import { captureProjectSnapshot } from "../../src/project/snapshot.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe("source import analysis", () => {
  it("collects static, dynamic, CommonJS, URL, and ambient-authority references", () => {
    const result = analyzeSource(
      "src/logic.tsx",
      [
        'import { defineCommand } from "@plotpoint/runtime";',
        'export { local } from "./local.js";',
        'const lazy = import("./lazy.js");',
        "const unknown = import(target);",
        'const legacy = require("legacy");',
        'const remote = new URL("https://example.test/a.js");',
        "const now = Date.now();",
      ].join("\n"),
    );

    expect(result.kind).toBe("analyzed");
    if (result.kind !== "analyzed") return;
    expect(
      result.references.map(({ kind, specifier, literal }) => ({ kind, specifier, literal })),
    ).toEqual(
      expect.arrayContaining([
        { kind: "static", specifier: "@plotpoint/runtime", literal: true },
        { kind: "static", specifier: "./local.js", literal: true },
        { kind: "dynamic", specifier: "./lazy.js", literal: true },
        { kind: "dynamic", specifier: undefined, literal: false },
        { kind: "commonjs", specifier: "legacy", literal: true },
        { kind: "url", specifier: "https://example.test/a.js", literal: true },
        { kind: "ambient", specifier: "Date.now", literal: true },
      ]),
    );
    expect(result.references.every(({ line, column }) => line > 0 && column > 0)).toBe(true);
  });

  it("normalizes parser failures without exposing parser prose", () => {
    expect(analyzeSource("src/broken.ts", "export const = ;")).toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "import-syntax-invalid", location: { path: "src/broken.ts" } }],
    });
  });
});

describe("environment graph resolution", () => {
  async function snapshot(logic: string, presentation: string) {
    const root = await mkdtemp(join(tmpdir(), "plotpoint-imports-"));
    roots.push(root);
    await mkdir(join(root, "src"));
    const config = {
      projectFormatVersion: 1,
      environment: "web",
      hostApi: { major: 1, minimumMinor: 0 },
      entries: {
        logic: { source: "src/logic.ts", export: "logic" },
        presentation: { source: "src/presentation.ts", export: "presentation" },
      },
      commands: [],
      aggregateSchemas: [],
      schemas: [],
      progressions: [],
      components: [],
      content: [],
      assets: [],
    };
    await Promise.all([
      writeFile(join(root, "plotpoint.project.json"), JSON.stringify(config)),
      writeFile(join(root, "src/logic.ts"), logic),
      writeFile(join(root, "src/presentation.ts"), presentation),
    ]);
    const loaded = await loadProject({ projectRoot: root });
    if (loaded.kind !== "loaded") throw new Error("fixture did not load");
    const captured = await captureProjectSnapshot(loaded);
    if (captured.kind !== "captured") throw new Error("fixture was not captured");
    return captured.snapshot;
  }

  it("allows deterministic first-party roots in logic and browser rendering in presentation", async () => {
    const captured = await snapshot(
      'import { defineCommand } from "@plotpoint/runtime"; export const logic = defineCommand;',
      "export const presentation = document.createElement('main');",
    );

    const logic = resolveImportGraph(captured, captured.config.entries.logic, "logic");
    expect(logic).toMatchObject({
      kind: "resolved",
      graph: { environment: "logic" },
    });
    if (logic.kind === "resolved") {
      expect(logic.graph.nodes.map(({ path }) => path)).toContain(
        "vendor/@plotpoint/runtime/index.js",
      );
      expect(logic.graph.edges.every(({ external }) => !external)).toBe(true);
    }
    expect(
      resolveImportGraph(captured, captured.config.entries.presentation, "presentation"),
    ).toMatchObject({ kind: "resolved", graph: { environment: "presentation" } });
  });

  it("rejects ambient authority in logic and direct network authority in presentation", async () => {
    const captured = await snapshot(
      "export const logic = Date.now();",
      "export const presentation = fetch('/private');",
    );

    expect(resolveImportGraph(captured, captured.config.entries.logic, "logic")).toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "import-ambient-authority", details: { authority: "Date.now" } }],
    });
    expect(
      resolveImportGraph(captured, captured.config.entries.presentation, "presentation"),
    ).toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "import-ambient-authority", details: { authority: "fetch" } }],
    });
  });
});
