# Quickstart: Deterministic Runtime Core

This is the external-consumer acceptance path for the planned Gate 1 API. It becomes executable after implementation; it intentionally uses no player, database, network, clock, random source, or device.

## 1. Define Durable State and a Command

```ts
import { defineCommand, type JsonObject, type ProgressionDefinition } from "@plotpoint/runtime";

type ClueState = JsonObject & {
  readonly discovered: readonly string[];
};

type RecordCluePayload = JsonObject & {
  readonly clueId: string;
};

type RecordClueOutcome = JsonObject & {
  readonly result: "recorded" | "already-recorded";
};

const recordClue = defineCommand<ClueState, RecordCluePayload, RecordClueOutcome>({
  definitionId: "example.record-clue.v1",
  commandType: "record-clue",
  aggregateKind: "participant",
  handle(aggregate, command, context) {
    if (aggregate.state.discovered.includes(command.payload.clueId)) {
      return {
        kind: "rejected",
        outcome: { result: "already-recorded" },
      };
    }

    const discoveredAt = context.take<string>("clock", "discovered-at");

    return {
      kind: "accepted",
      nextState: {
        discovered: [...aggregate.state.discovered, command.payload.clueId],
      },
      outcome: { result: "recorded" },
      domainEvents: [{ type: "clue-recorded", clueId: command.payload.clueId, discoveredAt }],
      effectIntents: [{ type: "show-notification", messageKey: "clue-recorded" }],
      progressionIntents: [],
    };
  },
});
```

The handler receives a detached frozen aggregate and command. The clock value is explicit. Returning a notification describes later work; it does not display anything.

## 2. Define Parallel Progression

```ts
const progression: ProgressionDefinition<ClueState, RecordCluePayload, RecordClueOutcome> = {
  graphId: "tour.v1",
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
};
```

Both unlock rules see the same pre-round state and apply as one batch. The stable result has two available nodes; there is no global current node.

## 3. Run a Strict Scenario

```ts
import { clock, createRuntimeHarness, participantFixture } from "@plotpoint/testkit";

const aggregate = participantFixture<ClueState>({
  id: "participant-1",
  schemaVersion: 1,
  stateVersion: 4,
  authority: "local",
  state: { discovered: [] },
  progression: {
    graphId: "tour.v1",
    graphVersion: 1,
    nodes: [
      { nodeId: "find-clue", status: "active" },
      { nodeId: "solve-east", status: "locked" },
      { nodeId: "solve-west", status: "locked" },
    ],
  },
});

const harness = createRuntimeHarness({
  failOnUnusedObservations: true,
  auditAmbientApis: true,
  repeat: 100,
});

const result = harness.run({
  name: "recording alpha unlocks both branches",
  definition: recordClue,
  aggregate,
  command: {
    id: "command-1",
    type: "record-clue",
    target: { kind: "participant", id: "participant-1" },
    expectedStateVersion: 4,
    payload: { clueId: "alpha" },
  },
  observations: [clock("2030-01-01T00:00:00.000Z")],
  progression,
  policy: { maxAutomaticTransitions: 2 },
});
```

Expected evidence:

- all 100 executions have identical canonical records;
- the returned aggregate state version is `5`;
- the caller's aggregate remains unchanged at version `4`;
- `solve-east` and `solve-west` are both available;
- the automatic trace contains one two-node batch in canonical node order;
- the notification remains effect-intent data;
- exactly one clock observation is consumed and none remain unused.

## 4. Replay the Record

```ts
import { replayScenario } from "@plotpoint/testkit";

const replay = replayScenario({
  record: result.record,
  definition: recordClue,
  progression,
});

if (replay.kind !== "match") {
  throw new Error(`Replay diverged at ${replay.path}`);
}
```

Replay uses the record's aggregate, command, observation script, and resolved limits. It performs no infrastructure lookup and reports the first material mismatch.

## 5. Exercise Failure Boundaries

The acceptance suite repeats the scenario with:

- expected state version `3`, proving stale rejection occurs before handler invocation;
- a missing clock observation, proving no ambient fallback exists;
- an unused extra observation, proving the strict harness reports it;
- a cyclic or accessor-bearing state value, proving canonical validation reports its path;
- a mutation attempt inside the handler, proving caller and aggregate fixtures remain unchanged;
- `maxAutomaticTransitions: 1`, proving the two-node batch is rejected whole;
- two equal-priority rules targeting `solve-east`, proving conflict is explicit;
- rules oscillating `active <-> available`, proving cycle diagnostics include the repeated state and trace.

## 6. Run the Gate

After implementation, use Vitest watch mode while authoring:

```sh
pnpm test:watch
```

The non-interactive feature gate is:

```sh
pnpm --filter @plotpoint/runtime test
pnpm --filter @plotpoint/runtime check-types
pnpm --filter @plotpoint/runtime build
pnpm --filter @plotpoint/testkit test
pnpm --filter @plotpoint/testkit check-types
pnpm --filter @plotpoint/testkit build
pnpm test
pnpm build
pnpm verify
```

Passing package builds alone is insufficient. The repeated, isolation, invalid-value, stale-version, observation, effect-as-data, graph-model, cycle, conflict, exact-limit, and replay evidence must all pass.
