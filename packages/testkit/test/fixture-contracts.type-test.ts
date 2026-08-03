import { type Aggregate, type JsonObject } from "@plotpoint/runtime";
import { playerFixture, teamFixture } from "@plotpoint/testkit";

type State = JsonObject & { readonly value: number };

const player = playerFixture<State>({ state: { value: 1 } });
const team = teamFixture<State>({ state: { value: 1 } });

const exactPlayer: Aggregate<State, "player"> = player;
// @ts-expect-error fixture builders retain their exact aggregate kind
const wrongPlayer: Aggregate<State, "player"> = team;

void exactPlayer;
void wrongPlayer;
