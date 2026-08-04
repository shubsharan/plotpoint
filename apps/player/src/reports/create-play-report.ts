import { accuracyBand, type PlayReportV1 } from "@plotpoint/protocol";

import type { PlayerDatabase } from "../persistence/database";

export interface PlayReportRows {
  readonly releaseId: PlayReportV1["releaseId"];
  readonly runId: string;
  readonly platform: PlayReportV1["platform"];
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  readonly commands: readonly {
    readonly commandId: string;
    readonly outcome: "accepted" | "rejected" | "invalid";
    readonly resultingVersion: number;
    readonly occurredAtMs: number;
  }[];
  readonly observations: readonly {
    readonly observationId: string;
    readonly availability: PlayReportV1["observations"][number]["availability"];
    readonly horizontalAccuracy: number | null;
    readonly elapsedMs: number;
  }[];
  readonly progressionChanges: readonly string[];
  readonly recoveryEvents: readonly { readonly code: string; readonly elapsedMs: number }[];
}

export function buildPlayReport(rows: PlayReportRows): PlayReportV1 {
  return Object.freeze({
    version: 1,
    releaseId: rows.releaseId,
    runId: rows.runId,
    platform: rows.platform,
    durationMs: Math.max(0, rows.endedAtMs - rows.startedAtMs),
    commands: rows.commands.map((row) => ({
      commandId: row.commandId,
      outcome: row.outcome,
      resultingVersion: row.resultingVersion,
      elapsedMs: Math.max(0, row.occurredAtMs - rows.startedAtMs),
    })),
    observations: rows.observations.map((row) => ({
      observationId: row.observationId,
      availability: row.availability,
      accuracyBand: accuracyBand(row.horizontalAccuracy ?? undefined),
      elapsedMs: Math.max(0, row.elapsedMs),
    })),
    progressionChanges: [...rows.progressionChanges],
    recoveryEvents: rows.recoveryEvents.map((row) => ({
      ...row,
      elapsedMs: Math.max(0, row.elapsedMs),
    })),
    diagnosticCodes: Object.freeze([...new Set(rows.recoveryEvents.map((row) => row.code))].sort()),
  });
}

export async function createPlayReport(
  database: PlayerDatabase,
  runId: string,
  platform: PlayReportV1["platform"],
): Promise<PlayReportV1> {
  const raw = database.raw();
  const run = await raw.getFirstAsync<{
    release_id: PlayReportV1["releaseId"];
    started_at: string;
  }>("SELECT release_id, started_at FROM runs WHERE run_id = ?", runId);
  if (run === null) throw new Error("report-run-missing");
  const started = Date.parse(run.started_at);
  const commands = await raw.getAllAsync<{
    command_id: string;
    result_json: string;
    resulting_version: number;
    elapsed_ms: number;
  }>(
    "SELECT command_id, result_json, resulting_version, elapsed_ms FROM command_receipts WHERE run_id = ? ORDER BY resulting_version",
    runId,
  );
  const observations = await raw.getAllAsync<{
    observation_id: string;
    availability: PlayReportV1["observations"][number]["availability"];
    horizontal_accuracy: number | null;
    elapsed_ms: number;
  }>(
    "SELECT observation_id, availability, horizontal_accuracy, elapsed_ms FROM observations WHERE run_id = ? ORDER BY elapsed_ms",
    runId,
  );
  const journals = await raw.getAllAsync<{ progression_json: string }>(
    "SELECT progression_json FROM journal WHERE run_id = ? ORDER BY sequence",
    runId,
  );
  const recoveryEvents = await raw.getAllAsync<{ code: string; elapsed_ms: number }>(
    "SELECT code, elapsed_ms FROM recovery_events WHERE run_id = ? ORDER BY elapsed_ms",
    runId,
  );
  const report = buildPlayReport({
    releaseId: run.release_id,
    runId,
    platform,
    startedAtMs: started,
    endedAtMs: Date.now(),
    commands: commands.map((row) => ({
      commandId: row.command_id,
      outcome:
        (JSON.parse(row.result_json) as { commandOutcome?: "accepted" | "rejected" })
          .commandOutcome ?? "accepted",
      resultingVersion: row.resulting_version,
      occurredAtMs: row.elapsed_ms,
    })),
    observations: observations.map((row) => ({
      observationId: row.observation_id,
      availability: row.availability,
      horizontalAccuracy: row.horizontal_accuracy,
      elapsedMs: row.elapsed_ms,
    })),
    progressionChanges: journals.flatMap((row) => JSON.parse(row.progression_json) as string[]),
    recoveryEvents: recoveryEvents.map((row) => ({ code: row.code, elapsedMs: row.elapsed_ms })),
  });
  const serialized = JSON.stringify(report);
  for (const forbidden of ["latitude", "longitude", "payload", "state_json", "credentials"]) {
    if (serialized.includes(`"${forbidden}"`)) throw new Error("report-redaction-failed");
  }
  return Object.freeze(report);
}
