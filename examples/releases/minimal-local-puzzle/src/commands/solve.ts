import { defineCommand, type JsonObject } from "@plotpoint/runtime";

export type PlayerState = JsonObject & {
  readonly attempts: number;
  readonly solved: boolean;
};

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
  handle(target, command) {
    const solved = command.payload.answer.trim().toLowerCase() === "echo";

    return {
      kind: "accepted",
      nextState: {
        attempts: target.state.attempts + 1,
        solved: target.state.solved || solved,
      },
      outcome: { result: solved ? "solved" : "incorrect" },
      domainEvents: [{ type: solved ? "puzzle-solved" : "answer-rejected" }],
      effectIntents: [],
      progressionIntents: solved
        ? [{ nodeId: "solve-riddle", from: "active", to: "completed" }]
        : [],
    };
  },
});
