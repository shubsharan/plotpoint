# Contract: Host Application

## Single Executable Runtime Amendment

The environment-neutral Web runtime kernel is the only implementation of composition mounting, local
command adaptation, component scoping, bridge clients, notifications, and cleanup. The compiler bundles
that source into a generated TypeScript module. Production bootstrap is limited to transport, verified
release loading, kernel start, and disposal; vertical tests execute the generated production bundle.

Every component factory starts in a child mount scope. A valid returned element merges the child into
the application scope. A throw or invalid return disposes only the child. Once native persistence
commits a transition, the runtime must return its terminal result even if refresh or a listener fails;
such failures enter recovery state and listeners are isolated from one another.

Host Application connects one verified Game Composition to the existing Host Bridge Envelope.
It corrects the private pre-release payloads in place. Host API 1.0 remains the local core and Host
API 1.1 remains the shared-play extension; this feature introduces no new Host API minor, message-name
generation, payload discriminator, or compatibility path.

## Ownership

The native player owns artifact verification, installed runs, persistence, observations, capabilities,
shared credentials, synchronization, and the WebView lifecycle. The compiler-generated runtime adapter
owns executable model selection and translates between Host API and the runtime. Release
application code receives only its DOM root and compiler-generated component factories.

```ts
interface GameApplicationContext {
  readonly root: HTMLElement;
  readonly components: Readonly<Record<string, ScopedComponentFactory>>;
}

interface GameApplicationHandle {
  unmount(): void | Promise<void>;
}
```

`GameApplicationContext` deliberately has no run, release, aggregate, bootstrap, persistence, shared,
content, asset, or capability fields. The application composes presentation; it cannot read a raw or
stale bootstrap snapshot. State and host dependencies are available only inside declared component
contexts.

## Runtime Bootstrap

The existing `runtime.ready` request receives `runtime.bootstrap`. Both use the centrally negotiated
Host Bridge Envelope and their existing direction; the bootstrap payload does not repeat a version.
The bootstrap is consumed by the generated runtime adapter before the application mounts.

```ts
interface RuntimeBootstrap {
  readonly runId: string;
  readonly releaseId: `sha256:${string}`;
  readonly aggregate: LocalAggregateView;
}

interface LocalAggregateView {
  readonly modelId: string;
  readonly aggregateId: string;
  readonly aggregateKind: "player";
  readonly schemaId: string;
  readonly stateVersion: number;
  readonly state: object;
  readonly progression?: ProgressionInstance;
}
```

The host verifies release/catalog/registry agreement before sending bootstrap and validates the durable
aggregate against the selected executable model. The adapter retains the current committed view,
constructs scoped contexts, and mounts the application only after bootstrap succeeds. Later committed
changes update the adapter and notify subscribed components; they do not remount or mutate the original
application context.

## Scoped Component Context

```ts
interface ComponentContext {
  readonly lifecycle: {
    defer(cleanup: ComponentCleanup): void;
  };
  readonly local: {
    getView(): Promise<LocalAggregateView>;
    onChanged(listener: () => void): () => void;
    readonly commands: Readonly<Record<string, LocalCommandInvoker>>;
  };
  readonly shared?: {
    getView(): Promise<SharedPlayView>;
    onSyncChanged(listener: () => void): () => void;
    readonly commands: Readonly<Record<string, SharedCommandInvoker>>;
  };
  readonly content: Readonly<Record<string, ResolvedContent>>;
  readonly assets: Readonly<Record<string, ResolvedAsset>>;
  readonly capabilities: Readonly<Record<string, CapabilityClient>>;
}

interface LocalCommandInvoker {
  execute(input: {
    readonly commandId: string;
    readonly payload: object;
    readonly observations?: readonly HostObservationReference[];
  }): Promise<LocalCommandResult>;
}

type ComponentCleanup = () => void | Promise<void>;
type ComponentImplementation = (context: ComponentContext) => HTMLElement;
type ScopedComponentFactory = () => HTMLElement;
```

Each map contains exactly the IDs declared for that component. `local.getView` is a pure read and
`local.onChanged` fires only after a transition transaction commits. `shared` exists only when the
component declares the trusted projection schema and the run has an exact immutable session binding.
Its commands are the component's declared trusted commands. Attempting another ID fails before a host
operation.

