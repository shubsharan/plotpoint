import {
  CONTRACT_VERSIONS,
  isSharedHuntReport,
  projectLocationObservation,
  type LocationObservation,
  type SharedHuntReportEvent,
  type SharedHuntReport,
} from "@plotpoint/protocol";

const MAXIMUM_FRESH_AGE_MS = 15_000;

export interface SharedHuntReportEvidence {
  readonly releaseId: SharedHuntReport["releaseId"];
  readonly platform: SharedHuntReport["platform"];
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  readonly completion: SharedHuntReport["completion"];
  readonly commands: readonly {
    readonly commandId: string;
    readonly elapsedMs: number;
    readonly expectedVersion: number;
    readonly terminal:
      | "pending"
      | "accepted"
      | "no-op"
      | "rejected"
      | "invalid"
      | "blocked-revoked";
    readonly resultingVersion?: number;
    readonly outcomeCode?: string;
    readonly observations: readonly LocationObservation[];
  }[];
  readonly synchronization: readonly {
    readonly elapsedMs: number;
    readonly phase:
      | "offline"
      | "connecting"
      | "pulling"
      | "submitting"
      | "current"
      | "degraded"
      | "revoked";
    readonly disposition: string;
  }[];
}

export function buildSharedHuntReport(evidence: SharedHuntReportEvidence): SharedHuntReport {
  if (
    !Number.isSafeInteger(evidence.startedAtMs) ||
    !Number.isSafeInteger(evidence.endedAtMs) ||
    evidence.endedAtMs < evidence.startedAtMs
  )
    throw new Error("shared-report-duration-invalid");
  const aliases = new Map(
    evidence.commands.map((command, index) => [
      command.commandId,
      `command-${String(index + 1).padStart(3, "0")}`,
    ]),
  );
  const events: Array<SharedHuntReportEvent & { readonly order: number }> = [];
  for (const command of evidence.commands) {
    const commandAlias = aliases.get(command.commandId);
    if (commandAlias === undefined) throw new Error("shared-report-alias-missing");
    events.push({
      kind: "command",
      elapsedMs: command.elapsedMs,
      commandAlias,
      terminal: command.terminal,
      expectedVersion: command.expectedVersion,
      ...(command.resultingVersion === undefined
        ? {}
        : { resultingVersion: command.resultingVersion }),
      ...(command.outcomeCode === undefined ? {} : { outcomeCode: command.outcomeCode }),
      order: 0,
    });
    for (const observation of command.observations) {
      const projection = projectLocationObservation(observation, MAXIMUM_FRESH_AGE_MS);
      events.push({
        kind: "location",
        elapsedMs: command.elapsedMs,
        commandAlias,
        projection: {
          availability: projection.availability,
          recencyBand: projection.recencyBand,
          accuracyBand: projection.accuracyBand,
        },
        order: 1,
      });
    }
  }
  for (const item of evidence.synchronization)
    events.push({ kind: "synchronization", ...item, order: 2 });
  events.sort((left, right) => left.elapsedMs - right.elapsedMs || left.order - right.order);
  const report: SharedHuntReport = {
    version: CONTRACT_VERSIONS.sharedReport,
    releaseId: evidence.releaseId,
    sessionAlias: "session",
    selfAlias: "self",
    platform: evidence.platform,
    durationMs: evidence.endedAtMs - evidence.startedAtMs,
    completion: evidence.completion,
    events: events.map(({ order: _order, ...event }) => event),
  };
  if (!isSharedHuntReport(report)) throw new Error("shared-report-contract-invalid");
  const serialized = JSON.stringify(report);
  for (const forbidden of [
    "latitude",
    "longitude",
    "capturedAt",
    "recordedAt",
    "ageMs",
    "horizontalAccuracy",
    "observationId",
    "commandId",
    "sessionId",
    "participantId",
    "teamId",
    "credential",
    "invitation",
    "payload",
    "state",
    "stack",
    "path",
  ]) {
    if (serialized.includes(`"${forbidden}"`)) throw new Error("shared-report-redaction-failed");
  }
  return Object.freeze(report);
}

export interface SharedReportDatabase {
  raw(): {
    getFirstAsync<T>(query: string, ...parameters: unknown[]): Promise<T | null>;
    getAllAsync<T>(query: string, ...parameters: unknown[]): Promise<T[]>;
  };
}

