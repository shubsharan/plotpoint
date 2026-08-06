interface TargetContent {
  readonly targets: readonly {
    readonly targetId: string;
    readonly prompt: string;
    readonly zone: string;
  }[];
}

interface SharedProjection {
  readonly schemaId: string;
  readonly value: object;
}

interface ComponentContext {
  readonly lifecycle: { defer(cleanup: () => void | Promise<void>): void };
  readonly content: Readonly<Record<string, unknown>>;
  readonly shared?: {
    getView(): Promise<{ readonly projections: readonly SharedProjection[] }>;
    onSyncChanged(listener: () => void): () => void;
  };
}

function targetContent(value: unknown): TargetContent {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("targets" in value) ||
    !Array.isArray(value.targets)
  ) {
    throw new Error("co-op-target-content-invalid");
  }
  return value as TargetContent;
}

export function ClueBoard(context: ComponentContext): HTMLElement {
  const content = targetContent(context.content["co-op.targets"]);
  if (context.shared === undefined) throw new Error("co-op-shared-context-missing");
  const board = document.createElement("section");
  board.dataset.component = "co-op.clue-board";
  for (const target of content.targets) {
    const item = document.createElement("article");
    item.dataset.targetId = target.targetId;
    item.textContent = `${target.zone}: ${target.prompt}`;
    board.append(item);
  }
  const refresh = async () => {
    const view = await context.shared?.getView();
    const projection = view?.projections.find(
      ({ schemaId }) => schemaId === "plotpoint.location.team-projection",
    );
    board.dataset.confirmed = projection === undefined ? "false" : "true";
  };
  context.lifecycle.defer(context.shared.onSyncChanged(() => void refresh()));
  void refresh();
  return board;
}
