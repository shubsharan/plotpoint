# Quickstart: One Game from Definition to Durable Action

This walkthrough is the implementation acceptance shape for both reference games. Names illustrate the
designed contracts; they are not implementation completed by this planning feature.

## 1. Declare One Composition

A local field puzzle uses Project Configuration V2 with one local player model, one command,
progression, one component, and no trusted mechanic:

```json
{
  "projectFormatVersion": 2,
  "environment": "web",
  "hostApi": { "major": 1, "minimumMinor": 2 },
  "application": {
    "definition": { "source": "src/application.ts", "export": "fieldApplication" },
    "components": ["field.puzzle.v1"]
  },
  "aggregateModels": [
    {
      "id": "field.player.v2",
      "kind": "player",
      "authority": "local",
      "initializer": { "source": "src/initial-state.ts", "export": "initializeField" },
      "aggregateSchema": "field.player-state.v1",
      "initializationContent": "field.game.v1",
      "commands": ["field.advance.v2"],
      "progression": "field.route.v2",
      "events": [{ "type": "field.advanced.v1", "schema": "field.advanced-event.v1" }],
      "effects": []
    }
  ]
}
```

The complete file also declares command payload/outcome schemas, the referenced event schema,
aggregate/content schemas, component, progression, and resources. It does not declare logic or
presentation registry defaults; the compiler generates those roots from the registrations.

## 2. Write the Aggregate Logic

