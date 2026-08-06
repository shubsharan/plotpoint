import { defineProgression } from "@plotpoint/runtime";

import type { PlayerState } from "../initial-state.js";

export const puzzleProgression = defineProgression<"player", PlayerState>({
  aggregateKind: "player",
  graphId: "minimal.puzzle",
  nodes: [
    { nodeId: "celebrate", initialStatus: "locked" },
    { nodeId: "solve-riddle", initialStatus: "active" },
  ],
  transitions: [
    {
      transitionId: "complete-riddle",
      targetNodeId: "solve-riddle",
      from: ["active"],
      to: "completed",
      priority: 0,
      trigger: "automatic",
      when: ({ aggregateState }) => aggregateState.solved,
    },
    {
      transitionId: "unlock-celebration",
      targetNodeId: "celebrate",
      from: ["locked"],
      to: "available",
      priority: 0,
      trigger: "automatic",
      when: ({ aggregateState }) => aggregateState.solved,
    },
  ],
});
