import { defineCommand, type JsonObject } from "@plotpoint/runtime";

import type { PlayerState } from "../initial-state.js";

export type SolvePayload = JsonObject & {
  readonly answer: string;
};

export type SolveOutcome = JsonObject & {
  readonly result: "incorrect" | "solved";
};

export const solveCommand = defineCommand<"player", PlayerState, SolvePayload, SolveOutcome>({
  definitionId: "minimal.solve",
  commandType: "solve",
  aggregateKind: "player",
  handle(aggregate, command) {
    const solved = command.payload.answer.trim().toLowerCase() === "echo";
    return {
      kind: "accepted",
      nextState: {
        attempts: aggregate.state.attempts + 1,
        solved: aggregate.state.solved || solved,
      },
      outcome: { result: solved ? "solved" : "incorrect" },
      domainEvents: [],
      effectIntents: [],
      progressionIntents: [],
    };
  },
});
