import { describe, expect, it } from "vitest";

import {
  canonicalizeValue,
  defineCommand,
  executeCommand,
  type Aggregate,
  type Command,
  type JsonObject,
} from "@plotpoint/runtime";

type State = JsonObject & { readonly count: number };
type Payload = JsonObject & { readonly amount: number };
type Outcome = JsonObject & { readonly result: string };

const aggregate: Aggregate<State> = {
  kind: "player",
  id: "player-1",
  schemaVersion: 1,
  stateVersion: 4,
  authority: "local",
  state: { count: 1 },
};

const command: Command<Payload> = {
  id: "command-1",
  type: "increment",
  target: { kind: "player", id: "player-1" },
  expectedStateVersion: 4,
  payload: { amount: 2 },
};

describe("executeCommand", () => {
  it("returns an accepted deterministic state change", () => {
    const definition = defineCommand<State, Payload, Outcome>({
      definitionId: "increment.v1",
      commandType: "increment",
      aggregateKind: "player",
      handle(target, input) {
        return {
          kind: "accepted",
          nextState: { count: target.state.count + input.payload.amount },
          outcome: { result: "incremented" },
          domainEvents: [{ type: "count-incremented" }],
          effectIntents: [{ type: "notify" }],
          progressionIntents: [],
        };
      },
    });

    const result = executeCommand({
      definition,
      aggregate,
      command,
      observations: [],
    });

    expect(result.kind).toBe("accepted");
    expect(result.aggregate.stateVersion).toBe(5);
    expect(result.aggregate.state).toEqual({ count: 3 });
    expect(aggregate.stateVersion).toBe(4);
  });

  it("returns semantic rejection without changing state", () => {
    const definition = defineCommand<State, Payload, Outcome>({
      definitionId: "reject.v1",
      commandType: "increment",
      aggregateKind: "player",
      handle() {
        return { kind: "rejected", outcome: { result: "not-allowed" } };
      },
    });

    const result = executeCommand({
      definition,
      aggregate,
      command,
      observations: [],
    });

    expect(result.kind).toBe("rejected");
    expect(result.aggregate).toEqual(aggregate);
  });

  it("returns a true no-op without advancing the version", () => {
    const definition = defineCommand<State, Payload, Outcome>({
      definitionId: "noop.v1",
      commandType: "increment",
      aggregateKind: "player",
      handle(target) {
        return {
          kind: "accepted",
          nextState: target.state,
          outcome: { result: "unchanged" },
          domainEvents: [],
          effectIntents: [],
          progressionIntents: [],
        };
      },
    });

    const result = executeCommand({
      definition,
      aggregate,
      command,
      observations: [],
    });

    expect(result.kind).toBe("no-op");
    expect(result.aggregate.stateVersion).toBe(4);
  });

  it.each([
    {
      name: "handler throw",
      handle: () => {
        throw new Error("host prose must not enter the record");
      },
      code: "handler-threw",
    },
    {
      name: "promise-shaped result",
      handle: () => Promise.resolve({ kind: "rejected", outcome: { result: "late" } }),
      code: "handler-result-invalid",
    },
  ])("returns invalid for $name", ({ handle, code }) => {
    const definition = defineCommand<State, Payload, Outcome>({
      definitionId: "invalid.v1",
      commandType: "increment",
      aggregateKind: "player",
      handle: handle as never,
    });

    const result = executeCommand({
      definition,
      aggregate,
      command,
      observations: [],
    });

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") expect(result.diagnostics[0]?.code).toBe(code);
    expect(JSON.stringify(result)).not.toContain("host prose");
  });

  it("produces identical complete records across 100 executions", () => {
    const definition = defineCommand<State, Payload, Outcome>({
      definitionId: "repeat.v1",
      commandType: "increment",
      aggregateKind: "player",
      handle(target, input) {
        return {
          kind: "accepted",
          nextState: { count: target.state.count + input.payload.amount },
          outcome: { result: "ok" },
          domainEvents: [],
          effectIntents: [],
          progressionIntents: [],
        };
      },
    });

    const texts = Array.from({ length: 100 }, () => {
      const result = executeCommand({
        definition,
        aggregate,
        command,
        observations: [],
      });
      const canonical = canonicalizeValue(result.record);
      if (canonical.kind === "invalid") throw new Error(canonical.diagnostic.code);
      return canonical.canonical.text;
    });

    expect(new Set(texts).size).toBe(1);
  });

  it("diagnoses malformed JavaScript command and handler output shapes", () => {
    const definition = defineCommand<State, Payload, Outcome>({
      definitionId: "shape.v1",
      commandType: "increment",
      aggregateKind: "player",
      handle: (() => ({
        kind: "accepted",
        nextState: { count: 2 },
        outcome: { result: "invalid" },
        domainEvents: [1],
        effectIntents: [],
        progressionIntents: [],
      })) as never,
    });

    const malformedCommand = executeCommand({
      definition,
      aggregate,
      command: {} as never,
      observations: [],
    });
    const malformedOutput = executeCommand({ definition, aggregate, command, observations: [] });

    expect(malformedCommand.kind).toBe("invalid");
    if (malformedCommand.kind === "invalid") {
      expect(malformedCommand.diagnostics[0]?.code).toBe("command-invalid");
    }
    expect(malformedOutput.kind).toBe("invalid");
    if (malformedOutput.kind === "invalid") {
      expect(malformedOutput.diagnostics[0]?.code).toBe("handler-result-invalid");
    }
  });
});
