import { defineProgression } from "@plotpoint/runtime";

import type {
  ChooseSceneOutcome,
  ChooseScenePayload,
  TourState,
} from "../commands/choose-scene.js";

export const routeProgression = defineProgression<
  "player",
  TourState,
  ChooseScenePayload,
  ChooseSceneOutcome
>({
  aggregateKind: "player",
  graphId: "tour.branching-route.v1",
  graphVersion: 1,
  nodes: [
    { nodeId: "arrive", initialStatus: "active" },
    { nodeId: "choose-branch", initialStatus: "locked" },
    { nodeId: "finale", initialStatus: "locked" },
  ],
  automaticRules: [
    {
      ruleId: "unlock-branch",
      targetNodeId: "choose-branch",
      from: ["locked"],
      to: "available",
      priority: 0,
      when: ({ aggregateState }) => aggregateState.visitedScenes.length >= 1,
    },
    {
      ruleId: "unlock-finale",
      targetNodeId: "finale",
      from: ["locked"],
      to: "available",
      priority: 1,
      when: ({ aggregateState }) => aggregateState.visitedScenes.length >= 2,
    },
  ],
});