export async function createSharedHuntReport(
  database: SharedReportDatabase,
  sessionId: string,
  platform: SharedHuntReport["platform"],
): Promise<SharedHuntReport> {
  const db = database.raw();
  const session = await db.getFirstAsync<{ release_id: SharedHuntReport["releaseId"] }>(
    "SELECT release_id FROM shared_sessions WHERE session_id=?",
    sessionId,
  );
  if (session === null) throw new Error("shared-report-session-missing");
  const projection = await db.getFirstAsync<{ value_json: string }>(
    "SELECT value_json FROM shared_projections WHERE session_id=? AND schema_id='plotpoint.hunt.team-state'",
    sessionId,
  );
  if (projection === null) throw new Error("shared-report-projection-missing");
  const state = JSON.parse(projection.value_json) as {
    readonly completedTargets?: unknown;
    readonly targets?: unknown;
    readonly complete?: unknown;
  };
  if (
    !Number.isSafeInteger(state.completedTargets) ||
    !Array.isArray(state.targets) ||
    typeof state.complete !== "boolean"
  )
    throw new Error("shared-report-projection-invalid");
  const rows = await db.getAllAsync<{
    command_id: string;
    terminal: SharedHuntReportEvidence["commands"][number]["terminal"];
    outcome_code: string;
    resulting_state_version: number;
    expected_state_version: number;
    observation_ids_json: string;
    decided_at: string;
  }>(
    "SELECT * FROM shared_results WHERE session_id=? ORDER BY decision_position,command_id",
    sessionId,
  );
  const observationsFor = async (idsJson: string): Promise<LocationObservation[]> => {
    const ids: unknown = JSON.parse(idsJson);
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string"))
      throw new Error("shared-report-observation-links-invalid");
    const observations: LocationObservation[] = [];
    for (const id of ids) {
      const row = await db.getFirstAsync<{
        observation_id: string;
        recorded_at: string;
        captured_at: string | null;
        age_ms: number | null;
        availability: string;
        latitude: number | null;
        longitude: number | null;
        horizontal_accuracy: number | null;
        diagnostic_code: string | null;
      }>("SELECT * FROM observations WHERE observation_id=? ORDER BY recorded_at DESC LIMIT 1", id);
      if (row === null) throw new Error("shared-report-observation-missing");
      const base = {
        version: CONTRACT_VERSIONS.capabilityObservation,
        observationId: row.observation_id,
        recordedAt: row.recorded_at,
      };
      const value =
        row.availability === "available"
          ? {
              ...base,
              availability: "available" as const,
              capturedAt: row.captured_at as string,
              ageMs: row.age_ms as number,
              latitude: row.latitude as number,
              longitude: row.longitude as number,
              horizontalAccuracy: row.horizontal_accuracy as number,
            }
          : row.availability === "failed"
            ? {
                ...base,
                availability: "failed" as const,
                diagnosticCode: row.diagnostic_code as string,
              }
            : { ...base, availability: row.availability as "permission-denied" | "unavailable" };
      observations.push(value);
    }
    return observations;
  };
  const commands: SharedHuntReportEvidence["commands"][number][] = [];
  for (const [index, row] of rows.entries())
    commands.push({
      commandId: row.command_id,
      elapsedMs: index,
      expectedVersion: row.expected_state_version,
      terminal: row.terminal,
      resultingVersion: row.resulting_state_version,
      outcomeCode: row.outcome_code,
      observations: await observationsFor(row.observation_ids_json),
    });
  const sync = await db.getAllAsync<{
    elapsed_ms: number;
    phase: SharedHuntReportEvidence["synchronization"][number]["phase"];
    disposition: string;
  }>(
    "SELECT elapsed_ms,phase,disposition FROM shared_sync_events WHERE session_id=? ORDER BY sequence",
    sessionId,
  );
  const durationMs = Math.max(
    0,
    ...commands.map(({ elapsedMs }) => elapsedMs),
    ...sync.map(({ elapsed_ms }) => elapsed_ms),
  );
  return buildSharedHuntReport({
    releaseId: session.release_id,
    platform,
    startedAtMs: 0,
    endedAtMs: durationMs,
    completion: {
      completedTargets: state.completedTargets as number,
      totalTargets: state.targets.length,
      complete: state.complete,
    },
    commands,
    synchronization: sync.map((item) => ({
      elapsedMs: item.elapsed_ms,
      phase: item.phase,
      disposition: item.disposition,
    })),
  });
}
