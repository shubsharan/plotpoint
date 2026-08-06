import {
  FOREGROUND_LOCATION_CAPABILITY,
  isGamePlayReport,
  parseReportSafeDiagnosticCode,
  type GamePlayReport,
  type GamePlayReportEvent,
} from "@plotpoint/protocol";

import type { DurableTransitionResult, RunEventRecord } from "../model";

export interface PlayReportEvidence {
  readonly releaseId: GamePlayReport["releaseId"];
  readonly runId: string;
  readonly platform: GamePlayReport["platform"];
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  readonly commands: readonly {
    readonly result: DurableTransitionResult;
    readonly elapsedMs: number;
  }[];
  readonly journals: readonly {
    readonly sequence: number;
    readonly commandId: string;
    readonly progressionChanges: readonly string[];
  }[];
  readonly capabilities: readonly {
    readonly elapsedMs: number;
    readonly recordId: string;
    readonly availability: "available" | "permission-denied" | "unavailable" | "failed";
    readonly ageMs: number | null;
    readonly horizontalAccuracy: number | null;
    readonly diagnosticCode: string | null;
  }[];
  readonly observationLinks: readonly {
    readonly commandId: string;
    readonly observationId: string;
  }[];
  readonly runEvents: readonly RunEventRecord[];
}

function reportElapsed(value: number, startedAtMs: number): number {
  const elapsed = value >= startedAtMs ? value - startedAtMs : value;
  if (!Number.isSafeInteger(elapsed) || elapsed < 0) throw new Error("report-elapsed-invalid");
  return elapsed;
}

function journalProgressionChanges(recordJson: string, commandId: string): readonly string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(recordJson) as unknown;
  } catch {
    throw new Error("report-journal-incoherent");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("report-journal-incoherent");
  }
  const record = parsed as Record<string, unknown>;
  const candidate = record.candidate;
  const result = record.result;
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    Array.isArray(candidate) ||
    result === null ||
    typeof result !== "object" ||
    Array.isArray(result)
  ) {
    throw new Error("report-journal-incoherent");
  }
  const candidateRecord = candidate as Record<string, unknown>;
  const resultRecord = result as Record<string, unknown>;
  if (
    candidateRecord.commandId !== commandId ||
    resultRecord.commandId !== commandId ||
    candidateRecord.terminal !== "accepted" ||
    !Array.isArray(candidateRecord.progressionTrace)
  ) {
    throw new Error("report-journal-incoherent");
  }
  return candidateRecord.progressionTrace.map((entry) => {
    const transitionId =
      entry !== null && typeof entry === "object" && !Array.isArray(entry)
        ? (entry as Record<string, unknown>).transitionId
        : undefined;
    if (typeof transitionId !== "string") {
      throw new Error("report-journal-incoherent");
    }
    return transitionId;
  });
}

function safeDiagnosticCode(value: string) {
  const code = parseReportSafeDiagnosticCode(value);
  if (code === null) throw new Error("report-diagnostic-code-unsafe");
  return code;
}

function validateCoherence(evidence: PlayReportEvidence): void {
  const receipts = new Map(evidence.commands.map(({ result }) => [result.commandId, result]));
  const journalByCommand = new Map<string, PlayReportEvidence["journals"][number]>();
  for (let index = 0; index < evidence.journals.length; index += 1) {
    const journal = evidence.journals[index];
    if (
      journal === undefined ||
      journal.sequence !== index + 1 ||
      journalByCommand.has(journal.commandId)
    ) {
      throw new Error("report-journal-incoherent");
    }
    journalByCommand.set(journal.commandId, journal);
  }
  const observationIds = new Set(evidence.capabilities.map(({ recordId }) => recordId));
  const linksByCommand = new Map<string, string[]>();
  for (const link of evidence.observationLinks) {
    if (!receipts.has(link.commandId) || !observationIds.has(link.observationId)) {
      throw new Error("report-observation-link-incoherent");
    }
    const links = linksByCommand.get(link.commandId) ?? [];
    links.push(link.observationId);
    linksByCommand.set(link.commandId, links);
  }
  for (const { result } of evidence.commands) {
    const hasJournal = journalByCommand.has(result.commandId);
    if ((result.terminal === "accepted") !== hasJournal) {
      throw new Error("report-journal-incoherent");
    }
  }
}

