import type {
  CanonicalJsonObject,
  ProgressionInstance,
  ReleaseId,
  TransitionCandidate,
  TransitionResult,
} from "@plotpoint/protocol";

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
  readonly modelId: string;
  readonly aggregateId: string;
  readonly aggregateKind: "player";
  readonly schemaId: string;
  readonly stateVersion: number;
  readonly state: CanonicalJsonObject;
  readonly progression?: ProgressionInstance;
  readonly journalPosition: number;
}

export type CandidateTransition = TransitionCandidate;
export type DurableTransitionResult = TransitionResult;

export interface DurableCommandRecord {
  readonly candidate: CandidateTransition;
  readonly result: DurableTransitionResult;
}

export type TransitionCommitFailure = {
  readonly kind: "invalid" | "stale";
  readonly commandId: string;
  readonly resultingStateVersion?: number;
  readonly code: string;
};

export type TransitionCommitResult = DurableTransitionResult | TransitionCommitFailure;

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
