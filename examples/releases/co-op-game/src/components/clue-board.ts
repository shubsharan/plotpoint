interface TargetContent {
  readonly targets: readonly {
    readonly targetId: string;
    readonly prompt: string;
    readonly zone: string;
  }[];
}

interface SharedProjection {
  readonly schemaId: string;
  readonly value: unknown;
}

interface SharedCommandInvoker {
  execute(input: {
    readonly commandId: string;
    readonly payload: { readonly targetId: string };
    readonly observationIds: readonly string[];
  }): Promise<unknown>;
}

interface CapabilityClient {
  request(input: object): Promise<object>;
}

interface ComponentContext {
  readonly lifecycle: { defer(cleanup: () => void | Promise<void>): void };
  readonly content: Readonly<Record<string, unknown>>;
  readonly assets: Readonly<Record<string, unknown>>;
  readonly capabilities: Readonly<Record<string, CapabilityClient>>;
  readonly shared?: {
    getView(): Promise<{ readonly projections: readonly SharedProjection[] }>;
    onSyncChanged(listener: () => void): () => void;
    readonly commands: Readonly<Record<string, SharedCommandInvoker>>;
  };
}

interface TeamProjection {
  readonly complete: boolean;
  readonly completedTargets: number;
  readonly targets: readonly {
    readonly targetId: string;
    readonly status: "available" | "discovered";
  }[];
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

function teamProjection(value: unknown): TeamProjection {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("complete" in value) ||
    typeof value.complete !== "boolean" ||
    !("completedTargets" in value) ||
    !Number.isSafeInteger(value.completedTargets) ||
    !("targets" in value) ||
    !Array.isArray(value.targets) ||
    !value.targets.every(
      (target) =>
        target !== null &&
        typeof target === "object" &&
        !Array.isArray(target) &&
        "targetId" in target &&
        typeof target.targetId === "string" &&
        "status" in target &&
        (target.status === "available" || target.status === "discovered"),
    )
  ) {
    throw new Error("co-op-team-projection-invalid");
  }
  return value as TeamProjection;
}

function observationId(value: object): string {
  if (!("observationId" in value) || typeof value.observationId !== "string") {
    throw new Error("co-op-location-observation-invalid");
  }
  return value.observationId;
}

export function ClueBoard(context: ComponentContext): HTMLElement {
  const content = targetContent(context.content["co-op.targets"]);
  if (context.shared === undefined) throw new Error("co-op-shared-context-missing");
  const discoverTarget = context.shared.commands["plotpoint.location.target-discovery"];
  const foregroundLocation = context.capabilities["plotpoint.location.foreground"];
  if (discoverTarget === undefined || foregroundLocation === undefined) {
    throw new Error("co-op-target-discovery-dependency-missing");
  }
  const board = document.createElement("section");
  board.dataset.component = "co-op.clue-board";
  const items = new Map<string, HTMLElement>();
  for (const target of content.targets) {
    const item = document.createElement("article");
    item.dataset.targetId = target.targetId;
    item.textContent = `${target.zone}: ${target.prompt}`;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Discover target";
    const discover = async () => {
      const observation = await foregroundLocation.request({});
      await discoverTarget.execute({
        commandId: crypto.randomUUID(),
        payload: { targetId: target.targetId },
        observationIds: [observationId(observation)],
      });
    };
    button.addEventListener("click", discover);
    context.lifecycle.defer(() => button.removeEventListener("click", discover));
    item.append(button);
    items.set(target.targetId, item);
    board.append(item);
  }
  const refresh = async () => {
    const view = await context.shared?.getView();
    const selected = view?.projections.find(
      ({ schemaId }) => schemaId === "plotpoint.location.team-projection",
    );
    if (selected === undefined) {
      board.dataset.confirmed = "false";
      board.dataset.confirmedTargets = "0";
      board.dataset.complete = "false";
      return;
    }
    const projection = teamProjection(selected.value);
    board.dataset.confirmed = "true";
    board.dataset.confirmedTargets = String(projection.completedTargets);
    board.dataset.complete = String(projection.complete);
    for (const target of projection.targets) {
      const item = items.get(target.targetId);
      if (item !== undefined) item.dataset.status = target.status;
    }
  };
  context.lifecycle.defer(context.shared.onSyncChanged(() => void refresh()));
  void refresh();
  return board;
}