export function buildPlayReport(evidence: PlayReportEvidence): GamePlayReport {
  if (
    !Number.isSafeInteger(evidence.startedAtMs) ||
    !Number.isSafeInteger(evidence.endedAtMs) ||
    evidence.endedAtMs < evidence.startedAtMs
  ) {
    throw new Error("report-duration-invalid");
  }
  validateCoherence(evidence);

  const commandAliases = new Map(
    evidence.commands.map(({ result }, index) => [
      result.commandId,
      `command-${String(index + 1).padStart(3, "0")}`,
    ]),
  );
  const events: GamePlayReportEvent[] = [];
  for (const { result, elapsedMs } of evidence.commands) {
    const commandAlias = commandAliases.get(result.commandId);
    if (commandAlias === undefined) throw new Error("report-command-alias-missing");
    events.push({
      kind: "command",
      elapsedMs: reportElapsed(elapsedMs, evidence.startedAtMs),
      scope: "local",
      commandAlias,
      terminal: result.terminal,
      expectedStateVersion:
        result.terminal === "accepted"
          ? result.resultingStateVersion - 1
          : result.resultingStateVersion,
      resultingStateVersion: result.resultingStateVersion,
    });
  }
  for (const capability of evidence.capabilities) {
    events.push({
      kind: "capability",
      elapsedMs: reportElapsed(capability.elapsedMs, evidence.startedAtMs),
      capabilityId: FOREGROUND_LOCATION_CAPABILITY.id,
      disposition: capability.availability === "available" ? "captured" : "denied",
    });
  }
  for (const event of evidence.runEvents) {
    const elapsedMs = reportElapsed(event.elapsedMs, evidence.startedAtMs);
    if (
      (event.kind === "lifecycle" &&
        event.phase === "recovery" &&
        event.disposition === "application-restored") ||
      (event.kind === "diagnostic" && event.code === "application-restored")
    ) {
      events.push({ kind: "recovery", elapsedMs, disposition: "run-restored" });
    } else if (
      event.kind === "lifecycle" &&
      event.phase === "transition" &&
      event.disposition === "interrupted"
    ) {
      const commandAlias =
        event.commandId === undefined ? undefined : commandAliases.get(event.commandId);
      events.push({
        kind: "diagnostic",
        elapsedMs,
        code: safeDiagnosticCode("delivery-interrupted"),
        ...(commandAlias === undefined ? {} : { commandAlias }),
      });
    } else if (
      event.kind === "lifecycle" &&
      event.phase === "recovery" &&
      event.disposition === "failed"
    ) {
      events.push({
        kind: "diagnostic",
        elapsedMs,
        code: safeDiagnosticCode("runtime-recovery-failed"),
      });
    } else {
      throw new Error("report-run-event-unsupported");
    }
  }
  events.sort(
    (left, right) =>
      left.elapsedMs - right.elapsedMs ||
      (left.kind < right.kind ? -1 : left.kind > right.kind ? 1 : 0),
  );
  const report = {
    releaseId: evidence.releaseId,
    platform: evidence.platform,
    durationMs: evidence.endedAtMs - evidence.startedAtMs,
    events,
  } satisfies GamePlayReport;
  if (!isGamePlayReport(report)) {
    throw new Error("report-contract-invalid");
  }
  const serialized = JSON.stringify(report);
  for (const forbidden of [
    "latitude",
    "longitude",
    "capturedAt",
    "recordedAt",
    "ageMs",
    "horizontalAccuracy",
    "payload",
    "state",
    "credentials",
    "stack",
  ]) {
    if (serialized.includes(`"${forbidden}"`)) throw new Error("report-redaction-failed");
  }
  return Object.freeze(report);
}

