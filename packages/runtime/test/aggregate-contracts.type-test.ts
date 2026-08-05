import {
  defineCommand,
  defineProgression,
  executeCommand,
  type Aggregate,
  type Command,
  type ExecutionResult,
  type JsonObject,
} from "@plotpoint/runtime";

type State = JsonObject & { readonly value: number };

const aggregate: Aggregate<State> = {
  kind: "player",
  id: "p1",
  schemaVersion: 1,
  stateVersion: 0,
  authority: "local",
  state: { value: 1 },
};

// @ts-expect-error aggregate kinds are closed
aggregate.kind = "player";
// @ts-expect-error fixture and aggregate state is readonly
aggregate.state.value = 2;

const command: Command = {
  id: "c1",
  type: "change",
  target: { kind: "player", id: "p1" },
  expectedStateVersion: 0,
  payload: {},
};

// @ts-expect-error command targets are readonly
command.target.id = "team-1";

const playerAggregate: Aggregate<State, "player"> = {
  kind: "player",
  id: "p1",
  schemaVersion: 1,
  stateVersion: 0,
  authority: "local",
  state: { value: 1 },
};
const teamCommand: Command<JsonObject, "team"> = {
  id: "c2",
  type: "change",
  target: { kind: "team", id: "team-1" },
  expectedStateVersion: 0,
  payload: {},
};
const playerDefinition = defineCommand<"player", State, JsonObject, JsonObject>({
  definitionId: "player.change",
  commandType: "change",
  aggregateKind: "player",
  handle: (target) => ({ kind: "rejected", outcome: { kind: target.kind } }),
});
const teamProgression = defineProgression<"team", State, JsonObject, JsonObject>({
  aggregateKind: "team",
  graphId: "team",
  graphVersion: 1,
  nodes: [],
  automaticRules: [],
});

executeCommand({
  // @ts-expect-error aggregate, command, and definition kinds must agree
  definition: playerDefinition,
  aggregate: playerAggregate,
  command: teamCommand,
  observations: [],
});

executeCommand<State, JsonObject, JsonObject, "player">({
  definition: playerDefinition,
  aggregate: playerAggregate,
  command: {
    id: "c3",
    type: "change",
    target: { kind: "player", id: "p1" },
    expectedStateVersion: 0,
    payload: {},
  },
  observations: [],
  // @ts-expect-error progression and command definitions must target the same kind
  progression: teamProgression,
});

declare const teamResult: ExecutionResult<State, JsonObject, JsonObject, "team">;
// @ts-expect-error recorded aggregate/result kinds are not interchangeable
const playerResult: ExecutionResult<State, JsonObject, JsonObject, "player"> = teamResult;
void playerResult;
