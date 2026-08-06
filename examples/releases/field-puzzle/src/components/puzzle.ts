import type { FieldGameContent } from "../initial-state.js";

export interface FieldPuzzleContext {
  readonly content: Readonly<{
    "field.game": FieldGameContent;
  }>;
}

export function FieldPuzzle(context: FieldPuzzleContext): HTMLElement {
  const game = context.content["field.game"];
  const card = document.createElement("section");
  card.dataset.component = "field.puzzle";

  const title = document.createElement("h1");
  title.textContent = game.title;
  const prompt = document.createElement("p");
  prompt.textContent = game.puzzle.prompt;
  card.append(title, prompt);
  return card;
}