export interface PlayReportDatabase {
  raw(): {
    getFirstAsync<T>(query: string, ...parameters: unknown[]): Promise<T | null>;
    getAllAsync<T>(query: string, ...parameters: unknown[]): Promise<T[]>;
  };
}

export async function createPlayReport(
  database: PlayReportDatabase,
  runId: string,
  platform: GamePlayReport["platform"],
): Promise<GamePlayReport> {
  const raw = database.raw();
  const run = await raw.getFirstAsync<{
    release_id: GamePlayReport["releaseId"];
    started_at: string;
  }>("SELECT release_id, started_at FROM runs WHERE run_id = ?", runId);
  if (run === null) throw new Error("report-run-missing");
  const startedAtMs = Date.parse(run.started_at);
  if (!Number.isFinite(startedAtMs)) throw new Error("report-run-incoherent");
  const commands = await raw.getAllAsync<{
    result_json: string;
    elapsed_ms: number;
  }>("SELECT result_json, elapsed_ms FROM command_receipts WHERE run_id = ?", runId);
  const journals = await raw.getAllAsync<{
    sequence: number;
    command_id: string;
    record_json: string;
  }>(
    "SELECT sequence, command_id, record_json FROM journal WHERE run_id = ? ORDER BY sequence",
    runId,
  );
  const observations = await raw.getAllAsync<{
    observation_id: string;
    availability: PlayReportEvidence["capabilities"][number]["availability"];
    age_ms: number | null;
    horizontal_accuracy: number | null;
    diagnostic_code: string | null;
    elapsed_ms: number;
  }>(
    `SELECT observation_id, availability, age_ms, horizontal_accuracy, diagnostic_code, elapsed_ms
     FROM observations WHERE run_id = ?`,
    runId,
  );
  const links = await raw.getAllAsync<{ command_id: string; observation_id: string }>(
    "SELECT command_id, observation_id FROM command_observations WHERE run_id = ?",
    runId,
  );
  const runEvents = await raw.getAllAsync<{
    elapsed_ms: number;
    kind: "lifecycle" | "diagnostic";
    phase: string | null;
    disposition: string | null;
    code: string | null;
    command_id: string | null;
  }>(
    "SELECT elapsed_ms, kind, phase, disposition, code, command_id FROM run_events WHERE run_id = ? ORDER BY elapsed_ms, sequence",
    runId,
  );
  return buildPlayReport({
    releaseId: run.release_id,
    runId,
    platform,
    startedAtMs,
    endedAtMs: Date.now(),
    commands: commands.map((row) => ({
      result: JSON.parse(row.result_json) as DurableTransitionResult,
      elapsedMs: row.elapsed_ms,
    })),
    journals: journals.map((row) => ({
      sequence: row.sequence,
      commandId: row.command_id,
      progressionChanges: journalProgressionChanges(row.record_json, row.command_id),
    })),
    capabilities: observations.map((row) => ({
      elapsedMs: row.elapsed_ms,
      recordId: row.observation_id,
      availability: row.availability,
      ageMs: row.age_ms,
      horizontalAccuracy: row.horizontal_accuracy,
      diagnosticCode: row.diagnostic_code,
    })),
    observationLinks: links.map((row) => ({
      commandId: row.command_id,
      observationId: row.observation_id,
    })),
    runEvents: runEvents.map((row) => {
      if (row.kind === "lifecycle") {
        if (row.phase === null || row.disposition === null) {
          throw new Error("report-run-event-incoherent");
        }
        return {
          kind: "lifecycle",
          elapsedMs: row.elapsed_ms,
          phase: row.phase,
          disposition: row.disposition,
          ...(row.command_id === null ? {} : { commandId: row.command_id }),
          ...(row.code === null ? {} : { diagnosticCode: row.code }),
        };
      }
      if (row.code === null) throw new Error("report-run-event-incoherent");
      return {
        kind: "diagnostic",
        elapsedMs: row.elapsed_ms,
        code: row.code,
        ...(row.command_id === null ? {} : { commandId: row.command_id }),
      };
    }),
  });
}
