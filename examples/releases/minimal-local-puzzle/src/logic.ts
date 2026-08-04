import { solveCommand } from "./commands/solve.js";
import { puzzleProgression } from "./progression/main.js";

export const logic = Object.freeze({
  commands: Object.freeze([solveCommand]),
  progressions: Object.freeze([puzzleProgression]),
});
