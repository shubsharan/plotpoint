# Quickstart: One Game from Definition to Durable Action

This walkthrough defines the implementation acceptance shape for both reference games. The commands
and files below describe planned behavior; this documentation update does not implement them.

## 1. Declare One Composition

A local field puzzle uses the corrected Project Configuration with one local/player model, one
command, optional progression, one component, and no trusted mechanic:

```json
{
  "projectFormatVersion": 1,
  "environment": "web",
  "hostApi": { "major": 1, "minimumMinor": 0 },
  "application": {
    "definition": { "source": "src/application.ts", "export": "fieldApplication" },
    "components": ["field.puzzle"]
  },
  "aggregateModels": [
    {
      "id": "field.player",
      "authority": "local",
      "kind": "player",
      "stateSchema": "field.player-state",
      "initializationSchema": "field.initialization",
      "initializer": { "source": "src/initial-state.ts", "export": "initializeField" },
      "initializationContent": "field.game",
      "events": [{ "type": "field.advanced", "schema": "field.advanced-event" }],
      "effects": []
    }
  ],
  "commands": [
    {
      "id": "field.advance",
      "type": "advance",
      "aggregateModel": "field.player",
      "payloadSchema": "field.advance-payload",
      "outcomeSchema": "field.advance-outcome",
      "execution": "local",
      "definition": { "source": "src/commands/advance.ts", "export": "advance" }
    }
  ],
  "progressions": [
    {
      "id": "field.route",
      "version": 1,
      "aggregateModel": "field.player",
      "definition": { "source": "src/progression.ts", "export": "fieldRoute" }
    }
  ],
  "components": [
    {
      "id": "field.puzzle",
      "implementation": { "source": "src/components/puzzle.ts", "export": "FieldPuzzle" },
      "commands": ["field.advance"],
      "content": ["field.game"],
      "assets": [],
      "capabilities": []
    }
  ],
  "schemas": [
    { "id": "field.player-state", "version": 1, "path": "schemas/player-state.json" },
    { "id": "field.initialization", "version": 1, "path": "schemas/initialization.json" },
    { "id": "field.advance-payload", "version": 1, "path": "schemas/advance-payload.json" },
    { "id": "field.advance-outcome", "version": 1, "path": "schemas/advance-outcome.json" },
    { "id": "field.advanced-event", "version": 1, "path": "schemas/advanced-event.json" }
  ],
  "content": [
    {
      "id": "field.game",
      "path": "content/game.json",
      "schema": { "id": "field.initialization", "version": 1 }
    }
  ],
  "assets": []
}
```

The command and progression point to their model. The model does not repeat command/progression lists.
The content schema exactly matches the initializer's input schema. If initialization content is absent,
the compiler supplies `{}` and validates it against that schema.

## 2. Write Typed Aggregate Logic

The initializer returns canonical state only; the runtime constructs identity, schema fields,
`stateVersion: 0`, and optional initial progression:

```ts
export function initializeField(content: FieldGameContent): FieldState {
  return {
    attempts: 0,
    visitedCheckpoints: [content.startCheckpoint],
    puzzleSolved: false,
  };
}
```

A command returns an explicit semantic decision:

```ts
export const advance = defineCommand({
  definitionId: "field.advance",
  commandType: "advance",
  aggregateKind: "player",
  handle(aggregate, command, observations) {
    if (command.payload.action === "solve" && command.payload.answer !== "echo") {
      return { kind: "rejected", outcome: { code: "answer-incorrect" } };
    }
    if (command.payload.action === "solve" && aggregate.state.puzzleSolved) {
      return { kind: "no-op", outcome: { code: "already-complete" } };
    }
    return {
      kind: "accepted",
      nextState: nextFieldState(aggregate.state, command.payload, observations),
      outcome: { code: "advanced" },
      domainEvents: [{ type: "field.advanced", payload: {} }],
      effectIntents: [],
      progressionIntents: [],
    };
  },
});
```

The compiler resolves the local model from its initializer, derived commands, schemas, and derived
optional progression. Application code does not write a second `logic.run()` or registry adapter.

## 3. Define Progression Once

```ts
export const fieldRoute = defineProgression({
  aggregateKind: "player",
  graphId: "field.route",
  graphVersion: 1,
  nodes: [
    { nodeId: "first-checkpoint", initialStatus: "active" },
    { nodeId: "puzzle", initialStatus: "locked" },
    { nodeId: "complete", initialStatus: "locked" },
  ],
  transitions: [
    {
      transitionId: "complete-first-checkpoint",
      targetNodeId: "first-checkpoint",
      from: ["active"],
      to: "completed",
      priority: 0,
      trigger: "automatic",
      when: ({ aggregateState }) => aggregateState.visitedCheckpoints.includes("puzzle"),
    },
    {
      transitionId: "unlock-puzzle",
      targetNodeId: "puzzle",
      from: ["locked"],
      to: "available",
      priority: 0,
      trigger: "automatic",
      when: ({ aggregateState }) => aggregateState.visitedCheckpoints.includes("puzzle"),
    },
    {
      transitionId: "complete-puzzle",
      targetNodeId: "puzzle",
      from: ["available", "active"],
      to: "completed",
      priority: 0,
      trigger: "automatic",
      when: ({ aggregateState }) => aggregateState.puzzleSolved,
    },
  ],
});
```

The runtime calls `initialProgression`; the initializer does not duplicate progression state. Automatic
rules read aggregate/event/progression facts rather than one command payload/outcome type. If durable
game state already expresses every phase, progression is omitted.

