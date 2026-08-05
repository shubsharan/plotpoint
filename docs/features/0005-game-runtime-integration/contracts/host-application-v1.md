# Contract: Host API 1.2 Game Application Extension

Host API 1.2 preserves all Host API 1.0 and 1.1 message meanings and adds the generated application
composition lifecycle plus Local Transition V2. Release code continues to use semantic clients from
`@plotpoint/protocol/player`; raw bridge send/type construction is not release-facing API.

## Runtime Bootstrap V2

```ts
interface RuntimeBootstrapV2 {
  readonly version: 2;
  readonly runId: string;
  readonly releaseId: `sha256:${string}`;
  readonly localAggregate: {
    readonly modelId: string;
    readonly aggregateId: string;
    readonly aggregateKind: "player";
    readonly schemaId: string;
    readonly schemaVersion: number;
    readonly revision: number;
    readonly state: object;
    readonly progression?: ProgressionInstanceV2;
  };
  readonly shared: { readonly declared: boolean; readonly bound: boolean };
}
```

`shared.declared` is derived from the optional Game Composition V1 trusted mechanic. `shared.bound` is
true only after an immutable release-matching session binding exists for this run. The bootstrap carries
no credential, invitation, service URL, cursor, raw artifact path, or compiler-private detail.

Host API 1.2 mounts only after the release's required local player aggregate is initialized or recovered;
initialization failure prevents application mount rather than encoding a partially usable `null` state.

## Application Context

```ts
interface GameApplicationContextV1 {
  readonly root: HTMLElement;
  readonly bootstrap: RuntimeBootstrapV2;
  readonly components: Readonly<Record<string, ScopedComponentFactoryV1>>;
}
```

The application is intentionally component-only: it can mount selected pre-scoped factories but cannot
name commands, resources, assets, capabilities, or raw host operations itself. Before a shared binding,
the native player may display its generic join surface above the trusted WebView. After an exact durable
join, the player awaits the current application's `unmount()` exactly once, disposes its player-owned
mount scope, clears its root, and mounts the application from recovered state so components receive
their declared shared context. A failed unmount still rolls back the scope and root, prevents the
replacement mount, and surfaces a stable lifecycle error. Invitation and credential handling never
moves into release code.

Each mount gets a player-owned cleanup scope hidden behind its generated component factories. A
component registers cleanup callbacks through that scope at resource-acquisition time; supported host
capability allocations register automatically. The factory returns only the mounted element, never
cleanup authority, to application code. On a component or application throw, an invalid component
element, or an invalid `GameApplicationHandleV1`, the player invokes every registered cleanup once in
reverse registration order, clears any partial root, exposes no playable state, and returns a stable
lifecycle error.
Compiler inspection validates only the static definition shape; this runtime rollback is the honest
executable boundary.

## Scoped Component Context

```ts
interface ComponentContextV1 {
  readonly lifecycle: {
    defer(cleanup: ComponentCleanupV1): void;
  };
  readonly local: {
    getView(): Promise<LocalAggregateViewV2>;
    onChanged(listener: () => void): () => void;
    readonly commands: Readonly<Record<string, LocalCommandInvokerV2>>;
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

interface LocalAggregateViewV2 {
  readonly modelId: string;
  readonly aggregateId: string;
  readonly schemaId: string;
  readonly schemaVersion: number;
  readonly revision: number;
  readonly state: object;
  readonly progression?: ProgressionInstanceV2;
}

interface LocalCommandInvokerV2 {
  execute(input: {
    readonly commandId: string;
    readonly payload: object;
    readonly observations?: readonly HostObservationReferenceV1[];
  }): Promise<LocalCommandResultV2>;
}

type ComponentCleanupV1 = () => void | Promise<void>;

type ComponentImplementationV1 = (context: ComponentContextV1) => HTMLElement;

type ScopedComponentFactoryV1 = () => HTMLElement;
```

Every command/resource/capability map contains exactly the IDs declared for that component. The local
view is the one release-required player aggregate, and its read is pure; `onChanged` fires only after a
durable local transition commits. `shared` exists only when the component
declares the trusted mechanic's projection schema ID/version and the current run has an exact durable
binding; its command map contains only that component's declared trusted commands. Resolving another ID
fails before a host operation. Release-wide Host API checks still verify that commands and capabilities
belong to the verified composition. The shared trusted realm means this is the supported composition
contract, not hostile isolation between components.

`lifecycle.defer` accepts callbacks only while the component factory is mounting and never exposes the
registered callback again. A component uses it in the same expression that acquires a release-owned
subscription; host-owned capability resources register internally before acquisition returns. If the
component throws later, those callbacks already belong to the scope. Ambient side effects that bypass
the supported context remain outside this trusted-code composition guarantee.

The application handle owns only application-created cleanup. After calling it, the player scope invokes
every registered component cleanup exactly once in reverse registration order, even when application or
one component cleanup fails; it attempts the remaining callbacks and surfaces a stable lifecycle error.
This keeps subscriptions and capability clients inside an enforceable rollback boundary instead of
leaking them across a failed mount or shared-session remount.

