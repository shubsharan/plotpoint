import { describe, expect, it } from "vitest";

import {
  defineCommand,
  defineProgression,
  resolveCommandBinding,
  type JsonObject,
} from "@plotpoint/runtime";
import { assertAccepted, clock, createRuntimeHarness, replayScenario } from "@plotpoint/testkit";
import { isJsonObject, modelFixture, runtimeSchema } from "./runtime-model.js";

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
    const progression = defineProgression<"player", ClueState>({
      aggregateKind: "player",
      graphId: "tour",
      nodes: [
        { nodeId: "find-clue", initialStatus: "active" },
        { nodeId: "solve-east", initialStatus: "locked" },
        { nodeId: "solve-west", initialStatus: "locked" },
      ],
      transitions: [
        {
          transitionId: "unlock-east",
          targetNodeId: "solve-east",
          from: ["locked"],
          to: "available",
          priority: 0,
          trigger: "automatic",
          when: ({ aggregateState }) => aggregateState.discovered.includes("alpha"),
        },
        {
          transitionId: "unlock-west",
          targetNodeId: "solve-west",
          from: ["locked"],
          to: "available",
          priority: 0,
          trigger: "automatic",
          when: ({ aggregateState }) => aggregateState.discovered.includes("alpha"),
        },
      ],
    });
    const stateSchema = runtimeSchema(
      "tour.player-state",
      (value): value is ClueState =>
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        "discovered" in value &&
        Array.isArray(value.discovered) &&
        value.discovered.every((clueId) => typeof clueId === "string"),
    );
    const payloadSchema = runtimeSchema(
      "tour.record-clue-payload",
      (value): value is Payload =>
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        "clueId" in value &&
        typeof value.clueId === "string",
    );
    const outcomeSchema = runtimeSchema(
      "tour.record-clue-outcome",
      (value): value is Outcome =>
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        "result" in value &&
        typeof value.result === "string",
    );
    const binding = resolveCommandBinding({
      registrationId: "example.record-clue",
      definition,
      payloadSchema,
      outcomeSchema,
    });
    const model = modelFixture({
      modelId: "tour.player",
      aggregateKind: "player",
      authority: "local",
      stateSchema,
      initializeState: () => ({ discovered: [] }),
      commandsByType: { "record-clue": binding },
      eventSchemas: { "clue-recorded": runtimeSchema("tour.clue-recorded", isJsonObject) },
      effectSchemas: {
        "show-notification": runtimeSchema("tour.show-notification", isJsonObject),
      },
      progression,
    });
    const initialized = model.initialize({});
    if (initialized.kind !== "initialized") throw new Error("quickstart-initialization-failed");
    const aggregate = initialized.aggregate;

    const result = createRuntimeHarness({ repeat: 100 }).run({
      name: "recording alpha unlocks both branches",
      model,
      aggregate,
      command: {
        id: "command-1",
        type: "record-clue",
        target: { kind: "player", id: aggregate.aggregateId },
        expectedStateVersion: 0,
        payload: { clueId: "alpha" },
      },
      observations: [clock("2030-01-01T00:00:00.000Z")],
    });

    assertAccepted(result);
    expect(result.aggregate.stateVersion).toBe(1);
    expect(result.aggregate.progression?.nodes.map((node) => node.status)).toEqual([
      "active",
      "available",
      "available",
    ]);
    expect(replayScenario({ record: result.record, model }).kind).toBe("match");
  });
});
