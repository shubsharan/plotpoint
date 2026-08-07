import { defineProgression } from "@plotpoint/runtime";

import type { TourState } from "../commands/choose-scene.js";

export const routeProgression = defineProgression<"player", TourState>({
  aggregateKind: "player",
  graphId: "tour.branching-route",
  nodes: [
    { nodeId: "arrive", initialStatus: "active" },
    { nodeId: "choose-branch", initialStatus: "locked" },
    { nodeId: "finale", initialStatus: "locked" },
  ],
  transitions: [
    {
      transitionId: "unlock-branch",
      targetNodeId: "choose-branch",
      from: ["locked"],
      to: "available",
      priority: 0,
      trigger: "automatic",
      when: ({ aggregateState }) => aggregateState.visitedScenes.length >= 1,
    },
    {
      transitionId: "unlock-finale",
      targetNodeId: "finale",
      from: ["locked"],
      to: "available",
      priority: 1,
      trigger: "automatic",
      when: ({ aggregateState }) => aggregateState.visitedScenes.length >= 2,
    },
  ],
});
