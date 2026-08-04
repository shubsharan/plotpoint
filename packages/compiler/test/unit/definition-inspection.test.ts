import { describe, expect, it } from "vitest";

import { generateDefinitionInspectionEntry } from "../../src/composition/generated-entries.js";
import { inspectDefinitionBundle } from "../../src/composition/inspect-definitions.js";
import { buildCanonicalRegistries } from "../../src/composition/registries.js";
import type { ProjectConfigurationV1 } from "../../src/project/config.js";

function registries() {
  const config: ProjectConfigurationV1 = {
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
        definition: { source: "src/solve.ts", export: "solveCommand" },
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
        id: "puzzle.v1",
        version: 1,
        kind: "player",
        definition: { source: "src/progression.ts", export: "puzzleProgression" },
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
  const result = buildCanonicalRegistries(config);
  if (result.kind !== "valid") throw new Error("expected registries");
  return result.registries;
}

describe("definition inspection", () => {
  it("generates metadata-only reads without calling handlers or predicates", () => {
    const source = generateDefinitionInspectionEntry(registries());

    expect(source).toContain('commandModule0["solveCommand"]');
    expect(source).toContain('progressionModule0["puzzleProgression"]');
    expect(source).not.toMatch(/\.handle\s*\(/);
    expect(source).not.toMatch(/\.when\s*\(/);
  });

  it("returns canonical metadata from a bounded subprocess", async () => {
    const metadata = {
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
          registrationId: "puzzle.v1",
          graphId: "puzzle.v1",
          graphVersion: 1,
          aggregateKind: "player",
          nodes: [{ nodeId: "solve", initialStatus: "active" }],
          automaticRules: [],
        },
      ],
    };
    const result = await inspectDefinitionBundle(
      `console.log(${JSON.stringify(JSON.stringify(metadata))});`,
      { timeoutMs: 1_000, maxOutputBytes: 16_384 },
    );

    expect(result).toEqual({ kind: "valid", metadata });
  });

  it("terminates an inspection bundle that exceeds its deadline", async () => {
    const result = await inspectDefinitionBundle("setInterval(() => {}, 1_000);", {
      timeoutMs: 25,
      maxOutputBytes: 1_024,
    });

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.diagnostic.code).toBe("definition-inspection-timeout");
    }
  });
});
