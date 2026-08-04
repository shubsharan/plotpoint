import { ClueBoard } from "./components/clue-board.js";
import { SessionConsole } from "./components/session-console.js";

export { ClueBoard } from "./components/clue-board.js";
export { SessionConsole } from "./components/session-console.js";

export const presentation = Object.freeze({
  components: Object.freeze({
    "hunt.clue-board.v1": ClueBoard,
    "hunt.session-console.v1": SessionConsole,
  }),
});
