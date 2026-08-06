import { describe, expect, it, vi } from "vitest";

import type { TransitionCandidate, TransitionResult } from "@plotpoint/protocol";

import { createLocalModelAdapter } from "../src/runtime/local-model-adapter";

const initialView = {
  modelId: "counter.player",
  aggregateId: "player-1",
  aggregateKind: "player" as const,
  schemaId: "counter.state",
  stateVersion: 0,
  state: { count: 0 },
};

const acceptedCandidate = {
  commandId: "command-1",
  modelId: initialView.modelId,
  commandType: "increment",
  payload: { amount: 1 },
  target: {
    aggregateId: initialView.aggregateId,
    aggregateKind: initialView.aggregateKind,
    schemaId: initialView.schemaId,
  },
  expectedStateVersion: 0,
  observationIds: [],
  terminal: "accepted",
  nextState: { count: 1 },
  outcome: { result: "incremented" },
  domainEvents: [],
  effectIntents: [],
  progressionTrace: [],
} satisfies TransitionCandidate;

describe("local model adapter", () => {
  it("reconciles an accepted duplicate after the original response is lost", async () => {
    const commit = vi.fn(
      async (): Promise<TransitionResult> => ({
        commandId: acceptedCandidate.commandId,
        disposition: "duplicate",
        terminal: "accepted",
        resultingStateVersion: 1,
        outcome: acceptedCandidate.outcome,
      }),
    );
    const changed = vi.fn();
    const adapter = createLocalModelAdapter({
      initialView,
      bindings: {
        increment: {
          prepare: () => acceptedCandidate,
        },
      },
      commit,
    });
    adapter.onChanged(changed);

    await expect(
      adapter.commands.increment?.execute({
        commandId: acceptedCandidate.commandId,
        payload: acceptedCandidate.payload,
      }),
    ).resolves.toMatchObject({ disposition: "duplicate", resultingStateVersion: 1 });

    await expect(adapter.getView()).resolves.toEqual({
      ...initialView,
      stateVersion: 1,
      state: { count: 1 },
    });
    expect(commit).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledOnce();
  });

  it("rejects a duplicate whose durable version cannot follow the current view", async () => {
    const adapter = createLocalModelAdapter({
      initialView,
      bindings: { increment: { prepare: () => acceptedCandidate } },
      commit: async () => ({
        commandId: acceptedCandidate.commandId,
        disposition: "duplicate",
        terminal: "accepted",
        resultingStateVersion: 2,
        outcome: acceptedCandidate.outcome,
      }),
    });

    await expect(
      adapter.commands.increment?.execute({
        commandId: acceptedCandidate.commandId,
        payload: acceptedCandidate.payload,
      }),
    ).rejects.toThrow("runtime-local-command-version-mismatch");
    await expect(adapter.getView()).resolves.toEqual(initialView);
  });
});
