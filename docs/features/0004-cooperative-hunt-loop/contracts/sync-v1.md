# Contract: Authoritative Synchronization V1

Sync V1 is an internal native-host-to-service contract. Objects are closed canonical JSON. Participant
and session identity come from the authenticated route; release code never receives these envelopes.

```ts
interface SyncCommandV1 {
  readonly version: 1;
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
  readonly observations: readonly LocationObservationV1[];
}

interface SyncCommandResultV1 {
  readonly version: 1;
  readonly commandId: string;
  readonly disposition: "decided" | "duplicate";
  readonly terminal: "accepted" | "no-op" | "rejected" | "invalid";
  readonly outcomeCode: string;
  readonly resultingStateVersion: number;
  readonly decisionPosition: string;
}

interface AuthorizedSnapshotV1 {
  readonly version: 1;
  readonly sessionId: string;
  readonly releaseId: `sha256:${string}`;
  readonly participantId: string;
  readonly teamId: string;
  readonly membershipStatus: "active" | "revoked";
  readonly confirmedAt: string;
  readonly projections: readonly SharedProjectionV1[];
}

interface SyncPullV1 {
  readonly version: 1;
  readonly kind: "snapshot";
  readonly reset: boolean;
  readonly nextCursor: string;
  readonly snapshot: AuthorizedSnapshotV1;
  readonly commandResults: readonly SyncCommandResultV1[];
}
```

The host constructs `observations` only from persisted observation IDs named by the release intent.
Raw observations contribute to the command request digest but are not retained in receipts, journals,
projections, logs, or reports.

Each pull uses one PostgreSQL statement snapshot: it selects a decision-position high-water mark, the
current complete authorized projection, and only the authenticated participant's terminal results
after the supplied cursor up to that high-water mark. Unknown, malformed, or ahead cursors set
`reset: true` and return the complete retained result set. The player commits snapshot replacement,
terminal-result upserts, and cursor advancement in one SQLite transaction while preserving its outbox.
