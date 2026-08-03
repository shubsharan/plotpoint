import { describe, expect, it } from "vitest";

import {
  defineProgression,
  type Command,
  type DefinedProgression,
  type JsonObject,
  type ProgressionInstance,
} from "@plotpoint/runtime";
import { evaluateProgression } from "../../src/progression/evaluate-progression.js";

type State = JsonObject & { readonly unlocked: boolean };
type Outcome = JsonObject & { readonly result: string };

const command: Command<JsonObject, "player"> = {
  id: "c1",
  type: "advance",
  target: { kind: "player", id: "p1" },
  expectedStateVersion: 0,
  payload: {},
};

function run(
  definition: DefinedProgression<State, JsonObject, Outcome, "player">,
  progression: ProgressionInstance,
) {
  return evaluateProgression({
    definition,
    progression,
    intents: [],
    aggregateState: { unlocked: true },
    command,
    outcome: { result: "ok" },
    domainEvents: [],
    observationTrace: [],
    maxAutomaticTransitions: 10,
  });
}

describe("evaluateProgression", () => {
  it("applies independent winners as one canonical parallel batch", () => {
    const definition = defineProgression<"player", State, JsonObject, Outcome>({
      aggregateKind: "player",
      graphId: "parallel.v1",
      graphVersion: 1,
      nodes: [
        { nodeId: "root", initialStatus: "active" },
        { nodeId: "west", initialStatus: "locked" },
        { nodeId: "east", initialStatus: "locked" },
      ],
      automaticRules: [
        {
          ruleId: "unlock-west",
          targetNodeId: "west",
          from: ["locked"],
          to: "available",
          priority: 0,
          when: ({ aggregateState }) => aggregateState.unlocked,
        },
        {
          ruleId: "unlock-east",
          targetNodeId: "east",
          from: ["locked"],
          to: "available",
          priority: 0,
          when: ({ progression }) => progression.nodes.every((node) => node.status !== "available"),
        },
      ],
    });
    const progression: ProgressionInstance = {
      graphId: "parallel.v1",
      graphVersion: 1,
      nodes: [
        { nodeId: "east", status: "locked" },
        { nodeId: "root", status: "active" },
        { nodeId: "west", status: "locked" },
      ],
    };

    const result = run(definition, progression);

    expect(result.kind).toBe("stable");
    if (result.kind === "stable") {
      expect(result.progression.nodes).toEqual([
        { nodeId: "east", status: "available" },
        { nodeId: "root", status: "active" },
        { nodeId: "west", status: "available" },
      ]);
      expect(result.trace.map((step) => [step.round, step.nodeId])).toEqual([
        [1, "east"],
        [1, "west"],
      ]);
    }
  });

  it("selects the lowest priority per node", () => {
    const definition = defineProgression<"player", State, JsonObject, Outcome>({
      aggregateKind: "player",
      graphId: "priority.v1",
      graphVersion: 1,
      nodes: [{ nodeId: "node", initialStatus: "available" }],
      automaticRules: [
        {
          ruleId: "complete",
          targetNodeId: "node",
          from: ["available"],
          to: "completed",
          priority: 5,
          when: () => true,
        },
        {
          ruleId: "activate",
          targetNodeId: "node",
          from: ["available"],
          to: "active",
          priority: 1,
          when: () => true,
        },
      ],
    });
    const result = run(definition, {
      graphId: "priority.v1",
      graphVersion: 1,
      nodes: [{ nodeId: "node", status: "available" }],
    });

    expect(result.kind).toBe("stable");
    if (result.kind === "stable") expect(result.progression.nodes[0]?.status).toBe("active");
  });

  it("reports equal-priority conflicts", () => {
    const definition = defineProgression<"player", State, JsonObject, Outcome>({
      aggregateKind: "player",
      graphId: "conflict.v1",
      graphVersion: 1,
      nodes: [{ nodeId: "node", initialStatus: "available" }],
      automaticRules: [
        {
          ruleId: "a",
          targetNodeId: "node",
          from: ["available"],
          to: "active",
          priority: 0,
          when: () => true,
        },
        {
          ruleId: "b",
          targetNodeId: "node",
          from: ["available"],
          to: "skipped",
          priority: 0,
          when: () => true,
        },
      ],
    });
    const result = run(definition, {
      graphId: "conflict.v1",
      graphVersion: 1,
      nodes: [{ nodeId: "node", status: "available" }],
    });

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") expect(result.diagnostic.code).toBe("progression-conflict");
  });

  it("applies command completion and skipping intents before stable evaluation", () => {
    const definition = defineProgression<"player", State, JsonObject, Outcome>({
      aggregateKind: "player",
      graphId: "direct.v1",
      graphVersion: 1,
      nodes: [
        { nodeId: "a", initialStatus: "active" },
        { nodeId: "b", initialStatus: "available" },
      ],
      automaticRules: [],
    });
    const result = evaluateProgression({
      definition,
      progression: {
        graphId: "direct.v1",
        graphVersion: 1,
        nodes: [
          { nodeId: "a", status: "active" },
          { nodeId: "b", status: "available" },
        ],
      },
      intents: [
        { nodeId: "a", from: "active", to: "completed" },
        { nodeId: "b", from: "available", to: "skipped" },
      ],
      aggregateState: { unlocked: true },
      command,
      outcome: { result: "ok" },
      domainEvents: [],
      observationTrace: [],
      maxAutomaticTransitions: 0,
    });

    expect(result.kind).toBe("stable");
    if (result.kind === "stable")
      expect(result.trace.map((step) => step.source)).toEqual(["command", "command"]);
  });
});
