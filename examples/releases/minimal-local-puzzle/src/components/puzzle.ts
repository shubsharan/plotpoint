import type { PuzzleContent } from "../initial-state.js";

export interface PuzzleCardContext {
  readonly content: Readonly<{
    "minimal.puzzle-data": PuzzleContent;
  }>;
}

export function PuzzleCard(context: PuzzleCardContext): HTMLElement {
  const content = context.content["minimal.puzzle-data"];
  const card = document.createElement("article");
  card.dataset.component = "minimal.puzzle-card";

  const title = document.createElement("h1");
  title.textContent = content.title;
  const prompt = document.createElement("p");
  prompt.textContent = content.prompt;
  const clue = document.createElement("p");
  clue.textContent = content.clue;
  const answer = document.createElement("label");
  answer.textContent = content.answerLabel;

  card.append(title, prompt, clue, answer);
  return card;
}
