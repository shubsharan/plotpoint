import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { analyzeSource } from "../../src/imports/analyze-source.js";
import {
  validateEnvironmentPolicy,
  type ImportEnvironment,
} from "../../src/imports/environment-policy.js";
import { resolveImportGraph } from "../../src/imports/resolve-graph.js";
import type { CompilationSnapshot, SnapshotFile } from "../../src/project/config.js";

const fixtureRoot = fileURLToPath(
  new URL("../fixtures/projects/invalid/import-boundary/", import.meta.url),
);

async function source(name: string): Promise<string> {
  return readFile(`${fixtureRoot}/${name}`, "utf8");
}

async function policy(name: string, environment: ImportEnvironment) {
  const path = `src/${name}`;
  const analyzed = analyzeSource(path, await source(name));
  if (analyzed.kind === "invalid") return analyzed.diagnostics;
  return validateEnvironmentPolicy(analyzed, environment);
}

function snapshot(name: string, text: string): CompilationSnapshot {
  const path = `src/${name}`;
  const file: SnapshotFile = Object.freeze({
    kind: "source",
    projectPath: path,
    bytes: new TextEncoder().encode(text),
  });
  return {
    projectRoot: "/fixture",
    config: {
      projectFormatVersion: 1,
      environment: "web",
      hostApi: { major: 1, minimumMinor: 0 },
      entries: {
        logic: { source: path, export: "logic" },
        presentation: { source: path, export: "logic" },
      },
      commands: [],
      aggregateSchemas: [],
      schemas: [],
      progressions: [],
      components: [],
      content: [],
      assets: [],
    },
    registries: {
      commands: [],
      aggregateSchemas: [],
      schemas: [],
      progressions: [],
      components: [],
      content: [],
      assets: [],
    },
    files: new Map([[path, file]]),
    fingerprints: new Map(),
    toolchain: { node: "test", rolldown: "1.2.2", oxcParser: "test", ajv: "test" },
  };
}

describe("invalid import-boundary fixtures", () => {
  it.each([
    ["logic-forbidden-import.ts", "logic", "import-forbidden"],
    ["dynamic-import.ts", "logic", "import-dynamic-nonliteral"],
    ["native-addon.ts", "logic", "import-native-addon"],
    ["presentation-network.ts", "presentation", "import-ambient-authority"],
  ] as const)("rejects %s in %s with %s", async (name, environment, code) => {
    expect(await policy(name, environment)).toMatchObject([{ code }]);
  });

  it("finds both clock and identifier ambient authority in deterministic logic", async () => {
    expect(await policy("logic-ambient-global.ts", "logic")).toMatchObject([
      { code: "import-ambient-authority", details: { authority: "Date" } },
      { code: "import-ambient-authority", details: { authority: "crypto.randomUUID" } },
    ]);
  });

  it.each([
    ["unresolved-external.ts", 24],
    ["graph-escape.ts", 21],
  ] as const)(
    "rejects unresolved graph edge %s with a fixed source location",
    async (name, column) => {
      const text = await source(name);
      const captured = snapshot(name, text);
      const result = resolveImportGraph(captured, captured.config.entries.logic, "logic");

      expect(result).toMatchObject({
        kind: "invalid",
        diagnostics: [
          {
            code: "import-unresolved",
            location: { kind: "source", path: `src/${name}`, line: 1, column },
          },
        ],
      });
    },
  );
});
