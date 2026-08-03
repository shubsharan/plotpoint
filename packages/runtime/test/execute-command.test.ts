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

const aggregate: Aggregate<State, "player"> = {
  kind: "player",
  id: "player-1",
  schemaVersion: 1,
  stateVersion: 4,
  authority: "local",
  state: { count: 1 },
};

const command: Command<Payload, "player"> = {
  id: "command-1",
  type: "increment",
  target: { kind: "player", id: "player-1" },
  expectedStateVersion: 4,
  payload: { amount: 2 },
};

describe("executeCommand", () => {
  it("returns an accepted deterministic state change", () => {
    const definition = defineCommand<"player", State, Payload, Outcome>({
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
    if (result.kind !== "accepted") throw new Error("expected accepted");
    expect(result.aggregate.stateVersion).toBe(5);
    expect(result.aggregate.state).toEqual({ count: 3 });
    expect(aggregate.stateVersion).toBe(4);
  });

  it("returns semantic rejection without changing state", () => {
    const definition = defineCommand<"player", State, Payload, Outcome>({
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
    if (result.kind !== "rejected") throw new Error("expected rejected");
    expect(result.aggregate).toEqual(aggregate);
  });

  it("returns a true no-op without advancing the version", () => {
    const definition = defineCommand<"player", State, Payload, Outcome>({
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
    if (result.kind !== "no-op") throw new Error("expected no-op");
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
    const definition = defineCommand<"player", State, Payload, Outcome>({
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
    const definition = defineCommand<"player", State, Payload, Outcome>({
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
      if (!("record" in result)) throw new Error("expected recorded result");
      const canonical = canonicalizeValue(result.record);
      if (canonical.kind === "invalid") throw new Error(canonical.diagnostic.code);
      return canonical.canonical.text;
    });

    expect(new Set(texts).size).toBe(1);
  });

  it("diagnoses malformed JavaScript command and handler output shapes", () => {
    const definition = defineCommand<"player", State, Payload, Outcome>({
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
      expect(malformedCommand.phase).toBe("preflight");
      expect(malformedCommand.diagnostics[0]?.code).toBe("command-invalid");
    }
    expect(malformedOutput.kind).toBe("invalid");
    if (malformedOutput.kind === "invalid") {
      expect(malformedOutput.diagnostics[0]?.code).toBe("handler-result-invalid");
    }
  });

  it("returns preflight invalidity for non-canonical inputs without throwing", () => {
    const definition = defineCommand<"player", State, Payload, Outcome>({
      definitionId: "preflight.v1",
      commandType: "increment",
      aggregateKind: "player",
      handle: () => ({ kind: "rejected", outcome: { result: "unused" } }),
    });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    const cyclicCommandPayload: Record<string, unknown> = {};
    cyclicCommandPayload.self = cyclicCommandPayload;
    const inputs = [
      {
        definition,
        aggregate: { ...aggregate, state: cyclic as never },
        command,
        observations: [],
      },
      {
        definition,
        aggregate,
        command: { ...command, payload: cyclicCommandPayload as never },
        observations: [],
      },
      {
        definition,
        aggregate,
        command,
        observations: [{ kind: "clock", key: "now" } as never],
      },
      {
        definition,
        aggregate,
        command,
        observations: [],
        policy: { maxCanonicalNodes: -1 },
      },
    ];

    for (const input of inputs) {
      expect(() => executeCommand(input)).not.toThrow();
      const result = executeCommand(input);
      expect(result).toMatchObject({ kind: "invalid", phase: "preflight" });
      expect("record" in result).toBe(false);
      expect("aggregate" in result).toBe(false);
    }
  });

  it("does not impose the component node limit again on the assembled record", () => {
    const definition = defineCommand<"player", State, Payload, Outcome>({
      definitionId: "record-budget.v1",
      commandType: "increment",
      aggregateKind: "player",
      handle: () => ({ kind: "rejected", outcome: { result: "bounded" } }),
    });

    const result = executeCommand({
      definition,
      aggregate,
      command,
      observations: [],
      policy: { maxCanonicalNodes: 20 },
    });

    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") {
      expect(Object.isFrozen(result.record)).toBe(true);
      expect(Object.isFrozen(result.record.observations)).toBe(true);
      expect(Object.isFrozen(result.record.observationTrace)).toBe(true);
      expect(Object.isFrozen(result.record.progressionTrace)).toBe(true);
      expect(Object.isFrozen(result.record.diagnostics)).toBe(true);
    }
  });
});
