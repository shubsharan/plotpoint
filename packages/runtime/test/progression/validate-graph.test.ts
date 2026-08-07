import { describe, expect, it } from "vitest";

import {
  canonicalizeValue,
  defineProgression,
  initialProgression,
  type ProgressionInstance,
} from "@plotpoint/runtime";
import { validateProgressionGraph } from "../../src/progression/validate-graph.js";

const definition = defineProgression({
  aggregateKind: "player",
  graphId: "graph",
  nodes: [
    { nodeId: "b", initialStatus: "locked" },
    { nodeId: "A", initialStatus: "active" },
  ],
  transitions: [
    {
      transitionId: "unlock-b",
      targetNodeId: "b",
      from: ["locked"],
      to: "available",
      priority: 0,
      trigger: "intent",
    },
  ],
});

describe("progression definition and instance validation", () => {
  it("normalizes plain definitions and initial state with ordinal ordering", () => {
    const initial = initialProgression(definition);

    expect(definition.nodes.map((node) => node.nodeId)).toEqual(["A", "b"]);
    expect(initial).toEqual({
      graphId: "graph",
      nodes: [
        { nodeId: "A", status: "active" },
        { nodeId: "b", status: "locked" },
      ],
    });
    expect(definition).not.toHaveProperty("graphVersion");
    expect(Object.isFrozen(definition.nodes)).toBe(true);
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(initial)).toBe(true);
    expect(Object.isFrozen(initial.nodes)).toBe(true);
    expect(initial.nodes.every(Object.isFrozen)).toBe(true);
    expect(initialProgression(definition)).not.toBe(initial);
  });

  it("orders mixed case and punctuation by ordinal code units", () => {
    const mixed = defineProgression({
      aggregateKind: "player",
      graphId: "ordinal",
      nodes: ["a_", "a-", "a", "A"].map((nodeId) => ({
        nodeId,
        initialStatus: "locked" as const,
      })),
      transitions: [],
    });

    expect(mixed.nodes.map((node) => node.nodeId)).toEqual(["A", "a", "a-", "a_"]);
  });

  it("rejects malformed static definitions at construction", () => {
    expect(() =>
      defineProgression({
        aggregateKind: "player",
        graphId: "duplicate",
        nodes: [
          { nodeId: "a", initialStatus: "locked" },
          { nodeId: "a", initialStatus: "active" },
        ],
        transitions: [],
      }),
    ).toThrow("Invalid or duplicate progression node");
  });

  it("requires every legal edge to have one stable name and declared target", () => {
    expect(() =>
      defineProgression({
        aggregateKind: "player",
        graphId: "duplicate-edge",
        nodes: [
          { nodeId: "a", initialStatus: "locked" },
          { nodeId: "b", initialStatus: "locked" },
        ],
        transitions: [
          {
            transitionId: "unlock",
            targetNodeId: "a",
            from: ["locked"],
            to: "available",
            priority: 0,
            trigger: "intent",
          },
          {
            transitionId: "unlock",
            targetNodeId: "b",
            from: ["locked"],
            to: "available",
            priority: 0,
            trigger: "intent",
          },
        ],
      }),
    ).toThrow("Invalid progression transition");
    expect(() =>
      defineProgression({
        aggregateKind: "player",
        graphId: "unknown-target",
        nodes: [{ nodeId: "known", initialStatus: "locked" }],
        transitions: [
          {
            transitionId: "unlock-missing",
            targetNodeId: "missing",
            from: ["locked"],
            to: "available",
            priority: 0,
            trigger: "intent",
          },
        ],
      }),
    ).toThrow("Invalid progression transition");
  });

  it("rejects unnamed behavior and illegal lifecycle edges at construction", () => {
    expect(() =>
      defineProgression({
        aggregateKind: "player",
        graphId: "automatic-without-predicate",
        nodes: [{ nodeId: "a", initialStatus: "locked" }],
        transitions: [
          {
            transitionId: "unlock",
            targetNodeId: "a",
            from: ["locked"],
            to: "available",
            priority: 0,
            trigger: "automatic",
          } as never,
        ],
      }),
    ).toThrow("Invalid progression transition");
    expect(() =>
      defineProgression({
        aggregateKind: "player",
        graphId: "illegal-edge",
        nodes: [{ nodeId: "a", initialStatus: "locked" }],
        transitions: [
          {
            transitionId: "complete",
            targetNodeId: "a",
            from: ["locked"],
            to: "completed",
            priority: 0,
            trigger: "intent",
          },
        ],
      }),
    ).toThrow("Illegal progression transition");
  });

  it("validates dynamic instance shape and named command intents", () => {
    const valid = initialProgression(definition);
    expect(validateProgressionGraph({ definition, progression: valid }).kind).toBe("valid");
    expect(
      validateProgressionGraph({
        definition,
        progression: valid,
        intents: [{ transitionId: "unlock-b" }],
      }).kind,
    ).toBe("valid");
    expect(
      validateProgressionGraph({
        definition,
        progression: valid,
        intents: [{ transitionId: "missing" }],
      }).kind,
    ).toBe("invalid");
  });

  it.each([
    { nodes: [] },
    { graphId: 42, nodes: [] },
    {
      graphId: "graph",
      nodes: [{ nodeId: "A", status: "active" }, { status: "locked" }],
    },
    {
      graphId: "graph",
      nodes: [
        { nodeId: "A", status: "active" },
        { nodeId: "b", status: "unknown" },
      ],
    },
  ])("returns a canonical diagnostic for malformed progression %#", (progression) => {
    expect(() =>
      validateProgressionGraph({ definition, progression: progression as never }),
    ).not.toThrow();
    const result = validateProgressionGraph({ definition, progression: progression as never });
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.diagnostic.code).toBe("progression-state-invalid");
      expect(canonicalizeValue(result.diagnostic).kind).toBe("valid");
    }
  });

  it("narrows malformed intent fields before constructing a diagnostic", () => {
    const progression: ProgressionInstance = initialProgression(definition);
    const result = validateProgressionGraph({
      definition,
      progression,
      intents: [{} as never],
    });
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.diagnostic.code).toBe("progression-intent-invalid");
      expect(canonicalizeValue(result.diagnostic).kind).toBe("valid");
    }
  });
});
