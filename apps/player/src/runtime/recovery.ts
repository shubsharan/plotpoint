import type { CanonicalJsonObject } from "@plotpoint/protocol";

import type { PlayerDatabase } from "../persistence/database";

export interface RecoveryBootstrap {
  readonly runId: string;
  readonly releaseId: string;
  readonly startedAt: string;
  readonly aggregate: {
    readonly state: CanonicalJsonObject;
    readonly stateVersion: number;
  } | null;
}

export function isRecoverableSnapshotState(value: unknown): value is CanonicalJsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function recoverLatestRun(
  database: PlayerDatabase,
  options: { readonly recordRestore?: boolean } = {},
): Promise<RecoveryBootstrap | null> {
  const run = await database.latestRun();
  if (run === null || run.status === "invalid") return null;
  const transaction = database.raw();
  const row = await transaction.getFirstAsync<{ state_json: string; state_version: number }>(
    "SELECT state_json, state_version FROM snapshots WHERE run_id = ?",
    run.runId,
  );
  let aggregate: RecoveryBootstrap["aggregate"] = null;
  if (row !== null) {
    const state = JSON.parse(row.state_json) as unknown;
    if (!isRecoverableSnapshotState(state)) {
      await transaction.runAsync("UPDATE runs SET status = 'invalid' WHERE run_id = ?", run.runId);
      throw new Error("recovery-snapshot-invalid");
    }
    aggregate = { state, stateVersion: row.state_version };
  }
  if (options.recordRestore === true) {
    await database.recordRecoveryEvent(
      run.runId,
      "application-restored",
      Date.now() - Date.parse(run.startedAt),
    );
  }
  return { runId: run.runId, releaseId: run.releaseId, startedAt: run.startedAt, aggregate };
}
