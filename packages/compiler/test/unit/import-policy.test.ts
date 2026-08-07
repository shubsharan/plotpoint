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
    config: {
      projectFormatVersion: 1,
      environment: "web",
      hostApi: { major: 1, minimumMinor: 0 },
      application: {
        definition: { source: path, export: "logic" },
        components: [],
      },
      aggregateModels: [
        {
          id: "player",
          authority: "local",
          kind: "player",
          stateSchema: "player-state",
          initializationSchema: "player-initialization",
          initializer: { source: path, export: "logic" },
          events: [],
          effects: [],
        },
      ],
      commands: [],
      schemas: [
        { id: "player-state", path: "schemas/player-state.json" },
        { id: "player-initialization", path: "schemas/player-initialization.json" },
      ],
      progressions: [],
      components: [],
      content: [],
      assets: [],
    },
    registries: {
      application: { definition: { source: path, export: "logic" }, components: [] },
      aggregateModels: [
        {
          id: "player",
          authority: "local",
          kind: "player",
          stateSchema: "player-state",
          initializationSchema: "player-initialization",
          initializer: { source: path, export: "logic" },
          events: [],
          effects: [],
        },
      ],
      commands: [],
      schemas: [
        { id: "player-state", path: "schemas/player-state.json" },
        { id: "player-initialization", path: "schemas/player-initialization.json" },
      ],
      progressions: [],
      components: [],
      content: [],
      assets: [],
    },
    files: new Map([[path, file]]),
  };
}

describe("invalid import-boundary fixtures", () => {
  it.each([
    ["logic-forbidden-import.ts", "logic", "import-forbidden"],
    ["dynamic-import.ts", "logic", "import-dynamic-nonliteral"],
    ["native-addon.ts", "logic", "import-native-addon"],
  ] as const)("rejects %s in %s with %s", async (name, environment, code) => {
    expect(await policy(name, environment)).toMatchObject([{ code }]);
  });

  it("does not apply a bypassable ambient-authority syntax blacklist", async () => {
    expect(await policy("logic-ambient-global.ts", "logic")).toEqual([]);
    expect(await policy("presentation-network.ts", "presentation")).toEqual([]);
  });

  it.each([
    ["unresolved-external.ts", 24],
    ["graph-escape.ts", 21],
  ] as const)(
    "rejects unresolved graph edge %s with a fixed source location",
    async (name, column) => {
      const text = await source(name);
      const captured = snapshot(name, text);
      const localModel = captured.config.aggregateModels[0];
      if (localModel?.authority !== "local") throw new Error("expected local model");
      const result = resolveImportGraph(captured, localModel.initializer, "logic");

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
