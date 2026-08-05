import { CONTRACT_VERSIONS } from "../contract-versions.js";
import type { CanonicalJsonObject } from "../release/types.js";
import type { LocationObservation } from "../player/report.js";

export type SharedAggregateKind = "player" | "team" | "session";
export type SharedTerminal = "accepted" | "no-op" | "rejected" | "invalid";
export type SharedActionTerminal = SharedTerminal | "pending" | "blocked-revoked";

export interface SharedAggregateTarget {
  readonly aggregateKind: SharedAggregateKind;
  readonly aggregateId: string;
  readonly schemaId: string;
  readonly schemaVersion: number;
}

export interface SharedCommandIntent {
  readonly commandId: string;
  readonly target: SharedAggregateTarget;
  readonly expectedStateVersion: number;
  readonly type: string;
  readonly payload: CanonicalJsonObject;
  readonly observationIds: readonly string[];
}

export interface SharedProjection {
  readonly aggregateKind: SharedAggregateKind;
  readonly aggregateId: string;
  readonly schemaId: string;
  readonly schemaVersion: number;
  readonly stateVersion: number;
  readonly value: CanonicalJsonObject;
}

export interface SharedCommandStatus {
  readonly commandId: string;
  readonly disposition: "queued" | "duplicate-pending" | "already-terminal";
  readonly terminal: SharedActionTerminal;
  readonly outcomeCode?: string;
  readonly resultingStateVersion?: number;
}

export interface SharedPlayView {
  readonly sessionId: string;
  readonly releaseId: `sha256:${string}`;
  readonly transport: "offline" | "connecting" | "online" | "degraded";
  readonly synchronization: "current" | "syncing" | "recovery-required" | "revoked";
  readonly confirmedAt: string | null;
  readonly membership: {
    readonly status: "active" | "revoked";
    readonly teamId: string;
  };
  readonly projections: readonly SharedProjection[];
  readonly actions: readonly SharedCommandStatus[];
}

export interface SyncCommand {
  readonly version: typeof CONTRACT_VERSIONS.sharedSync;
  readonly commandId: string;
  readonly target: SharedAggregateTarget;
  readonly expectedStateVersion: number;
  readonly type: string;
  readonly payload: CanonicalJsonObject;
  readonly observations: readonly LocationObservation[];
}

export interface SyncCommandResult {
  readonly version: typeof CONTRACT_VERSIONS.sharedSync;
  readonly commandId: string;
  readonly disposition: "decided" | "duplicate";
  readonly terminal: SharedTerminal;
  readonly outcomeCode: string;
  readonly resultingStateVersion: number;
  readonly decisionPosition: string;
}

export interface AuthorizedSnapshot {
  readonly version: typeof CONTRACT_VERSIONS.sharedSync;
  readonly sessionId: string;
  readonly releaseId: `sha256:${string}`;
  readonly participantId: string;
  readonly teamId: string;
  readonly membershipStatus: "active" | "revoked";
  readonly confirmedAt: string;
  readonly projections: readonly SharedProjection[];
}

export interface SyncPull {
  readonly version: typeof CONTRACT_VERSIONS.sharedSync;
  readonly kind: "snapshot";
  readonly reset: boolean;
  readonly nextCursor: string;
  readonly snapshot: AuthorizedSnapshot;
  readonly commandResults: readonly SyncCommandResult[];
}

export interface SharedPlayTransport {
  send(
    type: "shared.view.get" | "shared.command.enqueue",
    payload: CanonicalJsonObject,
  ): Promise<unknown>;
  subscribe(type: "shared.sync.changed", listener: () => void): () => void;
}

export interface SharedPlayClient {
  getView(): Promise<SharedPlayView>;
  enqueueCommand(command: SharedCommandIntent): Promise<SharedCommandStatus>;
  onSyncChanged(listener: () => void): () => void;
}