`lifecycle.defer` accepts cleanup while the factory mounts and never exposes disposal authority back to
the application. The player-owned mount scope invokes registered cleanup once in reverse order after a
component/application throw, invalid element/handle, unmount, remount, or disposal. It attempts all
remaining cleanup after one fails and surfaces a stable lifecycle diagnostic.

## Local Transition

The existing `transition.commit` request receives `transition.result`; both retain their current names
and envelope version. The generated local command invoker already knows the model, command type, schema,
and target. Authors do not construct protocol candidates or select models by string.

```ts
interface TransitionCandidateBase {
  readonly commandId: string;
  readonly modelId: string;
  readonly commandType: string;
  readonly payload: object;
  readonly target: {
    readonly aggregateId: string;
    readonly aggregateKind: "player";
    readonly schemaId: string;
  };
  readonly expectedStateVersion: number;
  readonly observationIds: readonly string[];
}

type TransitionCandidate =
  | (TransitionCandidateBase & {
      readonly terminal: "accepted";
      readonly nextState?: object;
      readonly nextProgression?: ProgressionInstance;
      readonly outcome: object;
      readonly domainEvents: readonly TypedRecord[];
      readonly effectIntents: readonly TypedRecord[];
      readonly progressionTrace: readonly ProgressionTransitionRecord[];
    })
  | (TransitionCandidateBase & {
      readonly terminal: "no-op" | "rejected";
      readonly outcome: object;
    })
  | (TransitionCandidateBase & {
      readonly terminal: "invalid";
      readonly phase: "execution";
      readonly diagnosticCodes: readonly string[];
      readonly attemptedProgressionTrace: readonly ProgressionTransitionRecord[];
    });

interface TransitionResultBase {
  readonly commandId: string;
  readonly disposition: "committed" | "duplicate";
  readonly resultingStateVersion: number;
}

type TransitionResult =
  | (TransitionResultBase & {
      readonly terminal: "accepted" | "no-op" | "rejected";
      readonly outcome: object;
    })
  | (TransitionResultBase & {
      readonly terminal: "invalid";
      readonly phase: "execution";
      readonly diagnosticCodes: readonly string[];
    });

interface LocalPreflightInvalidResult {
  readonly commandId: string;
  readonly disposition: "not-recorded";
  readonly terminal: "invalid";
  readonly phase: "preflight";
  readonly diagnosticCodes: readonly string[];
}

type LocalCommandResult = TransitionResult | LocalPreflightInvalidResult;
```

The host validates the closed candidate shape, registered model/command/target/schema agreement,
canonical payload and outputs, observation ownership, expected durable state version, and terminal
semantics. Accepted must include a state/progression change or an event/effect and commits
`expectedStateVersion + 1`. No-op, rejected, and execution-invalid preserve the expected state version.

One SQLite transaction records the terminal, outcome or diagnostics, observation links, and any
accepted state/progression/events/effects/trace. Duplicate command ID plus byte-equivalent canonical
candidate returns the original result; changed reuse fails. Effect intents remain evidence only.

Preflight invalidity never becomes a transition candidate, never crosses the bridge, consumes no
observation, and performs no durable mutation. After a recorded command promise resolves, a component
may read the new committed local view; candidate state is never exposed early.

## Shared Surface and Correlation

The native join surface derives only from verified Game Composition:

- no trusted mechanic: no shared controls, client, or shared persistence activation;
- trusted mechanic without binding: generic join controls outside the WebView;
- exact binding: declared components receive scoped Shared Play;
- conflicting or recovery-required binding: no projection is exposed and the native shell shows a
  generic recovery diagnostic.

No branch checks a game, component, command, content, or schema-specific ID.

A closed envelope with a valid request ID returns that same ID on success or `host.error`, including
unsupported type/version, missing session, undeclared dependency, stale state version, schema failure,
or handler failure. Only invalid JSON or an absent/invalid request ID may use `requestId: "unknown"`.

## Clean Break

The player recognizes one corrected payload shape for each existing message. It does not switch on
release age, guess from payload fields, retain old bootstrap/transition interfaces, or expose a report
reader for obsolete shapes. Reference releases are recompiled. An incompatible SQLite schema fails
startup with explicit reset/reinstall guidance and is never silently dropped or migrated.
