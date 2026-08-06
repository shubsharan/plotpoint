import { describe, expect, it } from "vitest";

import {
  defineProgression,
  initialProgression,
  type JsonObject,
  type ProgressionDefinition,
  type ProgressionInstance,
} from "@plotpoint/runtime";
import { evaluateProgression } from "../../src/progression/evaluate-progression.js";

type State = JsonObject & { readonly unlocked: boolean };

function run(
  definition: ProgressionDefinition<State, "player">,
  progression: ProgressionInstance = initialProgression(definition),
) {
  return evaluateProgression({
    definition,
    progression,
    intents: [],
    aggregateState: { unlocked: true },
    commandId: "c1",
    domainEvents: [],
    maxAutomaticTransitions: 10,
  });
}

describe("evaluateProgression", () => {
  it("applies independent winners as one canonical parallel batch", () => {
    const definition = defineProgression<"player", State>({
      aggregateKind: "player",
      graphId: "parallel",
      nodes: [
        { nodeId: "root", initialStatus: "active" },
        { nodeId: "west", initialStatus: "locked" },
        { nodeId: "east", initialStatus: "locked" },
      ],
      transitions: [
        {
          transitionId: "unlock-west",
          targetNodeId: "west",
          from: ["locked"],
          to: "available",
          priority: 0,
          trigger: "automatic",
          when: ({ aggregateState }) => aggregateState.unlocked,
        },
        {
          transitionId: "unlock-east",
          targetNodeId: "east",
          from: ["locked"],
          to: "available",
          priority: 0,
          trigger: "automatic",
          when: ({ progression }) => progression.nodes.every((node) => node.status !== "available"),
        },
      ],
    });
    const result = run(definition);

    expect(result.kind).toBe("stable");
    if (result.kind === "stable") {
      expect(result.progression.nodes).toEqual([
        { nodeId: "east", status: "available" },
        { nodeId: "root", status: "active" },
        { nodeId: "west", status: "available" },
      ]);
      expect(result.trace.map((step) => [step.round, step.transitionId])).toEqual([
        [1, "unlock-east"],
        [1, "unlock-west"],
      ]);
    }
  });

  it("selects the lowest priority per node", () => {
    const definition = defineProgression<"player", State>({
      aggregateKind: "player",
      graphId: "priority",
      nodes: [{ nodeId: "node", initialStatus: "available" }],
      transitions: [
        {
          transitionId: "complete",
          targetNodeId: "node",
          from: ["available"],
          to: "completed",
          priority: 5,
          trigger: "automatic",
          when: () => true,
        },
        {
          transitionId: "activate",
          targetNodeId: "node",
          from: ["available"],
          to: "active",
          priority: 1,
          trigger: "automatic",
          when: () => true,
        },
      ],
    });
    const result = run(definition);

    expect(result.kind).toBe("stable");
    if (result.kind === "stable") expect(result.progression.nodes[0]?.status).toBe("active");
  });

  it("reports equal-priority conflicts", () => {
    const definition = defineProgression<"player", State>({
      aggregateKind: "player",
      graphId: "conflict",
      nodes: [{ nodeId: "node", initialStatus: "available" }],
      transitions: [
        {
          transitionId: "a",
          targetNodeId: "node",
          from: ["available"],
          to: "active",
          priority: 0,
          trigger: "automatic",
          when: () => true,
        },
        {
          transitionId: "b",
          targetNodeId: "node",
          from: ["available"],
          to: "skipped",
          priority: 0,
          trigger: "automatic",
          when: () => true,
        },
      ],
    });
    const result = run(definition);

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") expect(result.diagnostic.code).toBe("progression-conflict");
  });

  it("applies named command intents before automatic evaluation", () => {
    const definition = defineProgression<"player", State>({
      aggregateKind: "player",
      graphId: "direct",
      nodes: [
        { nodeId: "a", initialStatus: "active" },
        { nodeId: "b", initialStatus: "available" },
      ],
      transitions: [
        {
          transitionId: "complete-a",
          targetNodeId: "a",
          from: ["active"],
          to: "completed",
          priority: 0,
          trigger: "intent",
        },
        {
          transitionId: "skip-b",
          targetNodeId: "b",
          from: ["available"],
          to: "skipped",
          priority: 0,
          trigger: "intent",
        },
      ],
    });
    const result = evaluateProgression({
      definition,
      progression: initialProgression(definition),
      intents: [{ transitionId: "complete-a" }, { transitionId: "skip-b" }],
      aggregateState: { unlocked: true },
      commandId: "c1",
      domainEvents: [],
      maxAutomaticTransitions: 0,
    });

    expect(result.kind).toBe("stable");
    if (result.kind === "stable")
      expect(result.trace.map((step) => step.source)).toEqual(["command", "command"]);
  });
});
