import { defineCommand, type JsonObject } from "@plotpoint/runtime";

export type TeamState = JsonObject & {
  readonly score: number;
  readonly solvedClues: readonly string[];
};
export type SolveCluePayload = JsonObject & { readonly answer: string; readonly clueId: string };
export type SolveClueOutcome = JsonObject & { readonly correct: boolean; readonly score: number };

export const solveClueCommand = defineCommand<
  "team",
  TeamState,
  SolveCluePayload,
  SolveClueOutcome
>({
  definitionId: "hunt.solve-clue",
  commandType: "solve-clue",
  aggregateKind: "team",
  handle(target, command) {
    const correct = command.payload.answer.trim().length >= 3;
    const solvedClues =
      correct && !target.state.solvedClues.includes(command.payload.clueId)
        ? [...target.state.solvedClues, command.payload.clueId]
        : target.state.solvedClues;
    const score = target.state.score + (correct ? 10 : 0);
    return {
      kind: "accepted",
      nextState: { score, solvedClues },
      outcome: { correct, score },
      domainEvents: [
        {
          type: correct ? "hunt-clue-solved" : "hunt-answer-rejected",
          clueId: command.payload.clueId,
        },
      ],
      effectIntents: [],
      progressionIntents: [],
    };
  },
});
