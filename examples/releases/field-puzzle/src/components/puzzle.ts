import type { FieldGameContent } from "../initial-state.js";

interface LocalView {
  readonly stateVersion: number;
  readonly state: {
    readonly puzzleSolved: boolean;
  };
  readonly progression?: {
    readonly nodes: readonly {
      readonly nodeId: string;
      readonly status: string;
    }[];
  };
}

interface CommandResult {
  readonly terminal?: string;
  readonly diagnosticCodes?: readonly string[];
  readonly outcome?: {
    readonly result?: string;
  };
}

interface FieldCommand {
  execute(input: {
    readonly commandId: string;
    readonly payload: Record<string, unknown>;
    readonly observations?: readonly {
      readonly observationId: string;
      readonly kind: string;
      readonly key: string;
      readonly value: Record<string, unknown>;
    }[];
  }): Promise<unknown>;
}

interface LocationObservation extends Record<string, unknown> {
  readonly observationId: string;
}

export interface FieldPuzzleContext {
  readonly lifecycle: { defer(cleanup: () => void | Promise<void>): void };
  readonly content: Readonly<{
    "field.game": FieldGameContent;
  }>;
  readonly local: {
    getView(): Promise<unknown>;
    onChanged(listener: () => void): () => void;
    readonly commands: Readonly<Record<string, FieldCommand>>;
  };
  readonly capabilities: Readonly<
    Record<string, { request(input: Record<string, unknown>): Promise<unknown> }>
  >;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function localView(value: unknown): LocalView {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.stateVersion) ||
    !isRecord(value.state) ||
    typeof value.state.puzzleSolved !== "boolean" ||
    (value.progression !== undefined &&
      (!isRecord(value.progression) || !Array.isArray(value.progression.nodes)))
  ) {
    throw new Error("field-local-view-invalid");
  }
  return value as unknown as LocalView;
}

function locationObservation(value: unknown): LocationObservation {
  if (!isRecord(value) || typeof value.observationId !== "string") {
    throw new Error("field-location-observation-invalid");
  }
  return value as LocationObservation;
}

function resultLabel(value: unknown): string {
  if (!isRecord(value)) return "completed";
  const result = value as CommandResult;
  const outcome = result.outcome?.result;
  return (
    [result.terminal, outcome, ...(result.diagnosticCodes ?? [])]
      .filter((part) => part !== undefined)
      .join(":") || "completed"
  );
}

export function FieldPuzzle(context: FieldPuzzleContext): HTMLElement {
  const game = context.content["field.game"];
  const advance = context.local.commands["field.advance"];
  const foregroundLocation = context.capabilities["plotpoint.location.foreground"];
  if (advance === undefined) throw new Error("field-advance-command-missing");
  if (foregroundLocation === undefined) throw new Error("field-location-capability-missing");

  const card = document.createElement("section");
  card.dataset.component = "field.puzzle";
  const title = document.createElement("h1");
  title.textContent = game.title;
  const prompt = document.createElement("p");
  prompt.textContent = game.puzzle.prompt;
  const answer = document.createElement("input");
  answer.dataset.action = "answer";
  answer.setAttribute("aria-label", "Puzzle answer");
  const solve = document.createElement("button");
  solve.dataset.action = "solve";
  solve.textContent = "Solve puzzle";
  const checkIn = document.createElement("button");
  checkIn.dataset.action = "check-in";
  const status = document.createElement("output");
  status.dataset.action = "status";
  card.append(title, prompt, answer, solve, checkIn, status);

  let busy = false;
  let currentView: LocalView | undefined;

  const playable = (nodeId: string): boolean => {
    const nodeStatus = currentView?.progression?.nodes.find(
      (node) => node.nodeId === nodeId,
    )?.status;
    return nodeStatus === "active" || nodeStatus === "available";
  };
  const render = () => {
    const puzzlePlayable = playable("puzzle") && currentView?.state.puzzleSolved === false;
    const firstPlayable = playable("first-checkpoint");
    const secondPlayable = playable("second-checkpoint");
    answer.disabled = busy || !puzzlePlayable;
    solve.disabled = busy || !puzzlePlayable;
    checkIn.disabled = busy || (!firstPlayable && !secondPlayable);
    checkIn.textContent = firstPlayable
      ? `Check in at ${game.firstCheckpoint.name}`
      : secondPlayable
        ? `Check in at ${game.secondCheckpoint.name}`
        : "Journey complete";
    card.dataset.complete = String(playable("complete"));
    if (currentView !== undefined) card.dataset.stateVersion = String(currentView.stateVersion);
  };
  const refresh = async () => {
    currentView = localView(await context.local.getView());
    render();
  };
  const fail = (error: unknown) => {
    card.dataset.error = "true";
    status.textContent = error instanceof Error ? error.message : "field-action-failed";
  };
  const run = async (operation: () => Promise<unknown>) => {
    if (busy) return;
    busy = true;
    card.dataset.error = "false";
    render();
    try {
      const result = await operation();
      status.textContent = resultLabel(result);
      await refresh();
    } catch (error) {
      fail(error);
    } finally {
      busy = false;
      render();
    }
  };

  const onCheckIn = () =>
    run(async () => {
      const observation = locationObservation(await foregroundLocation.request({}));
      return advance.execute({
        commandId: globalThis.crypto.randomUUID(),
        payload: { action: "check-in" },
        observations: [
          {
            observationId: observation.observationId,
            kind: "location.foreground",
            key: "current",
            value: observation,
          },
        ],
      });
    });
  const onSolve = () =>
    run(() =>
      advance.execute({
        commandId: globalThis.crypto.randomUUID(),
        payload: { action: "solve", answer: answer.value },
      }),
    );
  checkIn.addEventListener("click", onCheckIn);
  solve.addEventListener("click", onSolve);
  context.lifecycle.defer(() => checkIn.removeEventListener("click", onCheckIn));
  context.lifecycle.defer(() => solve.removeEventListener("click", onSolve));
  context.lifecycle.defer(
    context.local.onChanged(() => {
      void refresh().catch(fail);
    }),
  );
  void refresh().catch(fail);
  return card;
}
