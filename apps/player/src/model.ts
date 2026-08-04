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

interface CandidateTransitionBase {
  readonly commandId: string;
  readonly aggregateId: string;
  readonly aggregateKind: "player";
  readonly schemaId: string;
  readonly schemaVersion: number;
  readonly expectedVersion: number;
  readonly observationIds: readonly string[];
}

export type CandidateTransition =
  | (CandidateTransitionBase & {
      readonly commandOutcome: "accepted";
      readonly outcome: CanonicalJsonObject;
      readonly nextState: CanonicalJsonObject;
      readonly progressionChanges: readonly string[];
    })
  | (CandidateTransitionBase & {
      readonly commandOutcome: "no-op" | "rejected";
      readonly outcome: CanonicalJsonObject;
      readonly nextState?: never;
      readonly progressionChanges?: never;
      readonly diagnosticCodes?: never;
    })
  | (CandidateTransitionBase & {
      readonly commandOutcome: "invalid";
      readonly diagnosticCodes: readonly string[];
      readonly outcome?: never;
      readonly nextState?: never;
      readonly progressionChanges?: never;
    });

export interface DurableTransitionResult {
  readonly kind: "accepted" | "duplicate" | "invalid" | "stale";
  readonly commandId: string;
  readonly commandOutcome?: "accepted" | "no-op" | "rejected" | "invalid";
  readonly aggregateId?: string;
  readonly aggregateKind?: "player";
  readonly schemaId?: string;
  readonly schemaVersion?: number;
  readonly expectedVersion?: number;
  readonly resultingVersion?: number;
  readonly outcome?: CanonicalJsonObject;
  readonly diagnosticCodes?: readonly string[];
  readonly observationIds?: readonly string[];
  readonly code?: string;
}

export type RunEventRecord =
  | {
      readonly kind: "lifecycle";
      readonly elapsedMs: number;
      readonly phase: string;
      readonly disposition: string;
      readonly commandId?: string;
      readonly diagnosticCode?: string;
    }
  | {
      readonly kind: "diagnostic";
      readonly elapsedMs: number;
      readonly code: string;
      readonly commandId?: string;
    };
