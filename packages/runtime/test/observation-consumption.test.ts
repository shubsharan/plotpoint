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

type State = JsonObject & { readonly seen: string };
type Payload = JsonObject;
type Outcome = JsonObject & { readonly result: string };

const aggregate: Aggregate<State, "player"> = {
  aggregateId: "p1",
  modelId: "player.model",
  aggregateKind: "player",
  schemaId: "player.state",
  stateVersion: 0,
  state: { seen: "" },
};
const command: Command<Payload, "player"> = {
  id: "c1",
  type: "observe",
  target: { kind: "player", id: "p1" },
  expectedStateVersion: 0,
  payload: {},
};
const definition = defineCommand<"player", State, Payload, Outcome>({
  definitionId: "observe",
  commandType: "observe",
  aggregateKind: "player",
  handle(_target, _input, context) {
    const seen = context.take<string>("clock", "now");
    return {
      kind: "accepted",
      nextState: { seen },
      outcome: { result: "observed" },
      domainEvents: [],
      effectIntents: [],
      progressionIntents: [],
    };
  },
});

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

describe("ordered observation consumption", () => {
  it("consumes the exact next identity and records its canonical value", () => {
    const result = executeCommand({
      definition,
      aggregate,
      command,
      observations: [{ kind: "clock", key: "now", value: "2030-01-01T00:00:00.000Z" }],
    });

    expect(result).toMatchObject({ kind: "recorded", record: { terminal: "accepted" } });
    if (result.kind !== "recorded") throw new Error("expected recorded acceptance");
    expect(result.record.observationTrace).toEqual([
      {
        index: 0,
        kind: "clock",
        key: "now",
        value: "2030-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("diagnoses exhaustion without ambient fallback", () => {
    const result = executeCommand({
      definition,
      aggregate,
      command,
      observations: [],
    });

    expect(result).toMatchObject({ kind: "recorded", record: { terminal: "invalid" } });
    if (result.kind === "recorded")
      expect(result.record.diagnostics[0]?.code).toBe("observation-exhausted");
  });

  it("diagnoses an out-of-order identity", () => {
    const result = executeCommand({
      definition,
      aggregate,
      command,
      observations: [{ kind: "identifier", key: "next", value: "id-1" }],
    });

    expect(result).toMatchObject({ kind: "recorded", record: { terminal: "invalid" } });
    if (result.kind === "recorded")
      expect(result.record.diagnostics[0]?.code).toBe("observation-order-mismatch");
  });

  it("performs no handler call, observation consumption, or record creation across 100 preflight failures", () => {
    const handle = vi.fn(definition.handle);
    const guardedDefinition = defineCommand<"player", State, Payload, Outcome>({
      ...definition,
      definitionId: "observe-preflight",
      handle,
    });
    const malformedObservation = { kind: "clock", key: "now" } as never;

    const results = Array.from({ length: 100 }, () =>
      executeCommand({
        definition: guardedDefinition,
        aggregate,
        command,
        observations: [malformedObservation],
      }),
    );

    expect(results).toHaveLength(100);
    expect(results.every((result) => result.kind === "preflight-invalid")).toBe(true);
    expect(results.every((result) => !("record" in result) && !("aggregate" in result))).toBe(true);
    expect(handle).not.toHaveBeenCalled();
    expect(aggregate).toEqual({
      aggregateId: "p1",
      modelId: "player.model",
      aggregateKind: "player",
      schemaId: "player.state",
      stateVersion: 0,
      state: { seen: "" },
    });
  });
});
