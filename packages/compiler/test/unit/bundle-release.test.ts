import { describe, expect, it } from "vitest";

import { bundleDefinitionInspection, bundleRelease } from "../../src/bundle/bundle-release.js";
import { inspectDefinitionBundle } from "../../src/composition/inspect-definitions.js";
import { analyzeSource, type AnalyzedSource } from "../../src/imports/analyze-source.js";
import type { ImportGraph, ImportGraphNode } from "../../src/imports/resolve-graph.js";
import type { CompilationSnapshot } from "../../src/project/config.js";

const encoder = new TextEncoder();

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
        [{ from: "src/logic.ts", to: "src/answer.ts", kind: "static", external: false }],
      ),
      presentation: graph("presentation", "src/presentation.ts", "presentation", [presentation]),
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
    });

    expect(result).toMatchObject({
      kind: "invalid",
      diagnostics: [{ code: "bundle-failed", details: { reason: "module-not-in-snapshot" } }],
    });
  });

  it("bundles definition inspection without executing it in the compiler process", async () => {
    const snapshot: CompilationSnapshot = Object.freeze({
      config: {} as CompilationSnapshot["config"],
      registries: Object.freeze({
        commands: Object.freeze([]),
        aggregateSchemas: Object.freeze([]),
        schemas: Object.freeze([]),
        progressions: Object.freeze([]),
        components: Object.freeze([]),
        content: Object.freeze([]),
        assets: Object.freeze([]),
      }),
      files: new Map(),
    });

    const bundled = await bundleDefinitionInspection(snapshot);

    expect(bundled.kind).toBe("bundled");
    if (bundled.kind === "bundled") {
      await expect(inspectDefinitionBundle(bundled.bytes)).resolves.toEqual({
        kind: "valid",
        metadata: { commands: [], progressions: [] },
      });
    }
  });
});
