import { describe, expect, it } from "vitest";

import { generateDefinitionInspectionEntry } from "../../src/composition/generated-entries.js";
import { inspectDefinitionBundle } from "../../src/composition/inspect-definitions.js";
import { buildCanonicalRegistries } from "../../src/composition/registries.js";
import type { ProjectConfiguration } from "../../src/project/config.js";

function registries() {
  const config: ProjectConfiguration = {
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
        initializationSchema: "initialization",
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
        definition: { source: "src/solve.ts", export: "solveCommand" },
        aggregateModel: "player",
        payloadSchema: "payload",
        outcomeSchema: "outcome",
      },
    ],
    schemas: [
      { id: "player-state", path: "schemas/player.json" },
      { id: "initialization", path: "schemas/initialization.json" },
      { id: "payload", path: "schemas/payload.json" },
      { id: "outcome", path: "schemas/outcome.json" },
    ],
    progressions: [
      {
        id: "puzzle",
        definition: { source: "src/progression.ts", export: "puzzleProgression" },
        aggregateModel: "player",
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
    expect(source).toContain('initializerModule0["initialize"]');
    expect(source).toContain('applicationModule["application"]');
    expect(source).not.toMatch(/\.handle\s*\(/);
    expect(source).not.toMatch(/\.when\s*\(/);
  });

  it("returns canonical metadata from a bounded subprocess", async () => {
    const metadata = {
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
          registrationId: "puzzle",
          graphId: "puzzle",
          aggregateKind: "player",
          nodes: [{ nodeId: "solve", initialStatus: "active" }],
          transitions: [],
        },
      ],
      components: [],
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
