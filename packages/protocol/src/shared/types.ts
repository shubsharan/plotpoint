import type { CanonicalJsonObject } from "../release/types.js";
import type { LocationObservationV1 } from "../player/report.js";

export type SharedAggregateKindV1 = "player" | "team" | "session";
export type SharedTerminalV1 = "accepted" | "no-op" | "rejected" | "invalid";
export type SharedActionTerminalV1 = SharedTerminalV1 | "pending" | "blocked-revoked";

export interface SharedAggregateTargetV1 {
  readonly aggregateKind: SharedAggregateKindV1;
  readonly aggregateId: string;
  readonly schemaId: string;
  readonly schemaVersion: number;
}

export interface SharedCommandIntentV1 {
  readonly commandId: string;
  readonly target: SharedAggregateTargetV1;
  readonly expectedStateVersion: number;
  readonly type: string;
  readonly payload: CanonicalJsonObject;
  readonly observationIds: readonly string[];
}

export interface SharedProjectionV1 {
  readonly aggregateKind: SharedAggregateKindV1;
  readonly aggregateId: string;
  readonly schemaId: string;
  readonly schemaVersion: number;
  readonly stateVersion: number;
  readonly value: CanonicalJsonObject;
}

export interface SharedCommandStatusV1 {
  readonly commandId: string;
  readonly disposition: "queued" | "duplicate-pending" | "already-terminal";
  readonly terminal: SharedActionTerminalV1;
  readonly outcomeCode?: string;
  readonly resultingStateVersion?: number;
}

export interface SharedPlayViewV1 {
  readonly sessionId: string;
  readonly releaseId: `sha256:${string}`;
  readonly transport: "offline" | "connecting" | "online" | "degraded";
  readonly synchronization: "current" | "syncing" | "recovery-required" | "revoked";
  readonly confirmedAt: string | null;
  readonly membership: {
    readonly status: "active" | "revoked";
    readonly teamId: string;
  };
  readonly projections: readonly SharedProjectionV1[];
  readonly actions: readonly SharedCommandStatusV1[];
}

export interface SyncCommandV1 {
  readonly version: 1;
  readonly commandId: string;
  readonly target: SharedAggregateTargetV1;
  readonly expectedStateVersion: number;
  readonly type: string;
  readonly payload: CanonicalJsonObject;
  readonly observations: readonly LocationObservationV1[];
}

export interface SyncCommandResultV1 {
  readonly version: 1;
  readonly commandId: string;
  readonly disposition: "decided" | "duplicate";
  readonly terminal: SharedTerminalV1;
  readonly outcomeCode: string;
  readonly resultingStateVersion: number;
  readonly decisionPosition: string;
}

export interface AuthorizedSnapshotV1 {
  readonly version: 1;
  readonly sessionId: string;
  readonly releaseId: `sha256:${string}`;
  readonly participantId: string;
  readonly teamId: string;
  readonly membershipStatus: "active" | "revoked";
  readonly confirmedAt: string;
  readonly projections: readonly SharedProjectionV1[];
}

export interface SyncPullV1 {
  readonly version: 1;
  readonly kind: "snapshot";
  readonly reset: boolean;
  readonly nextCursor: string;
  readonly snapshot: AuthorizedSnapshotV1;
  readonly commandResults: readonly SyncCommandResultV1[];
}

export interface SharedPlayTransportV1 {
  send(
    type: "shared.view.get" | "shared.command.enqueue",
    payload: CanonicalJsonObject,
  ): Promise<unknown>;
  subscribe(type: "shared.sync.changed", listener: () => void): () => void;
}

export interface SharedPlayClientV1 {
  getView(): Promise<SharedPlayViewV1>;
  enqueueCommand(command: SharedCommandIntentV1): Promise<SharedCommandStatusV1>;
  onSyncChanged(listener: () => void): () => void;
}
