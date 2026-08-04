export interface ClueSummary {
  readonly clueId: string;
  readonly prompt: string;
  readonly zone: string;
}

export function ClueBoard(clues: readonly ClueSummary[]): HTMLElement {
  const board = document.createElement("section");
  board.dataset.component = "hunt.clue-board.v1";
  for (const clue of clues) {
    const item = document.createElement("article");
    item.dataset.clueId = clue.clueId;
    item.textContent = `${clue.zone}: ${clue.prompt}`;
    board.append(item);
  }
  return board;
}
