export interface ClueSummary {
  readonly clueId: string;
  readonly prompt: string;
  readonly zone: string;
}

interface SharedHuntClient {
  getView(): Promise<{
    readonly projections: readonly {
      readonly aggregateId: string;
      readonly schemaId: string;
      readonly stateVersion: number;
      readonly value: object;
    }[];
  }>;
  enqueueCommand(
    command: object,
  ): Promise<{ readonly terminal: string; readonly outcomeCode?: string }>;
}

export async function discoverTarget(
  client: SharedHuntClient,
  targetId: string,
  observationId: string,
  commandId: string,
): Promise<{ readonly terminal: string; readonly outcomeCode?: string }> {
  const view = await client.getView();
  const team = view.projections.find(({ schemaId }) => schemaId === "plotpoint.hunt.team-state");
  if (team === undefined) throw new Error("hunt-team-projection-missing");
  return client.enqueueCommand({
    commandId,
    target: {
      aggregateKind: "team",
      aggregateId: team.aggregateId,
      schemaId: team.schemaId,
      schemaVersion: 1,
    },
    expectedStateVersion: team.stateVersion,
    type: "plotpoint.hunt.target-discovery",
    payload: { targetId },
    observationIds: [observationId],
  });
}

export function ClueBoard(clues: readonly ClueSummary[]): HTMLElement {
  const board = document.createElement("section");
  board.dataset.component = "hunt.clue-board";
  for (const clue of clues) {
    const item = document.createElement("article");
    item.dataset.clueId = clue.clueId;
    item.textContent = `${clue.zone}: ${clue.prompt}`;
    board.append(item);
  }
  return board;
}
