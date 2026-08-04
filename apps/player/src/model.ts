import type { CanonicalJsonObject, ReleaseId } from "@plotpoint/protocol";

export interface InstalledReleaseRecord {
  readonly releaseId: ReleaseId;
  readonly artifactUri: string;
  readonly manifestJson: string;
  readonly installedAt: string;
}

export interface RunRecord {
  readonly runId: string;
  readonly releaseId: ReleaseId;
  readonly startedAt: string;
  readonly status: "active" | "completed" | "invalid";
}

export interface SnapshotRecord {
  readonly runId: string;
  readonly aggregateId: string;
  readonly aggregateKind: "player";
  readonly schemaId: string;
  readonly schemaVersion: number;
  readonly stateVersion: number;
  readonly state: CanonicalJsonObject;
  readonly journalPosition: number;
}

export interface CandidateTransition {
  readonly commandId: string;
  readonly aggregateId: string;
  readonly aggregateKind: "player";
  readonly schemaId: string;
  readonly schemaVersion: number;
  readonly expectedVersion: number;
  readonly commandOutcome: "accepted" | "rejected";
  readonly outcome: CanonicalJsonObject;
  readonly nextState: CanonicalJsonObject;
  readonly progressionChanges: readonly string[];
  readonly observationIds: readonly string[];
}

export interface DurableTransitionResult {
  readonly kind: "accepted" | "duplicate" | "invalid" | "stale";
  readonly commandId: string;
  readonly commandOutcome?: "accepted" | "rejected";
  readonly resultingVersion?: number;
  readonly code?: string;
}
