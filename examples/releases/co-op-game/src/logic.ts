import { advanceRoundCommand } from "./commands/advance-round.js";
import { solveClueCommand } from "./commands/solve-clue.js";
import { sessionRoundsProgression } from "./progression/session-rounds.js";
import { teamRouteProgression } from "./progression/team-route.js";

export const logic = Object.freeze({
  commands: Object.freeze([advanceRoundCommand, solveClueCommand]),
  progressions: Object.freeze([sessionRoundsProgression, teamRouteProgression]),
});
