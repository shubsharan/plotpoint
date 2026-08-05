import type { AggregateTarget, TransitionCandidate } from "@plotpoint/protocol/player";
import { executeCommand, type JsonObject, type Observation } from "@plotpoint/runtime";

import { advanceCommand, type AdvancePayload, type FieldState } from "./commands/advance.js";
import { fieldProgression } from "./progression/route.js";

const initialState: FieldState = Object.freeze({ attempts: 0, phase: "first-checkpoint" });
const target = Object.freeze({
  aggregateId: "field-player",
  aggregateKind: "player",
  schemaId: "field.player-state",
  schemaVersion: 1,
}) satisfies AggregateTarget;

export type FieldLogicRunResult =
  | { readonly kind: "candidate"; readonly candidate: TransitionCandidate }
  | { readonly kind: "preflight-invalid"; readonly diagnosticCodes: readonly string[] };

export interface FieldLogic {
  readonly initialState: FieldState;
  run(input: {
    readonly commandId: string;
    readonly state: FieldState;
    readonly stateVersion: number;
    readonly payload: AdvancePayload;
    readonly observation?: JsonObject & { readonly observationId: string };
  }): FieldLogicRunResult;
}

function run(input: {
  readonly commandId: string;
  readonly state: FieldState;
  readonly stateVersion: number;
  readonly payload: AdvancePayload;
  readonly observation?: JsonObject & { readonly observationId: string };
}): FieldLogicRunResult {
  const observations: Observation[] =
    input.observation === undefined
      ? []
      : [{ kind: "location.foreground", key: "current", value: input.observation }];
  const result = executeCommand({
    definition: advanceCommand,
    aggregate: {
      kind: "player",
      id: "field-player",
      schemaVersion: 1,
      stateVersion: input.stateVersion,
      authority: "local",
      state: input.state,
    },
    command: {
      id: input.commandId,
      type: "advance",
      target: { kind: "player", id: "field-player" },
      expectedStateVersion: input.stateVersion,
      payload: input.payload,
    },
    observations,
  });
  if (result.kind === "invalid" && result.phase === "preflight") {
    return {
      kind: "preflight-invalid",
      diagnosticCodes: result.diagnostics.map(({ code }) => code),
    };
  }

  const base = {
    commandId: input.commandId,
    target,
    expectedVersion: input.stateVersion,
    observationIds: input.observation === undefined ? [] : [input.observation.observationId],
  };
  switch (result.kind) {
    case "accepted":
      return {
        kind: "candidate",
        candidate: {
          ...base,
          terminal: "accepted",
          nextState: result.aggregate.state,
          outcome: result.outcome,
          progressionChanges: [result.aggregate.state.phase],
        },
      };
    case "no-op":
    case "rejected":
      return {
        kind: "candidate",
        candidate: { ...base, terminal: result.kind, outcome: result.outcome },
      };
    case "invalid":
      return {
        kind: "candidate",
        candidate: {
          ...base,
          terminal: "invalid",
          diagnosticCodes: result.diagnostics.map(({ code }) => code),
        },
      };
  }
}

export const logic = Object.freeze({
  commands: Object.freeze([advanceCommand] as const),
  progressions: Object.freeze([fieldProgression] as const),
  initialState,
  run,
}) satisfies FieldLogic & {
  readonly commands: readonly [typeof advanceCommand];
  readonly progressions: readonly [typeof fieldProgression];
};
