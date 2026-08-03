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
  readonly graphVersion: number;
  readonly nodes: readonly ProgressionNodeState[];
}

export interface ProgressionIntent {
  readonly nodeId: string;
  readonly from: ProgressionStatus;
  readonly to: ProgressionStatus;
}

export interface ProgressionTransition extends ProgressionIntent {
  readonly sequence: number;
  readonly round: number;
  readonly source: "command" | "automatic";
  readonly ruleId?: string;
}
