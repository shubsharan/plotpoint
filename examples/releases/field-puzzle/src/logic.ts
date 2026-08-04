import { executeCommand, type JsonObject, type Observation } from "@plotpoint/runtime";

import { advanceCommand, type AdvancePayload, type FieldState } from "./commands/advance.js";
import { fieldProgression } from "./progression/route.js";

const initialState: FieldState = Object.freeze({ attempts: 0, phase: "first-checkpoint" });

function run(input: {
  readonly commandId: string;
  readonly state: FieldState;
  readonly stateVersion: number;
  readonly payload: AdvancePayload;
  readonly observation?: JsonObject & { readonly observationId: string };
}) {
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
  const accepted = result.kind === "accepted";
  const outcome = "outcome" in result ? result.outcome : { result: "wrong-phase" };
  const nextState = accepted ? result.aggregate.state : input.state;
  return {
    kind: "candidate",
    candidate: {
      commandId: input.commandId,
      aggregateId: "field-player",
      aggregateKind: "player",
      schemaId: "field.player-state.v1",
      schemaVersion: 1,
      expectedVersion: input.stateVersion,
      commandOutcome: accepted ? "accepted" : "rejected",
      outcome,
      nextState,
      progressionChanges: accepted ? [nextState.phase] : [],
      observationIds: input.observation === undefined ? [] : [input.observation.observationId],
    },
  };
}

export const logic = Object.freeze({
  commands: Object.freeze([advanceCommand]),
  progressions: Object.freeze([fieldProgression]),
  initialState,
  run,
});
