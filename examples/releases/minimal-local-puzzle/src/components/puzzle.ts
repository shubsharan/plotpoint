export interface PuzzleCardContent {
  readonly answerLabel: string;
  readonly clue: string;
  readonly prompt: string;
  readonly title: string;
}

export function PuzzleCard(content: PuzzleCardContent): HTMLElement {
  const card = document.createElement("article");
  card.dataset.component = "minimal.puzzle-card.v1";

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
