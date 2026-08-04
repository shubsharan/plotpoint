import { fieldGame } from "./config.js";

interface MountInput {
  readonly root: HTMLElement;
  readonly logic: {
    readonly initialState: { attempts: number; phase: string };
    run(input: unknown): {
      readonly kind: "candidate";
      readonly candidate: {
        readonly nextState: { readonly attempts: number; readonly phase: string };
        readonly outcome: { readonly result?: string };
      };
    };
  };
  readonly host: {
    send(
      type: string,
      payload: Record<string, unknown>,
    ): Promise<{
      readonly kind?: string;
      readonly code?: string;
      readonly resultingVersion?: number;
    }>;
  };
  readonly bootstrap: {
    aggregate: { state: { attempts: number; phase: string }; stateVersion: number } | null;
  };
}

export function FieldPuzzle(): HTMLElement {
  const element = document.createElement("section");
  element.dataset.component = "field.puzzle.v1";
  return element;
}

function commandId(): string {
  return `field-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function mount({ root, logic, host, bootstrap }: MountInput): Promise<void> {
  let state = bootstrap.aggregate?.state ?? logic.initialState;
  let stateVersion = bootstrap.aggregate?.stateVersion ?? 0;
  let message = "Find the first marker to begin.";

  const commit = async (
    payload: Record<string, unknown>,
    observation?: Record<string, unknown>,
  ) => {
    const result = logic.run({ commandId: commandId(), state, stateVersion, payload, observation });
    const durable = await host.send("transition.commit", { candidate: result.candidate });
    if (durable.kind === "accepted" || durable.kind === "duplicate") {
      state = result.candidate.nextState;
      stateVersion = durable.resultingVersion;
      message = String(result.candidate.outcome.result);
    } else message = String(durable.code ?? durable.kind);
    render();
  };

  const checkIn = async () => {
    message = "Reading foreground location…";
    render();
    const observation = await host.send("capability.request", {
      capabilityId: "plotpoint.location.foreground",
    });
    await commit({ action: "check-in" }, observation);
  };

  const render = () => {
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
        void commit({ action: "solve", answer });
      });
    } else if (state.phase === "complete") action.innerHTML = "<strong>Route complete.</strong>";
    else {
      action.innerHTML = `<p>Walk to ${state.phase === "first-checkpoint" ? fieldGame.firstCheckpoint.name : fieldGame.secondCheckpoint.name}.</p><button id="check">Check my location</button>`;
      action.querySelector("#check")!.addEventListener("click", () => void checkIn());
    }
    root.append(card);
  };
  render();
}

export const presentation = Object.freeze({
  components: Object.freeze({ "field.puzzle.v1": FieldPuzzle }),
  mount,
});
