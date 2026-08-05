import { defineCommand, type JsonObject } from "@plotpoint/runtime";

export type SessionState = JsonObject & { readonly activeRound: number; readonly status: string };
export type AdvanceRoundPayload = JsonObject & { readonly expectedRound: number };
export type AdvanceRoundOutcome = JsonObject & { readonly activeRound: number };

export const advanceRoundCommand = defineCommand<
  "session",
  SessionState,
  AdvanceRoundPayload,
  AdvanceRoundOutcome
>({
  definitionId: "hunt.advance-round",
  commandType: "advance-round",
  aggregateKind: "session",
  handle(target, command) {
    const activeRound = Math.max(target.state.activeRound, command.payload.expectedRound + 1);
    return {
      kind: "accepted",
      nextState: { activeRound, status: "running" },
      outcome: { activeRound },
      domainEvents: [{ type: "hunt-round-advanced", activeRound }],
      effectIntents: [{ type: "play-round-chime", activeRound }],
      progressionIntents: [],
    };
  },
});
