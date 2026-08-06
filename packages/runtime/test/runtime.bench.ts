import { bench, describe } from "vitest";

import {
  defineCommand,
  defineProgression,
  executeCommand,
  type Aggregate,
  type Command,
  type JsonObject,
} from "@plotpoint/runtime";

type State = JsonObject & { readonly count: number };

const aggregate: Aggregate<State, "player"> = {
  aggregateId: "player-1",
  modelId: "benchmark.player",
  aggregateKind: "player",
  schemaId: "benchmark.state",
  stateVersion: 0,
  state: { count: 0 },
  progression: {
    graphId: "benchmark",
    nodes: Array.from({ length: 20 }, (_value, index) => ({
      nodeId: `node-${index}`,
      status: "locked",
    })),
  },
};
const command: Command<JsonObject, "player"> = {
  id: "command-1",
  type: "increment",
  target: { kind: "player", id: "player-1" },
  expectedStateVersion: 0,
  payload: {},
};
const definition = defineCommand<"player", State, JsonObject, JsonObject>({
  definitionId: "benchmark.increment",
  commandType: "increment",
  aggregateKind: "player",
  handle(target) {
    return {
      kind: "accepted",
      nextState: { count: target.state.count + 1 },
      outcome: { result: "incremented" },
      domainEvents: [],
      effectIntents: [],
      progressionIntents: [],
    };
  },
});
const progression = defineProgression<"player", State>({
  aggregateKind: "player",
  graphId: "benchmark",
  nodes: Array.from({ length: 20 }, (_value, index) => ({
    nodeId: `node-${index}`,
    initialStatus: "locked",
  })),
  transitions: Array.from({ length: 20 }, (_value, index) => ({
    transitionId: `unlock-${index}`,
    targetNodeId: `node-${index}`,
    from: ["locked" as const],
    to: "available" as const,
    priority: 0,
    trigger: "automatic" as const,
    when: () => true,
  })),
});

describe("representative Gate 1 baselines", () => {
  bench("command with a twenty-node parallel progression batch", () => {
    executeCommand({
      definition,
      aggregate,
      command,
      observations: [],
      progression,
      policy: { maxAutomaticTransitions: 20 },
    });
  });
});
