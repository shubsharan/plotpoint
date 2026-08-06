import { describe, expect, it, vi } from "vitest";

import {
  defineCommand,
  type Aggregate,
  type AggregateKind,
  type Command,
  type CommandDefinition,
  type ExecutionResult,
  type JsonObject,
  type Observation,
} from "@plotpoint/runtime";
import { executeCommandWithEvaluator } from "../src/execute-command.js";

type State = JsonObject & { readonly done: boolean };
type Outcome = JsonObject & { readonly result: string };

const aggregate: Aggregate<State, "session"> = {
  aggregateId: "s1",
  modelId: "session.model",
  aggregateKind: "session",
  schemaId: "session.state",
  stateVersion: 0,
  state: { done: false },
};
const command: Command<JsonObject, "session"> = {
  id: "c1",
  type: "finish",
  target: { kind: "session", id: "s1" },
  expectedStateVersion: 0,
  payload: {},
};

function executeCommand<
  Kind extends AggregateKind,
  StateValue extends JsonObject,
  PayloadValue extends JsonObject,
  OutcomeValue extends JsonObject,
>(input: {
  readonly definition: CommandDefinition<StateValue, PayloadValue, OutcomeValue, Kind>;
  readonly aggregate: Aggregate<StateValue, Kind>;
  readonly command: Command<PayloadValue, Kind>;
  readonly observations: readonly Observation[];
}): ExecutionResult<StateValue, OutcomeValue, PayloadValue, Kind> {
  return executeCommandWithEvaluator({
    definitionId: input.definition.definitionId,
    commandType: input.definition.commandType,
    aggregateKind: input.definition.aggregateKind,
    aggregate: input.aggregate,
    command: input.command,
    observations: input.observations,
    evaluate(target, runtimeCommand, context) {
      return {
        kind: "decision",
        decision: input.definition.handle(target, runtimeCommand, context),
      };
    },
  });
}

describe("event and effect boundary", () => {
  it("preserves order and never invokes effect-shaped data", () => {
    const invoked = vi.fn();
    const definition = defineCommand<"session", State, JsonObject, Outcome>({
      definitionId: "finish",
      commandType: "finish",
      aggregateKind: "session",
      handle() {
        return {
          kind: "accepted",
          nextState: { done: true },
          outcome: { result: "finished" },
          domainEvents: [{ order: 1 }, { order: 2 }],
          effectIntents: [{ type: "callback", marker: "effect-handler" }],
          progressionIntents: [],
        };
      },
    });

    const result = executeCommand({ definition, aggregate, command, observations: [] });

    expect(result).toMatchObject({ kind: "recorded", record: { terminal: "accepted" } });
    if (result.kind === "recorded") {
      expect(result.record.domainEvents).toEqual([{ order: 1 }, { order: 2 }]);
      expect(result.record.effectIntents).toEqual([{ marker: "effect-handler", type: "callback" }]);
    }
    expect(invoked).not.toHaveBeenCalled();
  });

  it("accepts an effect-only durable fact and advances the aggregate once", () => {
    const definition = defineCommand<"session", State, JsonObject, Outcome>({
      definitionId: "noop-output",
      commandType: "finish",
      aggregateKind: "session",
      handle(target) {
        return {
          kind: "accepted",
          nextState: target.state,
          outcome: { result: "unchanged" },
          domainEvents: [],
          effectIntents: [{ type: "forbidden" }],
          progressionIntents: [],
        };
      },
    });

    const result = executeCommand({ definition, aggregate, command, observations: [] });

    expect(result).toMatchObject({ kind: "recorded", record: { terminal: "accepted" } });
    if (result.kind === "recorded") {
      expect(result.record.effectIntents).toEqual([{ type: "forbidden" }]);
      expect(result.aggregate.stateVersion).toBe(1);
      expect(result.record).toMatchObject({
        priorStateVersion: 0,
        resultingStateVersion: 1,
      });
    }
  });

  it("accepts an event-only durable fact and advances the aggregate once", () => {
    const definition = defineCommand<"session", State, JsonObject, Outcome>({
      definitionId: "event-only",
      commandType: "finish",
      aggregateKind: "session",
      handle() {
        return {
          kind: "accepted",
          outcome: { result: "event-recorded" },
          domainEvents: [{ type: "session.noted", note: "durable" }],
          effectIntents: [],
          progressionIntents: [],
        };
      },
    });

    const result = executeCommand({ definition, aggregate, command, observations: [] });

    expect(result).toMatchObject({
      kind: "recorded",
      aggregate: { state: aggregate.state, stateVersion: 1 },
      record: {
        terminal: "accepted",
        domainEvents: [{ type: "session.noted", note: "durable" }],
        effectIntents: [],
        priorStateVersion: 0,
        resultingStateVersion: 1,
      },
    });
  });
});
