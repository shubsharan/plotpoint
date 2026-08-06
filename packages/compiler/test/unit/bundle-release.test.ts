import { describe, expect, it } from "vitest";

import { bundleDefinitionInspection, bundleRelease } from "../../src/bundle/bundle-release.js";
import { inspectDefinitionBundle } from "../../src/composition/inspect-definitions.js";
import { analyzeSource, type AnalyzedSource } from "../../src/imports/analyze-source.js";
import type { ImportGraph, ImportGraphNode } from "../../src/imports/resolve-graph.js";
import type {
  CanonicalProjectRegistries,
  CompilationSnapshot,
  SnapshotFile,
} from "../../src/project/config.js";

const encoder = new TextEncoder();

const emptyRegistries: CanonicalProjectRegistries = Object.freeze({
  application: Object.freeze({
    definition: Object.freeze({ source: "src/presentation.ts", export: "presentation" }),
    components: Object.freeze([]),
  }),
  aggregateModels: Object.freeze([
    Object.freeze({
      id: "player",
      authority: "local",
      kind: "player",
      stateSchema: "player-state",
      initializationSchema: "player-initialization",
      initializer: Object.freeze({ source: "src/logic.ts", export: "logic" }),
      events: Object.freeze([]),
      effects: Object.freeze([]),
    }),
  ]),
  commands: Object.freeze([]),
  schemas: Object.freeze([]),
  progressions: Object.freeze([]),
  components: Object.freeze([]),
  content: Object.freeze([]),
  assets: Object.freeze([]),
});

function node(path: string, source: string): ImportGraphNode {
  const analysis = analyzeSource(path, source);
  if (analysis.kind === "invalid") throw new Error("test source must analyze");
  return Object.freeze({
    path,
    bytes: encoder.encode(source),
    analysis: analysis as AnalyzedSource,
  });
}

function graph(
  environment: "logic" | "presentation",
  entryPath: string,
  entryExport: string,
  nodes: readonly ImportGraphNode[],
  edges: ImportGraph["edges"] = [],
): ImportGraph {
  return Object.freeze({
    environment,
    entry: Object.freeze({ source: entryPath, export: entryExport }),
    nodes: Object.freeze([...nodes]),
    edges: Object.freeze([...edges]),
  });
}

