import { type Aggregate, type JsonObject } from "@plotpoint/runtime";
import { playerFixture, teamFixture } from "@plotpoint/testkit";
import { modelFixture, runtimeSchema } from "./runtime-model.js";

type State = JsonObject & { readonly value: number };

const stateSchema = runtimeSchema(
  "fixture.state",
  (value): value is State =>
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "value" in value &&
    typeof value.value === "number",
);
const playerModel = modelFixture({
  modelId: "fixture.player",
  aggregateKind: "player",
  authority: "local",
  stateSchema,
  initializeState: () => ({ value: 0 }),
});
const teamModel = modelFixture({
  modelId: "fixture.team",
  aggregateKind: "team",
  authority: "server",
  stateSchema,
  initializeState: () => ({ value: 0 }),
});

const player = playerFixture<State>({ model: playerModel, state: { value: 1 } });
const team = teamFixture<State>({ model: teamModel, state: { value: 1 } });

// @ts-expect-error player fixtures require an executable player model
playerFixture<State>({ model: teamModel, state: { value: 1 } });

const exactPlayer: Aggregate<State, "player"> = player;
// @ts-expect-error fixture builders retain their exact aggregate kind
const wrongPlayer: Aggregate<State, "player"> = team;

void exactPlayer;
void wrongPlayer;
