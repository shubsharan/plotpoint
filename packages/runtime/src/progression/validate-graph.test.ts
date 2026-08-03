import { describe, expect, it } from "vitest";

import {
  validateProgressionGraph,
  type ProgressionDefinition,
  type ProgressionInstance,
} from "../index.js";

const instance: ProgressionInstance = {
  graphId: "graph.v1",
  graphVersion: 1,
  nodes: [
    { nodeId: "a", status: "active" },
    { nodeId: "b", status: "locked" },
  ],
};

const valid: ProgressionDefinition = {
  graphId: "graph.v1",
  graphVersion: 1,
  nodes: [
    { nodeId: "a", initialStatus: "active" },
    { nodeId: "b", initialStatus: "locked" },
  ],
  automaticRules: [
    {
      ruleId: "unlock-b",
      targetNodeId: "b",
      from: ["locked"],
      to: "available",
      priority: 0,
      when: () => false,
    },
  ],
};

describe("validateProgressionGraph", () => {
  it("accepts a matching graph and canonical instance", () => {
    expect(
      validateProgressionGraph({ definition: valid, progression: instance, intents: [] }).kind,
    ).toBe("valid");
  });

  it.each([
    ["duplicate node", { ...valid, nodes: [...valid.nodes, valid.nodes[0]] }],
    [
      "unknown target",
      { ...valid, automaticRules: [{ ...valid.automaticRules[0], targetNodeId: "missing" }] },
    ],
    [
      "same-state rule",
      { ...valid, automaticRules: [{ ...valid.automaticRules[0], to: "locked" }] },
    ],
    [
      "terminal reopening",
      { ...valid, automaticRules: [{ ...valid.automaticRules[0], from: ["completed"] }] },
    ],
    [
      "invalid priority",
      { ...valid, automaticRules: [{ ...valid.automaticRules[0], priority: 0.5 }] },
    ],
  ])("rejects %s", (_name, definition) => {
    expect(
      validateProgressionGraph({
        definition: definition as ProgressionDefinition,
        progression: instance,
      }).kind,
    ).toBe("invalid");
  });

  it.each([
    ["version mismatch", { ...instance, graphVersion: 2 }],
    ["missing node", { ...instance, nodes: instance.nodes.slice(0, 1) }],
    [
      "extra node",
      { ...instance, nodes: [...instance.nodes, { nodeId: "c", status: "locked" as const }] },
    ],
  ])("rejects instance %s", (_name, progression) => {
    expect(validateProgressionGraph({ definition: valid, progression }).kind).toBe("invalid");
  });

  it("rejects malformed and duplicate direct intents", () => {
    expect(
      validateProgressionGraph({
        definition: valid,
        progression: instance,
        intents: [
          { nodeId: "b", from: "locked", to: "available" },
          { nodeId: "b", from: "locked", to: "skipped" },
        ],
      }).kind,
    ).toBe("invalid");
    expect(
      validateProgressionGraph({
        definition: valid,
        progression: instance,
        intents: [{ nodeId: "a", from: "locked", to: "available" }],
      }).kind,
    ).toBe("invalid");
  });

  it("returns a diagnostic for malformed JavaScript graph shapes", () => {
    expect(
      validateProgressionGraph({
        definition: { ...valid, nodes: null } as never,
        progression: instance,
      }).kind,
    ).toBe("invalid");
  });
});
