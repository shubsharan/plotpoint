import { defineProgression } from "@plotpoint/runtime";

import type { SolveClueOutcome, SolveCluePayload, TeamState } from "../commands/solve-clue.js";

export const teamRouteProgression = defineProgression<
  "team",
  TeamState,
  SolveCluePayload,
  SolveClueOutcome
>({
  aggregateKind: "team",
  graphId: "hunt.team-route.v1",
  graphVersion: 1,
  nodes: [
    { nodeId: "search", initialStatus: "active" },
    { nodeId: "decode", initialStatus: "locked" },
    { nodeId: "rendezvous", initialStatus: "locked" },
  ],
  automaticRules: [
    {
      ruleId: "unlock-decode",
      targetNodeId: "decode",
      from: ["locked"],
      to: "available",
      priority: 0,
      when: ({ aggregateState }) => aggregateState.solvedClues.length >= 1,
    },
    {
      ruleId: "unlock-rendezvous",
      targetNodeId: "rendezvous",
      from: ["locked"],
      to: "available",
      priority: 1,
      when: ({ aggregateState }) => aggregateState.solvedClues.length >= 2,
    },
  ],
});
