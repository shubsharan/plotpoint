import { defineProgression } from "@plotpoint/runtime";

import type { PlayerState, SolveOutcome, SolvePayload } from "../commands/solve.js";

export const puzzleProgression = defineProgression<
  "player",
  PlayerState,
  SolvePayload,
  SolveOutcome
>({
  aggregateKind: "player",
  graphId: "minimal.puzzle.v1",
  graphVersion: 1,
  nodes: [
    { nodeId: "celebrate", initialStatus: "locked" },
    { nodeId: "solve-riddle", initialStatus: "active" },
  ],
  automaticRules: [
    {
      ruleId: "unlock-celebration",
      targetNodeId: "celebrate",
      from: ["locked"],
      to: "available",
      priority: 0,
      when: ({ aggregateState }) => aggregateState.solved,
    },
  ],
});
