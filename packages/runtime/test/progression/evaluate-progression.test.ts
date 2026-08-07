import { describe, expect, it } from "vitest";

import {
  defineCommand,
  defineProgression,
  initialProgression,
  type Aggregate,
  type AggregateKind,
  type Command,
  type CommandDefinition,
  type ExecutionResult,
  type JsonObject,
  type Observation,
  type ProgressionDefinition,
  type ProgressionInstance,
  type RuntimePolicy,
} from "@plotpoint/runtime";
import { executeCommandWithEvaluator } from "../../src/execute-command.js";
import { evaluateProgression } from "../../src/progression/evaluate-progression.js";

type State = JsonObject & { readonly unlocked: boolean };

function run(
  definition: ProgressionDefinition<State, "player">,
  progression: ProgressionInstance = initialProgression(definition),
) {
  return evaluateProgression({
    definition,
    progression,
    intents: [],
    aggregateState: { unlocked: true },
    commandId: "c1",
    domainEvents: [],
    maxAutomaticTransitions: 10,
  });
}

function executeDefinition<
  Kind extends AggregateKind,
  StateValue extends JsonObject,
  PayloadValue extends JsonObject,
  OutcomeValue extends JsonObject,
>(input: {
  readonly definition: CommandDefinition<StateValue, PayloadValue, OutcomeValue, Kind>;
  readonly aggregate: Aggregate<StateValue, Kind>;
  readonly command: Command<PayloadValue, Kind>;
  readonly observations: readonly Observation[];
  readonly progression?: ProgressionDefinition<StateValue, Kind>;
  readonly policy?: Partial<RuntimePolicy>;
}): ExecutionResult<StateValue, OutcomeValue, PayloadValue, Kind> {
  return executeCommandWithEvaluator({
    definitionId: input.definition.definitionId,
    commandType: input.definition.commandType,
    aggregateKind: input.definition.aggregateKind,
    aggregate: input.aggregate,
    command: input.command,
    observations: input.observations,
    ...(input.progression === undefined ? {} : { progression: input.progression }),
    ...(input.policy === undefined ? {} : { policy: input.policy }),
    evaluate(target, runtimeCommand, context) {
      return {
        kind: "decision",
        decision: input.definition.handle(target, runtimeCommand, context),
      };
    },
  });
}

