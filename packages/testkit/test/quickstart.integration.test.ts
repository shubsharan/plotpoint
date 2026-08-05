import { describe, expect, it } from "vitest";

import { defineCommand, defineProgression, type JsonObject } from "@plotpoint/runtime";
import {
  assertAccepted,
  clock,
  createRuntimeHarness,
  playerFixture,
  replayScenario,
} from "@plotpoint/testkit";

type ClueState = JsonObject & { readonly discovered: readonly string[] };
type Payload = JsonObject & { readonly clueId: string };
type Outcome = JsonObject & { readonly result: string };

describe("quickstart acceptance", () => {
  it("repeats and replays the parallel unlock scenario through package roots", () => {
    const definition = defineCommand<"player", ClueState, Payload, Outcome>({
      definitionId: "example.record-clue",
      commandType: "record-clue",
      aggregateKind: "player",
      handle(target, command, context) {
        const discoveredAt = context.take<string>("clock", "now");
        return {
          kind: "accepted",
          nextState: { discovered: [...target.state.discovered, command.payload.clueId] },
          outcome: { result: "recorded" },
          domainEvents: [{ type: "clue-recorded", discoveredAt }],
          effectIntents: [{ type: "show-notification" }],
          progressionIntents: [],
        };
      },
    });
    const progression = defineProgression<"player", ClueState, Payload, Outcome>({
      aggregateKind: "player",
      graphId: "tour",
      graphVersion: 1,
      nodes: [
        { nodeId: "find-clue", initialStatus: "active" },
        { nodeId: "solve-east", initialStatus: "locked" },
        { nodeId: "solve-west", initialStatus: "locked" },
      ],
      automaticRules: [
        {
          ruleId: "unlock-east",
          targetNodeId: "solve-east",
          from: ["locked"],
          to: "available",
          priority: 0,
          when: ({ aggregateState }) => aggregateState.discovered.includes("alpha"),
        },
        {
          ruleId: "unlock-west",
          targetNodeId: "solve-west",
          from: ["locked"],
          to: "available",
          priority: 0,
          when: ({ aggregateState }) => aggregateState.discovered.includes("alpha"),
        },
      ],
    });
    const aggregate = playerFixture<ClueState>({
      id: "player-1",
      stateVersion: 4,
      state: { discovered: [] },
      progression: {
        graphId: "tour",
        graphVersion: 1,
        nodes: [
          { nodeId: "find-clue", status: "active" },
          { nodeId: "solve-east", status: "locked" },
          { nodeId: "solve-west", status: "locked" },
        ],
      },
    });

    const result = createRuntimeHarness({ repeat: 100 }).run({
      name: "recording alpha unlocks both branches",
      definition,
      aggregate,
      command: {
        id: "command-1",
        type: "record-clue",
        target: { kind: "player", id: "player-1" },
        expectedStateVersion: 4,
        payload: { clueId: "alpha" },
      },
      observations: [clock("2030-01-01T00:00:00.000Z")],
      progression,
      policy: { maxAutomaticTransitions: 2 },
    });

    assertAccepted(result);
    expect(result.aggregate.stateVersion).toBe(5);
    expect(result.aggregate.progression?.nodes.map((node) => node.status)).toEqual([
      "active",
      "available",
      "available",
    ]);
    expect(replayScenario({ record: result.record, definition, progression }).kind).toBe("match");
  });
});