Each generated local command invoker already knows its model, registration ID, command type, and
schemas. It runs Runtime Model V2. A preflight invalid result returns locally and never crosses the
bridge; every recorded terminal maps to Local Transition Candidate V2, commits through the host, and
returns the exact durable result. Authors do not construct transition candidates or select models by
string.

## Additive Bridge Messages

Host API 1.2 adds exact message types inside the unchanged Host Bridge Envelope V1:

| WebView request        | Host response          | Payload contract                                          |
| ---------------------- | ---------------------- | --------------------------------------------------------- |
| `runtime.ready.v2`     | `runtime.bootstrap.v2` | `{}` -> `RuntimeBootstrapV2`                              |
| `transition.commit.v2` | `transition.result.v2` | `LocalTransitionCandidateV2` -> `LocalTransitionResultV2` |

A release requiring Host API 1.2 uses only these V2 lifecycle/transition messages. Existing Host API
1.0 releases retain `runtime.ready`, `runtime.bootstrap`, `transition.commit`, and `transition.result`
with their exact V1 meanings; the player selects the path from the verified release requirement and
never guesses from payload shape.

## Local Transition Candidate V2

```ts
interface LocalTransitionBaseV2 {
  readonly version: 2;
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
  readonly expectedRevision: number;
  readonly observationIds: readonly string[];
}

type LocalTransitionCandidateV2 =
  | (LocalTransitionBaseV2 & {
      readonly terminal: "accepted";
      readonly nextState: object;
      readonly nextProgression?: ProgressionInstanceV2;
      readonly outcome: object;
      readonly domainEvents: readonly TypedRecord[];
      readonly effectIntents: readonly TypedRecord[];
      readonly progressionTrace: readonly ProgressionTransitionV2[];
    })
  | (LocalTransitionBaseV2 & {
      readonly terminal: "no-op" | "rejected";
      readonly outcome: object;
    })
  | (LocalTransitionBaseV2 & {
      readonly terminal: "invalid";
      readonly phase: "execution";
      readonly diagnosticCodes: readonly string[];
      readonly attemptedProgressionTrace: readonly ProgressionTransitionV2[];
    });

interface LocalTransitionResultBaseV2 {
  readonly version: 2;
  readonly commandId: string;
  readonly disposition: "committed" | "duplicate";
  readonly resultingRevision: number;
}

type LocalTransitionResultV2 =
  | (LocalTransitionResultBaseV2 & {
      readonly terminal: "accepted" | "no-op" | "rejected";
      readonly outcome: object;
    })
  | (LocalTransitionResultBaseV2 & {
      readonly terminal: "invalid";
      readonly phase: "execution";
      readonly diagnosticCodes: readonly string[];
    });

interface LocalPreflightInvalidResultV2 {
  readonly version: 2;
  readonly commandId: string;
  readonly disposition: "not-recorded";
  readonly terminal: "invalid";
  readonly phase: "preflight";
  readonly diagnosticCodes: readonly string[];
}

type LocalCommandResultV2 = LocalTransitionResultV2 | LocalPreflightInvalidResultV2;
```

The host validates exact closed shape, registered command/model/target/schema/revision agreement,
payload and output schemas, canonical values, declared observation ownership, and terminal semantics.
An accepted candidate must contain a state/progression change or at least one event/effect; it advances
the aggregate revision exactly once. Other recorded terminals preserve the revision. Result variants
are exact: accepted/no-op/rejected carry outcome, while execution-invalid carries diagnostics.

One SQLite transaction stores the terminal-specific outcome or diagnostics in the receipt plus
observation links for every recorded terminal. Accepted results also store the next state/progression
snapshot, journal outcome/events/effects/progression trace, and resulting revision. Recorded execution
invalidity stores its diagnostics and attempted progression trace. Effect intents are retained for
evidence but never delivered by this feature. Duplicate command ID plus exact candidate returns the
original result; changed reuse fails.
Preflight invalidity has no execution record or transition candidate, returns `not-recorded` directly
from the local invoker, and never consumes observations or mutates host persistence.
After any recorded command promise resolves, the component may read the new durable local view; no
candidate state becomes visible before host commit.

## Shared Join Surface

The player derives join-surface visibility only from verified Game Composition V1:

- no trusted mechanic: no shared controls, client, or shared persistence activation;
- trusted mechanic and no binding: generic “Join shared session” native controls;
- exact binding: no join controls; a remounted declared component receives scoped Shared Play V1;
- conflicting or recovery-required binding: no projection is exposed; the native shell presents a
  generic recovery diagnostic.

No condition checks a game, hunt, component, command, or schema-specific ID.

## Bridge Errors and Correlation

A closed envelope with a valid request ID always receives that same request ID on success or
`host.error`, including unsupported type/version, missing session, undeclared dependency, stale
revision, schema failure, and handler errors. Only invalid JSON or an absent/invalid request ID may use
`requestId: "unknown"`.
