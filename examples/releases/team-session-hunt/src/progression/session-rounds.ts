import { defineProgression } from "@plotpoint/runtime";

import type {
  AdvanceRoundOutcome,
  AdvanceRoundPayload,
  SessionState,
} from "../commands/advance-round.js";

export const sessionRoundsProgression = defineProgression<
  "session",
  SessionState,
  AdvanceRoundPayload,
  AdvanceRoundOutcome
>({
  aggregateKind: "session",
  graphId: "hunt.session-rounds.v1",
  graphVersion: 1,
  nodes: [
    { nodeId: "briefing", initialStatus: "active" },
    { nodeId: "live-round", initialStatus: "locked" },
    { nodeId: "debrief", initialStatus: "locked" },
  ],
  automaticRules: [
    {
      ruleId: "open-live-round",
      targetNodeId: "live-round",
      from: ["locked"],
      to: "available",
      priority: 0,
      when: ({ aggregateState }) => aggregateState.activeRound >= 1,
    },
    {
      ruleId: "open-debrief",
      targetNodeId: "debrief",
      from: ["locked"],
      to: "available",
      priority: 1,
      when: ({ aggregateState }) => aggregateState.activeRound >= 3,
    },
  ],
});
