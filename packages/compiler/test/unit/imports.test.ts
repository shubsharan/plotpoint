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
  it("collects only references that define the closed import graph", () => {
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
      ]),
    );
    expect(result.references).toHaveLength(6);
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
  async function snapshot(
    logic: string,
    presentation: string,
    extraSources: Readonly<Record<string, string>> = {},
  ) {
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
      ...Object.entries(extraSources).map(([path, source]) =>
        writeFile(join(root, "src", path), source),
      ),
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
      'import { createHostRuntimeClientV1 } from "@plotpoint/protocol/player"; export const presentation = { createHostRuntimeClientV1, element: document.createElement("main") };',
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
    const presentation = resolveImportGraph(
      captured,
      captured.config.entries.presentation,
      "presentation",
    );
    expect(presentation).toMatchObject({
      kind: "resolved",
      graph: { environment: "presentation" },
    });
    if (presentation.kind === "resolved") {
      expect(presentation.graph.nodes.map(({ path }) => path)).toContain(
        "vendor/@plotpoint/protocol/player/index.js",
      );
    }
  });

  it.each([
    "Date()",
    "new Date()",
    "Date.now()",
    "new (Date)()",
    "new (globalThis['Date'])()",
    "(() => { const Clock = Date; return new Clock(); })()",
  ])("does not claim runtime authority enforcement for %s", async (expression) => {
    const captured = await snapshot(
      `export const logic = ${expression};`,
      "export const presentation = {};",
    );

    expect(resolveImportGraph(captured, captured.config.entries.logic, "logic")).toMatchObject({
      kind: "resolved",
    });
  });

  it("leaves network authority enforcement to the isolated runtime", async () => {
    const captured = await snapshot(
      "export const logic = {};",
      "export const presentation = fetch('/private');",
    );

    expect(
      resolveImportGraph(captured, captured.config.entries.presentation, "presentation"),
    ).toMatchObject({ kind: "resolved" });
  });

  it.each([
    {
      name: "single star",
      logic: 'export * from "./a.js";',
      sources: { "a.ts": "export const logic = {};" },
      expected: "resolved",
    },
    {
      name: "chained stars",
      logic: 'export * from "./a.js";',
      sources: { "a.ts": 'export * from "./b.js";', "b.ts": "export const logic = {};" },
      expected: "resolved",
    },
    {
      name: "cyclic stars with one concrete provider",
      logic: 'export * from "./a.js";',
      sources: {
        "a.ts": 'export * from "./logic.js"; export const logic = {};',
      },
      expected: "resolved",
    },
    {
      name: "an explicit export shadowing star providers",
      logic: 'export * from "./a.js"; export * from "./b.js"; export const logic = {};',
      sources: {
        "a.ts": "export const logic = { source: 'a' };",
        "b.ts": "export const logic = { source: 'b' };",
      },
      expected: "resolved",
    },
    {
      name: "a default export hidden by export star",
      logic: 'export * from "./a.js";',
      sources: { "a.ts": "export default {};" },
      expected: "invalid",
      reason: "missing",
    },
    {
      name: "ambiguous star providers",
      logic: 'export * from "./a.js"; export * from "./b.js";',
      sources: {
        "a.ts": "export const logic = { source: 'a' };",
        "b.ts": "export const logic = { source: 'b' };",
      },
      expected: "invalid",
      reason: "ambiguous",
    },
  ])("resolves $name with ESM export semantics", async ({ logic, sources, expected, reason }) => {
    const captured = await snapshot(
      logic,
      "export const presentation = {};",
      Object.fromEntries(Object.entries(sources).filter((entry) => entry[1] !== undefined)),
    );

    const result = resolveImportGraph(captured, captured.config.entries.logic, "logic");
    expect(result.kind).toBe(expected);
    if (reason !== undefined) {
      expect(result).toMatchObject({
        kind: "invalid",
        diagnostics: [{ code: "definition-export-missing", details: { reason } }],
      });
    }
  });
});
