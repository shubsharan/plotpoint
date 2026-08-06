import type { LocalAggregateView, ReleaseId } from "@plotpoint/protocol";

import type { RunRecord } from "../model";
import type { PlayerDatabase } from "../persistence/database";

export interface RunLifecycleStore {
  selectOrCreateActiveRun(
    candidate: RunRecord,
    initialAggregate: LocalAggregateView,
  ): Promise<{
    readonly created: boolean;
    readonly run: RunRecord;
  }>;
}

export type ReleaseRunSelection =
  | { readonly kind: "resumed"; readonly run: RunRecord }
  | { readonly kind: "created"; readonly run: RunRecord };

function runId(): string {
  return `run-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

export function playerRunLifecycleStore(database: PlayerDatabase): RunLifecycleStore {
  return {
    selectOrCreateActiveRun: (candidate, initialAggregate) =>
      database.selectOrCreateActiveRun(candidate, initialAggregate),
  };
}

export async function selectReleaseRun(
  store: RunLifecycleStore,
  releaseId: ReleaseId,
  initialAggregate?: LocalAggregateView,
  options: {
    readonly createRunId?: () => string;
    readonly now?: () => string;
  } = {},
): Promise<ReleaseRunSelection> {
  if (initialAggregate === undefined || initialAggregate.stateVersion !== 0) {
    throw new Error("release-run-initial-aggregate-invalid");
  }
  const candidate: RunRecord = {
    runId: (options.createRunId ?? runId)(),
    releaseId,
    startedAt: (options.now ?? (() => new Date().toISOString()))(),
    status: "active",
  };
  const selection = await store.selectOrCreateActiveRun(candidate, initialAggregate);
  return selection.created
    ? { kind: "created", run: selection.run }
    : { kind: "resumed", run: selection.run };
}
