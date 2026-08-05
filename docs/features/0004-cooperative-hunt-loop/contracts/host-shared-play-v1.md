# Contract: Host API 1.1 Shared Play Extension

Host API 1.0 remains exact and unchanged. Host API 1.1 adds game-neutral shared play. Release code
never receives HTTP envelopes, bearer credentials, SQLite identities, observations belonging to
another run, or synchronization cursors.

```ts
interface SharedPlayClientV1 {
  getView(): Promise<SharedPlayViewV1>;
  enqueueCommand(command: SharedCommandIntentV1): Promise<SharedCommandStatusV1>;
  onSyncChanged(listener: () => void): () => void;
}

interface SharedCommandIntentV1 {
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

interface SharedProjectionV1 {
  readonly aggregateKind: "player" | "team" | "session";
  readonly aggregateId: string;
  readonly schemaId: string;
  readonly schemaVersion: number;
  readonly stateVersion: number;
  readonly value: object;
}

interface SharedCommandStatusV1 {
  readonly commandId: string;
  readonly disposition: "queued" | "duplicate-pending" | "already-terminal";
  readonly terminal: "pending" | "accepted" | "no-op" | "rejected" | "invalid" | "blocked-revoked";
  readonly outcomeCode?: string;
  readonly resultingStateVersion?: number;
}

interface SharedPlayViewV1 {
  readonly sessionId: string;
  readonly releaseId: `sha256:${string}`;
  readonly transport: "offline" | "connecting" | "online" | "degraded";
  readonly synchronization: "current" | "syncing" | "recovery-required" | "revoked";
  readonly confirmedAt: string | null;
  readonly membership: { readonly status: "active" | "revoked"; readonly teamId: string };
  readonly projections: readonly SharedProjectionV1[];
  readonly actions: readonly SharedCommandStatusV1[];
}
```

`enqueueCommand` succeeds only after the host commits a new outbox row or reads the existing durable
row. The host resolves every observation ID against the current run before network submission. The
command type, payload, and projection values are canonical JSON validated by the release/module schema;
the host API contains no hunt-specific fields.

Bridge messages are `shared.view.get`, `shared.command.enqueue`, and no-data notification
`shared.sync.changed`. Unknown fields, unsupported versions, wrong directions, invalid observation
ownership, or noncanonical values fail without changing SQLite.
