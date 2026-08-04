import {
  FOREGROUND_LOCATION_CAPABILITY,
  createHostRuntimeClientV1,
  isLocationObservationV1,
  type HostBridgeTransportV1,
  type RuntimeBootstrapV1,
  type TransitionResultV1,
} from "@plotpoint/protocol/player";

import type { AdvancePayload, FieldState } from "./commands/advance.js";
import { fieldGame } from "./config.js";
import type { FieldLogic } from "./logic.js";

interface MountInput {
  readonly root: HTMLElement;
  readonly logic: FieldLogic;
  readonly host: HostBridgeTransportV1;
  readonly bootstrap: RuntimeBootstrapV1;
}

export interface FieldPuzzleSessionSnapshot {
  readonly state: FieldState;
  readonly stateVersion: number;
  readonly message: string;
  readonly lastDisposition?: TransitionResultV1["disposition"];
}

export interface FieldPuzzleSession {
  snapshot(): FieldPuzzleSessionSnapshot;
  checkIn(): Promise<void>;
  solve(answer: string): Promise<void>;
}

interface CreateFieldPuzzleSessionInput {
  readonly logic: FieldLogic;
  readonly host: HostBridgeTransportV1;
  readonly bootstrap: RuntimeBootstrapV1;
  readonly createCommandId?: () => string;
  readonly onChange?: (snapshot: FieldPuzzleSessionSnapshot) => void;
}

export function FieldPuzzle(): HTMLElement {
  const element = document.createElement("section");
  element.dataset.component = "field.puzzle.v1";
  return element;
}

function commandId(): string {
  return `field-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isFieldState(value: unknown): value is FieldState {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(candidate.attempts) &&
    (candidate.attempts as number) >= 0 &&
    (candidate.phase === "first-checkpoint" ||
      candidate.phase === "puzzle" ||
      candidate.phase === "second-checkpoint" ||
      candidate.phase === "complete")
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error !== null && typeof error === "object" && "code" in error) {
    const code = (error as { readonly code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "host-operation-failed";
}

function outcomeMessage(outcome: Record<string, unknown>): string {
  return typeof outcome.result === "string" ? outcome.result : "transition-recorded";
}

export function createFieldPuzzleSession(input: CreateFieldPuzzleSessionInput): FieldPuzzleSession {
  const restoredState = input.bootstrap.aggregate?.state;
  if (restoredState !== undefined && !isFieldState(restoredState)) {
    throw new Error("field-bootstrap-state-invalid");
  }
  const client = createHostRuntimeClientV1(input.host);
  let state = restoredState ?? input.logic.initialState;
  let stateVersion = input.bootstrap.aggregate?.stateVersion ?? 0;
  let message = "Find the first marker to begin.";
  let lastDisposition: TransitionResultV1["disposition"] | undefined;

  const snapshot = (): FieldPuzzleSessionSnapshot => ({
    state,
    stateVersion,
    message,
    ...(lastDisposition === undefined ? {} : { lastDisposition }),
  });
  const notify = () => input.onChange?.(snapshot());

  const commit = async (
    payload: AdvancePayload,
    observation?: Parameters<FieldLogic["run"]>[0]["observation"],
  ) => {
    try {
      const result = input.logic.run({
        commandId: (input.createCommandId ?? commandId)(),
        state,
        stateVersion,
        payload,
        observation,
      });
      if (result.kind === "preflight-invalid") {
        message = result.diagnosticCodes.join(", ") || "runtime-preflight-invalid";
        notify();
        return;
      }
      const durable = await client.commitTransition(result.candidate);
      lastDisposition = durable.disposition;
      if (durable.terminal === "accepted") {
        if (result.candidate.terminal !== "accepted" || !isFieldState(result.candidate.nextState)) {
          throw new Error("field-transition-state-invalid");
        }
        state = result.candidate.nextState;
        stateVersion = durable.resultingVersion;
        message = outcomeMessage(durable.outcome);
      } else if (durable.terminal === "invalid") {
        message = durable.diagnosticCodes.join(", ") || "runtime-execution-invalid";
      } else {
        message = outcomeMessage(durable.outcome);
      }
    } catch (error) {
      message = errorMessage(error);
    }
    notify();
  };

  const checkIn = async () => {
    message = "Reading foreground location…";
    notify();
    try {
      const observation = await client.requestCapability(
        FOREGROUND_LOCATION_CAPABILITY,
        {},
        isLocationObservationV1,
      );
      await commit({ action: "check-in" }, observation);
    } catch (error) {
      message = errorMessage(error);
      notify();
    }
  };

  return Object.freeze({
    snapshot,
    checkIn,
    solve: (answer: string) => commit({ action: "solve", answer }),
  });
}

async function mount({ root, logic, host, bootstrap }: MountInput): Promise<void> {
  let render = () => undefined;
  const session = createFieldPuzzleSession({
    logic,
    host,
    bootstrap,
    onChange: () => render(),
  });

  render = () => {
    const { state, stateVersion, message } = session.snapshot();
    root.replaceChildren();
    const card = FieldPuzzle();
    card.innerHTML = `<style>
      .field{min-height:100vh;padding:32px 24px;background:radial-gradient(circle at 20% 10%,#f6c85f55,transparent 35%),linear-gradient(145deg,#f4f0e6,#c8dfd8)}
      .eyebrow{letter-spacing:.16em;text-transform:uppercase;font-size:12px;color:#35635d}.card{max-width:560px;margin:auto;background:#fffdf7dd;border:1px solid #173f3922;border-radius:28px;padding:28px;box-shadow:0 24px 70px #173f3922}
      h1{font-size:42px;line-height:1;margin:10px 0 28px}.phase{font-size:20px}.status{min-height:28px;color:#8a4b20}button{border:0;border-radius:999px;background:#173f39;color:white;padding:14px 20px;margin-top:12px}input{box-sizing:border-box;width:100%;border:1px solid #73958f;border-radius:12px;padding:12px}
    </style><div class="field"><div class="card"><div class="eyebrow">Offline field puzzle · v${stateVersion}</div><h1>${fieldGame.title}</h1><p class="phase">${state.phase.replaceAll("-", " ")}</p><div id="action"></div><p class="status">${message}</p></div></div>`;
    const action = card.querySelector("#action")!;
    if (state.phase === "puzzle") {
      action.innerHTML = `<p>${fieldGame.puzzle.prompt}</p><input id="answer" autocomplete="off"><button id="solve">Submit answer</button>`;
      action.querySelector("#solve")!.addEventListener("click", () => {
        const answer = (action.querySelector("#answer") as HTMLInputElement).value;
        void session.solve(answer);
      });
    } else if (state.phase === "complete") action.innerHTML = "<strong>Route complete.</strong>";
    else {
      action.innerHTML = `<p>Walk to ${state.phase === "first-checkpoint" ? fieldGame.firstCheckpoint.name : fieldGame.secondCheckpoint.name}.</p><button id="check">Check my location</button>`;
      action.querySelector("#check")!.addEventListener("click", () => void session.checkIn());
    }
    root.append(card);
  };
  render();
}

export const presentation = Object.freeze({
  components: Object.freeze({ "field.puzzle.v1": FieldPuzzle }),
  mount,
});