describe("snapshot release bundling", () => {
  it("emits deterministic self-contained logic and presentation ESM chunks", async () => {
    const answer = node("src/answer.ts", "export const answer: number = 42;");
    const logic = node(
      "src/logic.ts",
      'import { answer } from "./answer.js"; export const logic = Object.freeze({ answer });',
    );
    const presentation = node(
      "src/presentation.ts",
      'export const presentation = Object.freeze({ component: "card" });',
    );
    const input = {
      logic: graph(
        "logic",
        "src/logic.ts",
        "logic",
        [answer, logic],
        [
          {
            from: "src/logic.ts",
            to: "src/answer.ts",
            specifier: "./answer.js",
            kind: "static",
            external: false,
          },
        ],
      ),
      presentation: graph("presentation", "src/presentation.ts", "presentation", [presentation]),
      registries: emptyRegistries,
    };

    const first = await bundleRelease(input);
    const second = await bundleRelease(input);

    expect(first.kind).toBe("bundled");
    expect(second.kind).toBe("bundled");
    if (first.kind === "bundled" && second.kind === "bundled") {
      expect(first.logic).toEqual(second.logic);
      expect(first.presentation).toEqual(second.presentation);
      expect(new TextDecoder().decode(first.logic)).toContain("42");
      expect(new TextDecoder().decode(first.logic)).not.toMatch(/\bimport\s/);
      expect(new TextDecoder().decode(first.presentation)).not.toMatch(/\bimport\s/);
    }
  });

  it("normalizes graph escapes instead of falling back to filesystem resolution", async () => {
    const logic = node(
      "src/logic.ts",
      'import { missing } from "./missing.js"; export const logic = { missing };',
    );
    const presentation = node("src/presentation.ts", "export const presentation = {};");

    const result = await bundleRelease({
      logic: graph("logic", "src/logic.ts", "logic", [logic]),
      presentation: graph("presentation", "src/presentation.ts", "presentation", [presentation]),
      registries: emptyRegistries,
    });

    expect(result).toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "bundle-failed", details: { reason: "module-not-in-snapshot" } }],
    });
  });

  it("retains registered exports in canonical named bundle maps", async () => {
    const command = node("src/command.ts", "export const command = { id: 'command' };");
    const progression = node(
      "src/progression.ts",
      "export const progression = { id: 'progression' };",
    );
    const component = node("src/component.ts", "export const Component = { id: 'component' };");
    const logic = node(
      "src/logic.ts",
      [
        'export { command } from "./command.js";',
        'export { progression } from "./progression.js";',
        "export const logic = {};",
      ].join("\n"),
    );
    const presentation = node(
      "src/presentation.ts",
      'export { Component } from "./component.js"; export const presentation = {};',
    );
    const registries: CanonicalProjectRegistries = Object.freeze({
      ...emptyRegistries,
      commands: Object.freeze([
        Object.freeze({
          id: "command/id",
          type: "command",
          execution: "local",
          definition: Object.freeze({ source: "src/command.ts", export: "command" }),
          aggregateModel: "player",
          payloadSchema: "payload",
          outcomeSchema: "outcome",
        }),
      ]),
      progressions: Object.freeze([
        Object.freeze({
          id: "Progression.",
          definition: Object.freeze({ source: "src/progression.ts", export: "progression" }),
          aggregateModel: "player",
        }),
      ]),
      components: Object.freeze([
        Object.freeze({
          id: "Component!?",
          implementation: Object.freeze({ source: "src/component.ts", export: "Component" }),
          commands: Object.freeze([]),
          content: Object.freeze([]),
          assets: Object.freeze([]),
          capabilities: Object.freeze([]),
        }),
      ]),
    });

    const bundled = await bundleRelease({
      logic: graph(
        "logic",
        "src/logic.ts",
        "logic",
        [command, progression, logic],
        [
          {
            from: "src/logic.ts",
            to: "src/command.ts",
            specifier: "./command.js",
            kind: "static",
            external: false,
          },
          {
            from: "src/logic.ts",
            to: "src/progression.ts",
            specifier: "./progression.js",
            kind: "static",
            external: false,
          },
        ],
      ),
      presentation: graph(
        "presentation",
        "src/presentation.ts",
        "presentation",
        [component, presentation],
        [
          {
            from: "src/presentation.ts",
            to: "src/component.ts",
            specifier: "./component.js",
            kind: "static",
            external: false,
          },
        ],
      ),
      registries,
    });

    expect(bundled.kind).toBe("bundled");
    if (bundled.kind !== "bundled") return;
    const logicModule = await import(
      `data:text/javascript;base64,${Buffer.from(bundled.logic).toString("base64")}`
    );
    const presentationModule = await import(
      `data:text/javascript;base64,${Buffer.from(bundled.presentation).toString("base64")}`
    );
    expect(Object.keys(logicModule.aggregateModels)).toEqual(["player"]);
    expect(Object.keys(logicModule.aggregateModels.player.commandsByType)).toEqual(["command"]);
    expect(logicModule.aggregateModels.player.progression).toEqual({ id: "progression" });
    expect(presentationModule.application).toEqual({});
    expect(Object.keys(presentationModule.components)).toEqual(["Component!?"]);
  });

  it("bundles definition inspection without executing it in the compiler process", async () => {
    const snapshot: CompilationSnapshot = Object.freeze({
      config: {
        projectFormatVersion: 1 as const,
        environment: "web" as const,
        hostApi: { major: 1, minimumMinor: 0 },
        application: emptyRegistries.application,
        aggregateModels: emptyRegistries.aggregateModels,
        commands: [],
        schemas: [],
        progressions: [],
        components: [],
        content: [],
        assets: [],
      },
      registries: emptyRegistries,
      files: new Map<string, SnapshotFile>([
        [
          "src/logic.ts",
          {
            kind: "source",
            projectPath: "src/logic.ts",
            bytes: encoder.encode("export function logic() { return {}; }"),
          },
        ],
        [
          "src/presentation.ts",
          {
            kind: "source",
            projectPath: "src/presentation.ts",
            bytes: encoder.encode("export const presentation = { mount() {} };"),
          },
        ],
      ]),
    });

    const bundled = await bundleDefinitionInspection(snapshot);

    expect(bundled.kind).toBe("bundled");
    if (bundled.kind === "bundled") {
      await expect(inspectDefinitionBundle(bundled.bytes)).resolves.toEqual({
        kind: "valid",
        metadata: {
          application: { keys: ["mount"], mountType: "function" },
          aggregateModels: [{ registrationId: "player", initializerType: "function" }],
          commands: [],
          progressions: [],
          components: [],
        },
      });
    }
  });
});
