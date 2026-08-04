import type { ReleaseId } from "@plotpoint/protocol";

import type { RunRecord } from "../model";
import type { PlayerDatabase } from "../persistence/database";

export interface RunLifecycleStore {
  selectOrCreateActiveRun(candidate: RunRecord): Promise<{
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
    selectOrCreateActiveRun: (candidate) => database.selectOrCreateActiveRun(candidate),
  };
}

export async function selectReleaseRun(
  store: RunLifecycleStore,
  releaseId: ReleaseId,
  options: {
    readonly createRunId?: () => string;
    readonly now?: () => string;
  } = {},
): Promise<ReleaseRunSelection> {
  const candidate: RunRecord = {
    runId: (options.createRunId ?? runId)(),
    releaseId,
    startedAt: (options.now ?? (() => new Date().toISOString()))(),
    status: "active",
  };
  const selection = await store.selectOrCreateActiveRun(candidate);
  return selection.created
    ? { kind: "created", run: selection.run }
    : { kind: "resumed", run: selection.run };
}
