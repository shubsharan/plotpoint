import { defineProgression } from "@plotpoint/runtime";

import type { FieldState } from "../initial-state.js";

export const fieldProgression = defineProgression<"player", FieldState>({
  aggregateKind: "player",
  graphId: "field.route",
  nodes: [
    { nodeId: "complete", initialStatus: "locked" },
    { nodeId: "first-checkpoint", initialStatus: "active" },
    { nodeId: "puzzle", initialStatus: "locked" },
    { nodeId: "second-checkpoint", initialStatus: "locked" },
  ],
  transitions: [
    {
      transitionId: "complete-first-checkpoint",
      targetNodeId: "first-checkpoint",
      from: ["active"],
      to: "completed",
      priority: 0,
      trigger: "automatic",
      when: ({ aggregateState }) => aggregateState.phase !== "first-checkpoint",
    },
    {
      transitionId: "unlock-puzzle",
      targetNodeId: "puzzle",
      from: ["locked"],
      to: "available",
      priority: 0,
      trigger: "automatic",
      when: ({ aggregateState }) => aggregateState.phase !== "first-checkpoint",
    },
    {
      transitionId: "complete-puzzle",
      targetNodeId: "puzzle",
      from: ["available", "active"],
      to: "completed",
      priority: 0,
      trigger: "automatic",
      when: ({ aggregateState }) =>
        aggregateState.phase === "second-checkpoint" || aggregateState.phase === "complete",
    },
    {
      transitionId: "unlock-second-checkpoint",
      targetNodeId: "second-checkpoint",
      from: ["locked"],
      to: "available",
      priority: 0,
      trigger: "automatic",
      when: ({ aggregateState }) =>
        aggregateState.phase === "second-checkpoint" || aggregateState.phase === "complete",
    },
    {
      transitionId: "complete-second-checkpoint",
      targetNodeId: "second-checkpoint",
      from: ["available", "active"],
      to: "completed",
      priority: 0,
      trigger: "automatic",
      when: ({ aggregateState }) => aggregateState.phase === "complete",
    },
    {
      transitionId: "unlock-complete",
      targetNodeId: "complete",
      from: ["locked"],
      to: "available",
      priority: 0,
      trigger: "automatic",
      when: ({ aggregateState }) => aggregateState.phase === "complete",
    },
  ],
});
