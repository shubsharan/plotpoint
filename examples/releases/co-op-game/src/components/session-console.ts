export interface RoundSummary {
  readonly durationMinutes: number;
  readonly round: number;
  readonly title: string;
}

export function SessionConsole(rounds: readonly RoundSummary[]): HTMLElement {
  const consoleElement = document.createElement("ol");
  consoleElement.dataset.component = "hunt.session-console";
  for (const round of rounds) {
    const item = document.createElement("li");
    item.textContent = `Round ${round.round}: ${round.title} (${round.durationMinutes} min)`;
    consoleElement.append(item);
  }
  return consoleElement;
}
