import { describe, expect, it } from "vitest";

import { defineProgression, type ProgressionInstance } from "@plotpoint/runtime";
import { validateProgressionGraph } from "../../src/progression/validate-graph.js";

const definition = defineProgression({
  aggregateKind: "player",
  graphId: "graph.v1",
  graphVersion: 1,
  nodes: [
    { nodeId: "b", initialStatus: "locked" },
    { nodeId: "A", initialStatus: "active" },
  ],
  automaticRules: [],
});

describe("progression definition and instance validation", () => {
  it("normalizes static definitions once with ordinal ordering", () => {
    expect(definition.nodes.map((node) => node.nodeId)).toEqual(["A", "b"]);
    expect(Object.isFrozen(definition.nodes)).toBe(true);
    expect(Object.isFrozen(definition)).toBe(true);
  });

  it("orders mixed case and punctuation by ordinal code units", () => {
    const mixed = defineProgression({
      aggregateKind: "player",
      graphId: "ordinal.v1",
      graphVersion: 1,
      nodes: ["a_", "a-", "a", "A"].map((nodeId) => ({
        nodeId,
        initialStatus: "locked" as const,
      })),
      automaticRules: [],
    });

    expect(mixed.nodes.map((node) => node.nodeId)).toEqual(["A", "a", "a-", "a_"]);
  });

  it("rejects malformed static definitions at construction", () => {
    expect(() =>
      defineProgression({
        aggregateKind: "player",
        graphId: "duplicate.v1",
        graphVersion: 1,
        nodes: [
          { nodeId: "a", initialStatus: "locked" },
          { nodeId: "a", initialStatus: "active" },
        ],
        automaticRules: [],
      }),
    ).toThrow("Invalid or duplicate progression node");
  });

  it("validates dynamic instance shape and command intents", () => {
    const valid: ProgressionInstance = {
      graphId: "graph.v1",
      graphVersion: 1,
      nodes: [
        { nodeId: "A", status: "active" },
        { nodeId: "b", status: "locked" },
      ],
    };
    expect(validateProgressionGraph({ definition, progression: valid }).kind).toBe("valid");
    expect(
      validateProgressionGraph({
        definition,
        progression: valid,
        intents: [{ nodeId: "b", from: "locked", to: "active" }],
      }).kind,
    ).toBe("invalid");
  });
});
