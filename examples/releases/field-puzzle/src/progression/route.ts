import { defineProgression } from "@plotpoint/runtime";

import type { AdvanceOutcome, AdvancePayload, FieldState } from "../commands/advance.js";

export const fieldProgression = defineProgression<
  "player",
  FieldState,
  AdvancePayload,
  AdvanceOutcome
>({
  aggregateKind: "player",
  graphId: "field.route",
  graphVersion: 1,
  nodes: [
    { nodeId: "first-checkpoint", initialStatus: "active" },
    { nodeId: "puzzle", initialStatus: "locked" },
    { nodeId: "second-checkpoint", initialStatus: "locked" },
    { nodeId: "complete", initialStatus: "locked" },
  ],
  automaticRules: [],
});
