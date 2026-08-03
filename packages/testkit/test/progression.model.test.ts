import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { defineProgression, type Command, type JsonObject } from "@plotpoint/runtime";
import { evaluateProgression } from "../../runtime/src/progression/evaluate-progression.js";

const command: Command<JsonObject, "player"> = {
  id: "c1",
  type: "unlock",
  target: { kind: "player", id: "p1" },
  expectedStateVersion: 0,
  payload: {},
};

function reference(enabled: readonly boolean[]): readonly string[] {
  return enabled.map((value) => (value ? "available" : "locked"));
}

function implementation(enabled: readonly boolean[]): readonly string[] {
  const definition = defineProgression({
    aggregateKind: "player",
    graphId: "model.v1",
    graphVersion: 1,
    nodes: enabled.map((_value, index) => ({ nodeId: `n${index}`, initialStatus: "locked" })),
    automaticRules: enabled.map((value, index) => ({
      ruleId: `r${index}`,
      targetNodeId: `n${index}`,
      from: ["locked"],
      to: "available",
      priority: 0,
      when: () => value,
    })),
  });
  const result = evaluateProgression({
    definition,
    progression: {
      graphId: "model.v1",
      graphVersion: 1,
      nodes: enabled.map((_value, index) => ({ nodeId: `n${index}`, status: "locked" })),
    },
    intents: [],
    aggregateState: {} as JsonObject,
    command,
    outcome: {},
    domainEvents: [],
    observationTrace: [],
    maxAutomaticTransitions: 4,
  });
  expect(result.kind).toBe("stable");
  return result.kind === "stable" ? result.progression.nodes.map((node) => node.status) : [];
}

describe("progression reference model", () => {
  it("matches a simpler parallel-unlock model for seeded generated cases", () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 2, maxLength: 4 }), (enabled) => {
        expect(implementation(enabled)).toEqual(reference(enabled));
      }),
      { seed: 20_260_803, numRuns: 100 },
    );
  });

  it("exhaustively compares every two-to-four-node boolean graph", () => {
    for (let nodeCount = 2; nodeCount <= 4; nodeCount += 1) {
      for (let mask = 0; mask < 2 ** nodeCount; mask += 1) {
        const enabled = Array.from(
          { length: nodeCount },
          (_value, index) => (mask & (1 << index)) !== 0,
        );
        expect(implementation(enabled)).toEqual(reference(enabled));
      }
    }
  });
});