## 4. Mount Scoped Components

```ts
export function FieldPuzzle(context: ComponentContext): HTMLElement {
  const game = context.content["field.game"];
  const advance = context.local.commands["field.advance"];
  const element = renderPuzzle({ game, advance });
  const refresh = async () => updatePuzzle(element, await context.local.getView());
  context.lifecycle.defer(context.local.onChanged(() => void refresh()));
  void refresh();
  return element;
}

export const fieldApplication = defineGameApplication({
  mount({ root, components }) {
    const element = components["field.puzzle"]();
    root.replaceChildren(element);
    return { unmount: () => element.remove() };
  },
});
```

The application receives no bootstrap or aggregate state. Only the component's `local` context can read
and subscribe to committed state. Its maps contain only declared dependencies. Cleanup registration is
owned by the player mount scope.

## 5. Bind Trusted Shared Behavior

The co-op game adds one server/team model and its trusted command contracts to the same arrays, then selects
them once:

```json
{
  "id": "plotpoint.location.target-discovery",
  "version": 1,
  "aggregateModel": "plotpoint.location.team",
  "commands": ["plotpoint.location.target-discovery"],
  "configuration": "plotpoint.location.target-config",
  "projectionSchema": { "id": "plotpoint.location.team-projection", "version": 1 },
  "capabilities": [{ "id": "plotpoint.location.foreground", "major": 1, "minimumMinor": 0 }]
}
```

The selected model is `authority: "server", kind: "team"`; the selected commands use
`execution: "trusted-mechanic"`. Neither repeats the mechanic ID. They contain no initializer, handler,
validator, server source, package, or URL.

At registration, the API resolves the exact adapter from its closed registry, validates model/command/
schema/config/projection/capability agreement, and stores safe initialization configuration. The
adapter returns a validated binding plus initializer input, an authorized runtime command plus explicit
observation facts or a stable rejected/invalid terminal, and a complete validated projection.
`expectedStateVersion` and `resultingStateVersion` pass straight through Runtime and Sync.

The native player remains generic: local releases have no join surface; unbound shared releases show
generic native join controls; exact bindings expose scoped Shared Play; conflicts expose no
projection.

## 6. Compile and Inspect

After implementation, both projects must succeed through the public CLI:

```bash
pnpm build
pnpm plotpoint validate --project examples/releases/field-puzzle
pnpm plotpoint compile --project examples/releases/field-puzzle --out /tmp/field-puzzle.pprelease
pnpm plotpoint inspect /tmp/field-puzzle.pprelease --json
pnpm plotpoint validate --project examples/releases/co-op-game
pnpm plotpoint compile --project examples/releases/co-op-game --out /tmp/co-op-game.pprelease
pnpm plotpoint inspect /tmp/co-op-game.pprelease --json
```

Inspection must show unchanged Release Format and Host API compatibility metadata, exactly one mandatory
`composition/game.json`, one-way model relationships, fixed generated registry maps, exact resource
bindings, and a trusted target-discovery binding only in the co-op game. Game Composition does not repeat
manifest Host API/capabilities or invent per-item export names.

Deleting the application export, supplying the discarded project shape, adding an undeclared component
command, mismatching initialization content/schema, changing mechanic version, or omitting the catalog
must fail. There is no legacy parse or composition-absent success result.

## 7. Prove Local Durability

The field acceptance test:

1. compiles, verifies, installs, and creates the run;
2. sends Runtime Bootstrap to the generated adapter and mounts the application;
3. captures a declared observation and executes `field.advance`;
4. commits Local Transition atomically;
5. destroys/recreates the WebView and recovers identical state, progression, terminal, and state version;
6. exports Game Play Report through the generic run-owned path; and
7. fails an incompatible database with explicit reset/reinstall guidance instead of migrating/dropping it.

Fixtures cover accepted state change, event/effect-only acceptance, no-op, rejection, preflight and
recorded execution invalidity, progression, replay, duplicate commit, response loss, mount failure, and
cleanup rollback. One hundred repeated preflight-invalid attempts produce no receipt, observation
consumption, or durable mutation.

## 8. Prove Shared Recovery

The co-op game acceptance test:

1. registers the release and creates a generic shared session from the trusted binding;
2. reserves one exact pending join and persists SecureStore secrets before network send;
3. joins only when run/response/snapshot/binding identities match;
4. queues several commands while disconnected;
5. claims one finite batch, submits each captured command once, and pulls once;
6. interrupts at every join/claim/submit/pull/commit boundary and retries exactly;
7. repeats response-loss recovery and normal/corrective/revoked pulls 100 times;
8. overlaps enqueue/foreground/reconnect/retry triggers and observes one active plus at most one trailing pass;
9. handles authenticated revocation atomically and retains blocked outbox evidence;
10. exports the same Game Play Report shape with no target-specific fields; and
11. recompiles a changed release as a fresh run/session without active-session migration.

Wrong release, run, session, participant, team, or origin leaves prior binding/projection unchanged.
Invalid trusted outcome shapes are rejected rather than truncated. Every well-formed bridge failure
echoes its request ID.

## 9. Run the Provider-Free Gate

```bash
pnpm verify
git diff --check
```

Provider-free compiler, protocol, runtime, SQLite, PostgreSQL/Testcontainers, WebView bootstrap, and
external-consumer tests are required during implementation. Simulator/emulator and physical-device
evidence remain separate; passing this quickstart does not establish physical acceptance.