describe("evaluateProgression", () => {
  it("advances one graph from state, event, and progression facts across heterogeneous commands", () => {
    const observedFactKeys = new Set<string>();
    const recordFactKeys = (facts: object) => {
      observedFactKeys.add(Object.keys(facts).sort().join(","));
    };
    const definition = defineProgression<"player", State>({
      aggregateKind: "player",
      graphId: "heterogeneous-facts",
      nodes: [
        { nodeId: "state", initialStatus: "locked" },
        { nodeId: "event", initialStatus: "locked" },
        { nodeId: "progression", initialStatus: "locked" },
      ],
      transitions: [
        {
          transitionId: "state-unlocked",
          targetNodeId: "state",
          from: ["locked"],
          to: "available",
          priority: 0,
          trigger: "automatic",
          when: (facts) => {
            recordFactKeys(facts);
            return facts.aggregateState.unlocked;
          },
        },
        {
          transitionId: "event-recorded",
          targetNodeId: "event",
          from: ["locked"],
          to: "available",
          priority: 0,
          trigger: "automatic",
          when: (facts) => {
            recordFactKeys(facts);
            return facts.domainEvents.some((event) => event.type === "signal-recorded");
          },
        },
        {
          transitionId: "progression-observed",
          targetNodeId: "progression",
          from: ["locked"],
          to: "available",
          priority: 0,
          trigger: "automatic",
          when: (facts) => {
            recordFactKeys(facts);
            return facts.progression.nodes.some(
              (node) => node.nodeId === "state" && node.status === "available",
            );
          },
        },
      ],
    });
    const aggregate: Aggregate<State, "player"> = {
      aggregateId: "player-1",
      modelId: "field.model",
      aggregateKind: "player",
      schemaId: "field.state",
      stateVersion: 0,
      state: { unlocked: false },
      progression: initialProgression(definition),
    };
    const unlockDefinition = defineCommand<
      "player",
      State,
      { readonly shouldUnlock: boolean },
      { readonly source: string }
    >({
      definitionId: "unlock-state",
      commandType: "unlock-state",
      aggregateKind: "player",
      handle: (target, command) => ({
        kind: "accepted",
        nextState: { unlocked: command.payload.shouldUnlock },
        outcome: { source: "state" },
        domainEvents: [],
        effectIntents: [],
        progressionIntents: [],
      }),
    });
    const unlockCommand: Command<{ readonly shouldUnlock: boolean }, "player"> = {
      id: "unlock-command",
      type: "unlock-state",
      target: { kind: "player", id: aggregate.aggregateId },
      expectedStateVersion: 0,
      payload: { shouldUnlock: true },
    };
    const unlocked = executeDefinition({
      definition: unlockDefinition,
      aggregate,
      command: unlockCommand,
      observations: [],
      progression: definition,
    });

    expect(unlocked).toMatchObject({
      kind: "recorded",
      aggregate: { stateVersion: 1 },
      record: { terminal: "accepted" },
    });
    if (unlocked.kind !== "recorded") throw new Error("expected recorded unlock");
    expect(unlocked.record.progressionTrace.map((step) => [step.round, step.transitionId])).toEqual(
      [
        [1, "state-unlocked"],
        [2, "progression-observed"],
      ],
    );

    const signalDefinition = defineCommand<
      "player",
      State,
      { readonly signal: string },
      { readonly source: string; readonly signal: string }
    >({
      definitionId: "record-signal",
      commandType: "record-signal",
      aggregateKind: "player",
      handle: (target, command) => ({
        kind: "accepted",
        nextState: target.state,
        outcome: { source: "event", signal: command.payload.signal },
        domainEvents: [{ type: "signal-recorded", signal: command.payload.signal }],
        effectIntents: [],
        progressionIntents: [],
      }),
    });
    const signalCommand: Command<{ readonly signal: string }, "player"> = {
      id: "signal-command",
      type: "record-signal",
      target: { kind: "player", id: aggregate.aggregateId },
      expectedStateVersion: 1,
      payload: { signal: "east" },
    };
    const signaled = executeDefinition({
      definition: signalDefinition,
      aggregate: unlocked.aggregate,
      command: signalCommand,
      observations: [],
      progression: definition,
    });

    expect(signaled).toMatchObject({
      kind: "recorded",
      aggregate: { stateVersion: 2 },
      record: { terminal: "accepted" },
    });
    if (signaled.kind !== "recorded") throw new Error("expected recorded signal");
    expect(signaled.record.progressionTrace.map((step) => step.transitionId)).toEqual([
      "event-recorded",
    ]);
    expect(signaled.aggregate.progression?.nodes).toEqual([
      { nodeId: "event", status: "available" },
      { nodeId: "progression", status: "available" },
      { nodeId: "state", status: "available" },
    ]);
    expect([...observedFactKeys]).toEqual(["aggregateState,domainEvents,progression"]);
  });

  it("applies independent winners as one canonical parallel batch", () => {
    const definition = defineProgression<"player", State>({
      aggregateKind: "player",
      graphId: "parallel",
      nodes: [
        { nodeId: "root", initialStatus: "active" },
        { nodeId: "west", initialStatus: "locked" },
        { nodeId: "east", initialStatus: "locked" },
      ],
      transitions: [
        {
          transitionId: "unlock-west",
          targetNodeId: "west",
          from: ["locked"],
          to: "available",
          priority: 0,
          trigger: "automatic",
          when: ({ aggregateState }) => aggregateState.unlocked,
        },
        {
          transitionId: "unlock-east",
          targetNodeId: "east",
          from: ["locked"],
          to: "available",
          priority: 0,
          trigger: "automatic",
          when: ({ progression }) => progression.nodes.every((node) => node.status !== "available"),
        },
      ],
    });
    const result = run(definition);

    expect(result.kind).toBe("stable");
    if (result.kind === "stable") {
      expect(result.progression.nodes).toEqual([
        { nodeId: "east", status: "available" },
        { nodeId: "root", status: "active" },
        { nodeId: "west", status: "available" },
      ]);
      expect(result.trace.map((step) => [step.round, step.transitionId])).toEqual([
        [1, "unlock-east"],
        [1, "unlock-west"],
      ]);
    }
  });

  it("selects the lowest priority per node", () => {
    const definition = defineProgression<"player", State>({
      aggregateKind: "player",
      graphId: "priority",
      nodes: [{ nodeId: "node", initialStatus: "available" }],
      transitions: [
        {
          transitionId: "complete",
          targetNodeId: "node",
          from: ["available"],
          to: "completed",
          priority: 5,
          trigger: "automatic",
          when: () => true,
        },
        {
          transitionId: "activate",
          targetNodeId: "node",
          from: ["available"],
          to: "active",
          priority: 1,
          trigger: "automatic",
          when: () => true,
        },
      ],
    });
    const result = run(definition);

    expect(result.kind).toBe("stable");
    if (result.kind === "stable") expect(result.progression.nodes[0]?.status).toBe("active");
  });

  it("reports equal-priority conflicts", () => {
    const definition = defineProgression<"player", State>({
      aggregateKind: "player",
      graphId: "conflict",
      nodes: [{ nodeId: "node", initialStatus: "available" }],
      transitions: [
        {
          transitionId: "a",
          targetNodeId: "node",
          from: ["available"],
          to: "active",
          priority: 0,
          trigger: "automatic",
          when: () => true,
        },
        {
          transitionId: "b",
          targetNodeId: "node",
          from: ["available"],
          to: "skipped",
          priority: 0,
          trigger: "automatic",
          when: () => true,
        },
      ],
    });
    const result = run(definition);

    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") {
      expect(result.diagnostic).toEqual({
        code: "progression-conflict",
        details: {
          commandId: "c1",
          graphId: "conflict",
          nodeId: "node",
          priority: 0,
          transitionIds: ["a", "b"],
        },
      });
    }
  });

  it("applies named command intents before automatic evaluation", () => {
    const definition = defineProgression<"player", State>({
      aggregateKind: "player",
      graphId: "direct",
      nodes: [
        { nodeId: "a", initialStatus: "active" },
        { nodeId: "b", initialStatus: "available" },
      ],
      transitions: [
        {
          transitionId: "complete-a",
          targetNodeId: "a",
          from: ["active"],
          to: "completed",
          priority: 0,
          trigger: "intent",
        },
        {
          transitionId: "skip-b",
          targetNodeId: "b",
          from: ["available"],
          to: "skipped",
          priority: 0,
          trigger: "intent",
        },
      ],
    });
    const result = evaluateProgression({
      definition,
      progression: initialProgression(definition),
      intents: [{ transitionId: "complete-a" }, { transitionId: "skip-b" }],
      aggregateState: { unlocked: true },
      commandId: "c1",
      domainEvents: [],
      maxAutomaticTransitions: 0,
    });

    expect(result.kind).toBe("stable");
    if (result.kind === "stable")
      expect(result.trace.map((step) => step.source)).toEqual(["command", "command"]);
  });
});
