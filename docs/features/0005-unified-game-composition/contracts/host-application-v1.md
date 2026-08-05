# Contract: Host Application V1

Host Application V1 connects one verified Game Composition V1 to the existing Host Bridge Envelope V1.
It corrects the private pre-release V1 payloads in place. Host API 1.0 remains the local core and Host
API 1.1 remains the shared-play extension; this feature introduces no new Host API minor, message-name
generation, payload discriminator, or compatibility path.

## Ownership

The native player owns artifact verification, installed runs, persistence, observations, capabilities,
shared credentials, synchronization, and the WebView lifecycle. The compiler-generated runtime adapter
owns executable model selection and translates between Host API V1 and the unversioned runtime. Release
application code receives only its DOM root and compiler-generated component factories.

```ts
interface GameApplicationContextV1 {
  readonly root: HTMLElement;
  readonly components: Readonly<Record<string, ScopedComponentFactoryV1>>;
}

interface GameApplicationHandleV1 {
  unmount(): void | Promise<void>;
}
```

`GameApplicationContextV1` deliberately has no run, release, aggregate, bootstrap, persistence, shared,
content, asset, or capability fields. The application composes presentation; it cannot read a raw or
stale bootstrap snapshot. State and host dependencies are available only inside declared component
contexts.

## Runtime Bootstrap V1

The existing `runtime.ready` request receives `runtime.bootstrap`. Both use Host Bridge Envelope V1
with envelope `version: 1` and their existing direction. The bootstrap is consumed by the generated
runtime adapter before the application mounts.

```ts
interface RuntimeBootstrapV1 {
  readonly version: 1;
  readonly runId: string;
  readonly releaseId: `sha256:${string}`;
  readonly aggregate: LocalAggregateViewV1;
}

interface LocalAggregateViewV1 {
  readonly modelId: string;
  readonly aggregateId: string;
  readonly aggregateKind: "player";
  readonly schemaId: string;
  readonly schemaVersion: number;
  readonly stateVersion: number;
  readonly state: object;
  readonly progression?: ProgressionInstanceV1;
}
```

The host verifies release/catalog/registry agreement before sending bootstrap and validates the durable
aggregate against the selected executable model. The adapter retains the current committed view,
constructs scoped contexts, and mounts the application only after bootstrap succeeds. Later committed
changes update the adapter and notify subscribed components; they do not remount or mutate the original
application context.

## Scoped Component Context

```ts
interface ComponentContextV1 {
  readonly lifecycle: {
    defer(cleanup: ComponentCleanupV1): void;
  };
  readonly local: {
    getView(): Promise<LocalAggregateViewV1>;
    onChanged(listener: () => void): () => void;
    readonly commands: Readonly<Record<string, LocalCommandInvokerV1>>;
  };
  readonly shared?: {
    getView(): Promise<SharedPlayViewV1>;
    onSyncChanged(listener: () => void): () => void;
    readonly commands: Readonly<Record<string, SharedCommandInvokerV1>>;
  };
  readonly content: Readonly<Record<string, ResolvedContentV1>>;
  readonly assets: Readonly<Record<string, ResolvedAssetV1>>;
  readonly capabilities: Readonly<Record<string, CapabilityClientV1>>;
}

interface LocalCommandInvokerV1 {
  execute(input: {
    readonly commandId: string;
    readonly payload: object;
    readonly observations?: readonly HostObservationReferenceV1[];
  }): Promise<LocalCommandResultV1>;
}

type ComponentCleanupV1 = () => void | Promise<void>;
type ComponentImplementationV1 = (context: ComponentContextV1) => HTMLElement;
type ScopedComponentFactoryV1 = () => HTMLElement;
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

## Local Transition V1

The existing `transition.commit` request receives `transition.result`; both retain their current names
and envelope version. The generated local command invoker already knows the model, command type, schema,
and target. Authors do not construct protocol candidates or select models by string.

```ts
interface TransitionCandidateBaseV1 {
  readonly version: 1;
  readonly commandId: string;
  readonly modelId: string;
  readonly commandType: string;
  readonly payload: object;
  readonly target: {
    readonly aggregateId: string;
    readonly aggregateKind: "player";
    readonly schemaId: string;
    readonly schemaVersion: number;
  };
  readonly expectedStateVersion: number;
  readonly observationIds: readonly string[];
}

type TransitionCandidateV1 =
  | (TransitionCandidateBaseV1 & {
      readonly terminal: "accepted";
      readonly nextState?: object;
      readonly nextProgression?: ProgressionInstanceV1;
      readonly outcome: object;
      readonly domainEvents: readonly TypedRecordV1[];
      readonly effectIntents: readonly TypedRecordV1[];
      readonly progressionTrace: readonly ProgressionTransitionRecordV1[];
    })
  | (TransitionCandidateBaseV1 & {
      readonly terminal: "no-op" | "rejected";
      readonly outcome: object;
    })
  | (TransitionCandidateBaseV1 & {
      readonly terminal: "invalid";
      readonly phase: "execution";
      readonly diagnosticCodes: readonly string[];
      readonly attemptedProgressionTrace: readonly ProgressionTransitionRecordV1[];
    });

interface TransitionResultBaseV1 {
  readonly version: 1;
  readonly commandId: string;
  readonly disposition: "committed" | "duplicate";
  readonly resultingStateVersion: number;
}

type TransitionResultV1 =
  | (TransitionResultBaseV1 & {
      readonly terminal: "accepted" | "no-op" | "rejected";
      readonly outcome: object;
    })
  | (TransitionResultBaseV1 & {
      readonly terminal: "invalid";
      readonly phase: "execution";
      readonly diagnosticCodes: readonly string[];
    });

interface LocalPreflightInvalidResultV1 {
  readonly version: 1;
  readonly commandId: string;
  readonly disposition: "not-recorded";
  readonly terminal: "invalid";
  readonly phase: "preflight";
  readonly diagnosticCodes: readonly string[];
}

type LocalCommandResultV1 = TransitionResultV1 | LocalPreflightInvalidResultV1;
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

The native join surface derives only from verified Game Composition V1:

- no trusted mechanic: no shared controls, client, or shared persistence activation;
- trusted mechanic without binding: generic join controls outside the WebView;
- exact binding: declared components receive scoped Shared Play V1;
- conflicting or recovery-required binding: no projection is exposed and the native shell shows a
  generic recovery diagnostic.

No branch checks a game, component, command, content, or schema-specific ID.

A closed envelope with a valid request ID returns that same ID on success or `host.error`, including
unsupported type/version, missing session, undeclared dependency, stale state version, schema failure,
or handler failure. Only invalid JSON or an absent/invalid request ID may use `requestId: "unknown"`.

## Clean Break

The player recognizes one corrected V1 payload shape for each existing message. It does not switch on
release age, guess from payload fields, retain old bootstrap/transition interfaces, or expose a report
reader for obsolete shapes. Reference releases are recompiled. An incompatible SQLite schema fails
startup with explicit reset/reinstall guidance and is never silently dropped or migrated.