The initializer returns only canonical state:

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
  definitionId: "field.advance.v2",
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
      domainEvents: [{ type: "field.advanced.v1", payload: {} }],
      effectIntents: [],
      progressionIntents: [],
    };
  },
});
```

The compiler builds `field.player.v2` from its initializer, registered commands, schemas, and optional
progression. Application code never writes a second `logic.run()` adapter.

## 3. Define Progression Nodes and Edges

Progression remains optional. When used, nodes hold activity status and transitions are explicit
lifecycle edges:

```ts
export const fieldRoute = defineProgression({
  aggregateKind: "player",
  graphId: "field.route.v2",
  graphVersion: 2,
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
    {
      transitionId: "unlock-complete",
      targetNodeId: "complete",
      from: ["locked"],
      to: "available",
      priority: 0,
      trigger: "automatic",
      when: ({ aggregateState }) => aggregateState.puzzleSolved,
    },
    {
      transitionId: "complete-route",
      targetNodeId: "complete",
      from: ["available"],
      to: "completed",
      priority: 0,
      trigger: "automatic",
      when: ({ aggregateState }) => aggregateState.puzzleSolved,
    },
  ],
});
```

The runtime constructs the initial progression instance; the initializer does not duplicate it. Rules
read aggregate/event facts rather than one progression-wide command payload or outcome type, so another
registered command can advance the same route safely.

Here `visitedCheckpoints` and `puzzleSolved` are durable domain facts; only progression stores activity
status. The game does not mirror a `phase` field alongside node status.

If the game state already expresses all needed phases and no platform-managed activity statuses are
used, omit `progression` instead.

## 4. Define a Component and Application

The project registration declares the component's usable dependencies:

```json
{
  "id": "field.puzzle.v1",
  "implementation": { "source": "src/components/puzzle.ts", "export": "FieldPuzzle" },
  "commands": ["field.advance.v2"],
  "content": ["field.game.v1"],
  "assets": [],
  "capabilities": [{ "id": "plotpoint.location.foreground", "major": 1, "minimumMinor": 0 }]
}
```

The implementation receives only those resolved bindings:

```ts
export function FieldPuzzle(context: ComponentContextV1): HTMLElement {
  const game = context.content["field.game.v1"];
  const advance = context.local.commands["field.advance.v2"];
  const location = context.capabilities["plotpoint.location.foreground"];
  const element = renderPuzzle({ game, advance, location });
  const refresh = async () => updatePuzzle(element, await context.local.getView());
  context.lifecycle.defer(context.local.onChanged(() => void refresh()));
  void refresh();
  return element;
}
```

The application mounts compiler-selected components; it does not recreate their map:

```ts
export const fieldApplication = defineGameApplicationV1({
  contractVersion: 1,
  mount({ root, components }) {
    const element = components["field.puzzle.v1"]();
    root.replaceChildren(element);
    return {
      unmount() {
        element.remove();
      },
    };
  },
});
```

An unknown declared ID fails compilation. A platform operation outside the verified release
composition fails at its runtime/host resolver. Trusted WebView code is still not represented as
hostile-code sandboxed.

## 5. Add Multiplayer by Binding a Trusted Mechanic

The cooperative hunt declares a server aggregate/command contract and a trusted-mechanic binding; it
does not add player routing or server-executed release code:

```json
{
  "id": "plotpoint.hunt.target-discovery",
  "version": 1,
  "aggregateModel": "hunt.team.v2",
  "commands": ["plotpoint.hunt.target-discovery.v1"],
  "configuration": "plotpoint.hunt.targets.v1",
  "projectionSchema": { "id": "plotpoint.hunt.team-projection", "version": 1 },
  "capabilities": [{ "id": "plotpoint.location.foreground", "major": 1, "minimumMinor": 0 }]
}
```

The hunt's server model and trusted command registrations are data-only declarations: they contain no
initializer, handler, validator implementation, or server source path. During release registration,
the API opens Game Composition V1, resolves that exact ID/version from its closed platform registry,
and checks the declarations against the adapter-owned resolved team model and executable validators.
Each validator must name the digest of the exact inventoried schema bytes it implements, and the server
model must have no progression in Trusted Mechanic V1. The API then stores safe configuration. Session
creation initializes that platform model. Participant commands use the generic
`/v1/shared-sessions/...` routes and Sync V1; the target-discovery adapter supplies explicit
location-policy facts to Runtime Model V2.

The native player behavior is generic:

- local field puzzle: `trustedMechanic` is absent, so no join panel or shared client exists;
- unbound hunt: show “Join shared session” and keep credentials outside the WebView;
- bound hunt: mount the same application with Shared Play V1 available;
- mismatched release/session: expose no shared projection and report a binding conflict.

## 6. Compile and Inspect

After implementation, both projects must succeed through the public compiler CLI:

```bash
pnpm build
pnpm plotpoint validate --project examples/releases/field-puzzle
pnpm plotpoint compile --project examples/releases/field-puzzle --out /tmp/field-puzzle.pprelease
pnpm plotpoint inspect /tmp/field-puzzle.pprelease --json
pnpm plotpoint validate --project examples/releases/team-session-hunt
pnpm plotpoint compile --project examples/releases/team-session-hunt --out /tmp/team-session-hunt.pprelease
pnpm plotpoint inspect /tmp/team-session-hunt.pprelease --json
```

Inspection must show:

- Host API 1.2 and unchanged Release Format V1;
- exactly one `composition/game.v1.json` catalog;
- catalog descriptors for the generated application, local models with resolved command bindings,
  progression, and components plus catalog-only server contracts and their expected export IDs;
- every logical resource mapped to one inventoried path; and
- one trusted target-discovery binding only in the hunt.

A compiler integration fixture additionally loads the trusted generated roots and proves their keys and
contract metadata agree with those inspected descriptors; the data-only inspection command does not
claim to execute or introspect JavaScript bundles.

Deleting the application export, adding an undeclared component command, changing a mechanic version,
or pointing configuration at the wrong schema must fail before an artifact is published.

## 7. Prove Local Durability

The field acceptance test uses production-shaped bundle loading and Host API 1.2:

1. compile, verify, install, and create the local run;
2. mount the generated application through Game Composition V1;
3. capture a declared observation and execute `field.advance.v2`;
4. commit Local Transition V2 atomically;
5. destroy/recreate the WebView and recover identical state, progression, terminal, and revision; and
6. export the redacted Game Play Report V2 through the generic run-owned report path.

The matrix includes accepted state change, event-only/effect-only acceptance, explicit no-op,
rejection, local non-committable preflight invalidity, recorded execution invalidity, progression
change, replay, duplicate commit, and response loss. The preflight-invalid fixture runs 100 identical
attempts and proves that every result remains local and no receipt, observation consumption, or durable
mutation appears.

Separate lifecycle fixtures prove that a missing or statically malformed application fails compilation,
while a throwing mount or invalid cleanup handle fails at open without exposing playable state.

## 8. Prove Shared Recovery

The hunt acceptance test uses three participants and one verified release:

1. create a generic shared session and invitations from the trusted mechanic binding;
2. race parallel joins for one run, reserve exactly one pending request, and persist its SecureStore
   secrets before the first network attempt;
3. join only when active run, response, snapshot, and stored binding release IDs match;
4. enqueue several discoveries while disconnected;
5. begin one finite batch, mark it submitting, submit every captured command once, and pull once;
6. interrupt before/after join send, claim, each submit, pull, and local commit, then retry exactly;
7. repeat queued-action response-loss recovery 100 times and prove each action has exactly one immutable
   terminal while every pass remains finite;
8. apply the same normal, corrective, and revoked pull 100 times and compare complete SQLite state;
9. overlap enqueue, foreground, offline-to-reachable reconnect, and retry triggers and verify one active
   plus at most one trailing pass;
10. exercise both an authenticated revocation error and a revoked snapshot, atomically mark local
    membership revoked in each fixture, and retain blocked outbox evidence; and
11. export the same Game Play Report V2 shape with a generic shared section and no coordinates,
    credentials, protected config, raw state, or target-specific completion fields;
12. compile a changed release, install it as a fresh run, and verify it cannot reuse the prior pending or
    bound session before joining a newly created release-pinned session.

Wrong release, run, session, participant, team, or service origin leaves the prior binding and
projection unchanged. Registration rejects a trusted outcome schema containing anything beyond the
exact safe `{ code }` field, while valid trusted outcomes copy that code exactly to Sync V1 and
execution invalidity uses its deterministic primary diagnostic. Every well-formed bridge failure echoes
its request ID.

## 9. Run the Provider-Free Gate

```bash
pnpm verify
git diff --check
```

Provider-free compiler, protocol, runtime, SQLite, PostgreSQL/Testcontainers, WebView bootstrap, and
external-consumer-style tests are required. Simulator/emulator and physical-device evidence remain
separate and must be reported honestly; passing this quickstart does not establish physical acceptance.
