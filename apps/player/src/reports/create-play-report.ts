import {
  FOREGROUND_LOCATION_CAPABILITY,
  LOCATION_REPORT_PROJECTION_VALIDATOR_V1,
  accuracyBand,
  isPlayReportV1,
  recencyBand,
  type CanonicalJsonObject,
  type PlayReportEventV1,
  type PlayReportV1,
} from "@plotpoint/protocol";

import type { DurableTransitionResult, RunEventRecord } from "../model";

const STABLE_CODE = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const LOCATION_REPORT_MAXIMUM_FRESH_AGE_MS = 15_000;

export interface PlayReportEvidence {
  readonly releaseId: PlayReportV1["releaseId"];
  readonly runId: string;
  readonly platform: PlayReportV1["platform"];
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

function stableCode(value: unknown): string | undefined {
  return typeof value === "string" && STABLE_CODE.test(value) ? value : undefined;
}

function outcomeCode(outcome: CanonicalJsonObject | undefined): string | undefined {
  return stableCode(outcome?.code) ?? stableCode(outcome?.result);
}

function reportElapsed(value: number, startedAtMs: number): number {
  const elapsed = value >= startedAtMs ? value - startedAtMs : value;
  if (!Number.isSafeInteger(elapsed) || elapsed < 0) throw new Error("report-elapsed-invalid");
  return elapsed;
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
    if (
      result.commandOutcome === undefined ||
      result.expectedVersion === undefined ||
      result.resultingVersion === undefined
    ) {
      throw new Error("report-receipt-incoherent");
    }
    const hasJournal = journalByCommand.has(result.commandId);
    if ((result.commandOutcome === "accepted") !== hasJournal) {
      throw new Error("report-journal-incoherent");
    }
    const expectedLinks = [...(result.observationIds ?? [])].sort();
    const actualLinks = [...(linksByCommand.get(result.commandId) ?? [])].sort();
    if (JSON.stringify(expectedLinks) !== JSON.stringify(actualLinks)) {
      throw new Error("report-observation-link-incoherent");
    }
  }
}

export function buildPlayReport(evidence: PlayReportEvidence): PlayReportV1 {
  if (
    !Number.isSafeInteger(evidence.startedAtMs) ||
    !Number.isSafeInteger(evidence.endedAtMs) ||
    evidence.endedAtMs < evidence.startedAtMs
  ) {
    throw new Error("report-duration-invalid");
  }
  validateCoherence(evidence);

  const events: Array<PlayReportEventV1 & { readonly order: number }> = [];
  for (const { result, elapsedMs } of evidence.commands) {
    const journal = evidence.journals.find(({ commandId }) => commandId === result.commandId);
    events.push({
      kind: "command",
      elapsedMs: reportElapsed(elapsedMs, evidence.startedAtMs),
      commandId: result.commandId,
      terminal: result.commandOutcome as "accepted" | "no-op" | "rejected" | "invalid",
      expectedVersion: result.expectedVersion as number,
      resultingVersion: result.resultingVersion as number,
      ...(outcomeCode(result.outcome) === undefined
        ? {}
        : { outcomeCode: outcomeCode(result.outcome) }),
      progressionChanges: journal?.progressionChanges ?? [],
      order: 0,
    });
  }
  for (const capability of evidence.capabilities) {
    events.push({
      kind: "capability",
      elapsedMs: capability.elapsedMs,
      capability: {
        id: FOREGROUND_LOCATION_CAPABILITY.id,
        major: FOREGROUND_LOCATION_CAPABILITY.major,
      },
      recordId: capability.recordId,
      outcomeCode: capability.availability,
      projection: {
        availability: capability.availability,
        recencyBand: recencyBand(
          capability.ageMs ?? undefined,
          LOCATION_REPORT_MAXIMUM_FRESH_AGE_MS,
        ),
        accuracyBand: accuracyBand(capability.horizontalAccuracy ?? undefined),
      },
      order: 1,
    });
  }
  for (const event of evidence.runEvents) {
    events.push({ ...event, order: event.kind === "lifecycle" ? 2 : 3 });
  }
  events.sort((left, right) => left.elapsedMs - right.elapsedMs || left.order - right.order);
  const report = {
    version: 1,
    releaseId: evidence.releaseId,
    runId: evidence.runId,
    platform: evidence.platform,
    durationMs: evidence.endedAtMs - evidence.startedAtMs,
    events: events.map(({ order: _order, ...event }) => event),
  } satisfies PlayReportV1;
  if (!isPlayReportV1(report, [LOCATION_REPORT_PROJECTION_VALIDATOR_V1])) {
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
  platform: PlayReportV1["platform"],
): Promise<PlayReportV1> {
  const raw = database.raw();
  const run = await raw.getFirstAsync<{
    release_id: PlayReportV1["releaseId"];
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
    progression_json: string;
  }>(
    "SELECT sequence, command_id, progression_json FROM journal WHERE run_id = ? ORDER BY sequence",
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
      progressionChanges: JSON.parse(row.progression_json) as string[],
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
