export const PROGRESSION_STATUSES = [
  "locked",
  "available",
  "active",
  "completed",
  "skipped",
] as const;
export type ProgressionStatus = (typeof PROGRESSION_STATUSES)[number];

export interface ProgressionNodeState {
  readonly nodeId: string;
  readonly status: ProgressionStatus;
}

export interface ProgressionInstance {
  readonly graphId: string;
  readonly nodes: readonly ProgressionNodeState[];
}

export interface ProgressionIntent {
  readonly transitionId: string;
}

export interface ProgressionTraceEntry {
  readonly sequence: number;
  readonly round: number;
  readonly source: "command" | "automatic";
  readonly transitionId: string;
  readonly nodeId: string;
  readonly from: ProgressionStatus;
  readonly to: ProgressionStatus;
}
