# Contract: Host API Shared Play Extension

The local Host API core remains exact and unchanged. The extension adds game-neutral shared play. Release code
never receives HTTP envelopes, bearer credentials, SQLite identities, observations belonging to
another run, or synchronization cursors.

```ts
interface SharedPlayClient {
  getView(): Promise<SharedPlayView>;
  enqueueCommand(command: SharedCommandIntent): Promise<SharedCommandStatus>;
  onSyncChanged(listener: () => void): () => void;
}

interface SharedCommandIntent {
  readonly commandId: string;
  readonly target: {
    readonly aggregateKind: "player" | "team" | "session";
    readonly aggregateId: string;
    readonly schemaId: string;
    readonly schemaVersion: number;
  };
  readonly expectedStateVersion: number;
  readonly type: string;
  readonly payload: object;
  readonly observationIds: readonly string[];
}

interface SharedProjection {
  readonly aggregateKind: "player" | "team" | "session";
  readonly aggregateId: string;
  readonly schemaId: string;
  readonly schemaVersion: number;
  readonly stateVersion: number;
  readonly value: object;
}

interface SharedCommandStatus {
  readonly commandId: string;
  readonly disposition: "queued" | "duplicate-pending" | "already-terminal";
  readonly terminal: "pending" | "accepted" | "no-op" | "rejected" | "invalid" | "blocked-revoked";
  readonly outcomeCode?: string;
  readonly resultingStateVersion?: number;
}

interface SharedPlayView {
  readonly sessionId: string;
  readonly releaseId: `sha256:${string}`;
  readonly transport: "offline" | "connecting" | "online" | "degraded";
  readonly synchronization: "current" | "syncing" | "recovery-required" | "revoked";
  readonly confirmedAt: string | null;
  readonly membership: { readonly status: "active" | "revoked"; readonly teamId: string };
  readonly projections: readonly SharedProjection[];
  readonly actions: readonly SharedCommandStatus[];
}
```

`enqueueCommand` succeeds only after the host commits a new outbox row or reads the existing durable
row. The host resolves every observation ID against the current run before network submission. The
command type, payload, and projection values are canonical JSON validated by the release/module schema;
the host API contains no hunt-specific fields.

Bridge messages are `shared.view.get`, `shared.command.enqueue`, and no-data notification
`shared.sync.changed`. Unknown fields, unsupported versions, wrong directions, invalid observation
ownership, or noncanonical values fail without changing SQLite.
