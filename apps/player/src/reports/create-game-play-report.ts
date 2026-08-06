import {
  FOREGROUND_LOCATION_CAPABILITY,
  isGamePlayReport,
  parseReportSafeDiagnosticCode,
  type GamePlayReport,
  type GamePlayReportEvent,
  type ReportSafeDiagnosticCode,
} from "@plotpoint/protocol";

type Platform = GamePlayReport["platform"];
type CommandEvent = Extract<GamePlayReportEvent, { readonly kind: "command" }>;
type LifecycleEvent = Extract<GamePlayReportEvent, { readonly kind: "lifecycle" }>;
type CapabilityEvent = Extract<GamePlayReportEvent, { readonly kind: "capability" }>;
type SynchronizationEvent = Extract<GamePlayReportEvent, { readonly kind: "synchronization" }>;
type RecoveryEvent = Extract<GamePlayReportEvent, { readonly kind: "recovery" }>;

interface OrderedEvidence {
  readonly elapsedMs: number;
  readonly sourceSequence: number;
}

export interface GamePlayReportEvidence {
  readonly releaseId: GamePlayReport["releaseId"];
  readonly platform: Platform;
  readonly sharedMembership?: "active" | "revoked";
  readonly lifecycle: readonly (OrderedEvidence & {
    readonly disposition: LifecycleEvent["disposition"];
  })[];
  readonly commands: readonly (OrderedEvidence & {
    readonly scope: CommandEvent["scope"];
    readonly commandId: string;
    readonly terminal: CommandEvent["terminal"];
    readonly expectedStateVersion: number;
    readonly resultingStateVersion?: number;
  })[];
  readonly capabilities: readonly (OrderedEvidence & {
    readonly capabilityId: string;
    readonly disposition: CapabilityEvent["disposition"];
  })[];
  readonly synchronization: readonly (OrderedEvidence & {
    readonly phase: SynchronizationEvent["phase"];
    readonly disposition: SynchronizationEvent["disposition"];
  })[];
  readonly recovery: readonly (OrderedEvidence & {
    readonly disposition: RecoveryEvent["disposition"];
  })[];
  readonly diagnostics: readonly (OrderedEvidence & {
    readonly code: string;
    readonly commandScope?: CommandEvent["scope"];
    readonly commandId?: string;
  })[];
}

interface ReportReader {
  getFirstAsync<T>(query: string, ...parameters: unknown[]): Promise<T | null>;
  getAllAsync<T>(query: string, ...parameters: unknown[]): Promise<T[]>;
  withExclusiveTransactionAsync?(
    operation: (transaction: ReportReader) => Promise<void>,
  ): Promise<void>;
}

export interface GamePlayReportDatabase {
  raw(): ReportReader;
}

interface OrderedEvent {
  readonly event: GamePlayReportEvent;
  readonly sourceSequence: number;
  readonly source: string;
  readonly stableKey: string;
}

const MAXIMUM_FRESH_AGE_MS = 15_000;
const REPORT_SAFE_CAPABILITY_IDS: ReadonlySet<string> = new Set([
  FOREGROUND_LOCATION_CAPABILITY.id,
]);

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && !Object.is(value, -0);
}

function assertOrderedEvidence(item: OrderedEvidence): void {
  if (!nonNegativeInteger(item.elapsedMs) || !nonNegativeInteger(item.sourceSequence)) {
    throw new Error("report-evidence-order-invalid");
  }
}

function commandKey(scope: CommandEvent["scope"], commandId: string): string {
  return `${scope}\u0000${commandId}`;
}

function safeDiagnosticCode(value: string): ReportSafeDiagnosticCode {
  const parsed = parseReportSafeDiagnosticCode(value);
  if (parsed === null) throw new Error("report-diagnostic-code-unsafe");
  return parsed;
}

function stableEventKey(event: GamePlayReportEvent): string {
  switch (event.kind) {
    case "lifecycle":
      return event.disposition;
    case "command":
      return `${event.scope}\u0000${event.commandAlias}`;
    case "capability":
      return `${event.capabilityId}\u0000${event.disposition}`;
    case "synchronization":
      return `${event.phase}\u0000${event.disposition}`;
    case "recovery":
      return event.disposition;
    case "diagnostic":
      return `${event.code}\u0000${event.commandAlias ?? ""}`;
  }
}

function reportEventOrder(left: OrderedEvent, right: OrderedEvent): number {
  return (
    left.event.elapsedMs - right.event.elapsedMs ||
    compareOrdinal(left.event.kind, right.event.kind) ||
    left.sourceSequence - right.sourceSequence ||
    compareOrdinal(left.source, right.source) ||
    compareOrdinal(left.stableKey, right.stableKey)
  );
}

function freezeEvent(event: GamePlayReportEvent): GamePlayReportEvent {
  return Object.freeze(event);
}

export function buildGamePlayReport(evidence: GamePlayReportEvidence): GamePlayReport {
  const commandAliases = new Map<string, string>();
  const commands = [...evidence.commands].sort(
    (left, right) =>
      left.elapsedMs - right.elapsedMs ||
      left.sourceSequence - right.sourceSequence ||
      compareOrdinal(left.scope, right.scope) ||
      compareOrdinal(left.commandId, right.commandId),
  );
  for (const [index, command] of commands.entries()) {
    assertOrderedEvidence(command);
    if (
      command.commandId.length === 0 ||
      !nonNegativeInteger(command.expectedStateVersion) ||
      (command.resultingStateVersion !== undefined &&
        !nonNegativeInteger(command.resultingStateVersion))
    ) {
      throw new Error("report-command-evidence-invalid");
    }
    const key = commandKey(command.scope, command.commandId);
    if (commandAliases.has(key)) throw new Error("report-command-evidence-duplicate");
    commandAliases.set(key, `command-${String(index + 1).padStart(3, "0")}`);
  }

  const ordered: OrderedEvent[] = [];
  const append = (event: GamePlayReportEvent, item: OrderedEvidence, source: string): void => {
    assertOrderedEvidence(item);
    ordered.push({
      event: freezeEvent(event),
      sourceSequence: item.sourceSequence,
      source,
      stableKey: stableEventKey(event),
    });
  };

  for (const item of evidence.lifecycle) {
    append(
      { kind: "lifecycle", elapsedMs: item.elapsedMs, disposition: item.disposition },
      item,
      "lifecycle",
    );
  }
  for (const item of commands) {
    const commandAlias = commandAliases.get(commandKey(item.scope, item.commandId));
    if (commandAlias === undefined) throw new Error("report-command-alias-missing");
    append(
      {
        kind: "command",
        elapsedMs: item.elapsedMs,
        scope: item.scope,
        commandAlias,
        terminal: item.terminal,
        expectedStateVersion: item.expectedStateVersion,
        ...(item.resultingStateVersion === undefined
          ? {}
          : { resultingStateVersion: item.resultingStateVersion }),
      },
      item,
      `command-${item.scope}`,
    );
  }
  for (const item of evidence.capabilities) {
    if (!REPORT_SAFE_CAPABILITY_IDS.has(item.capabilityId)) {
      throw new Error("report-capability-id-unsafe");
    }
    append(
      {
        kind: "capability",
        elapsedMs: item.elapsedMs,
        capabilityId: item.capabilityId,
        disposition: item.disposition,
      },
      item,
      "capability",
    );
  }
  for (const item of evidence.synchronization) {
    append(
      {
        kind: "synchronization",
        elapsedMs: item.elapsedMs,
        phase: item.phase,
        disposition: item.disposition,
      },
      item,
      "synchronization",
    );
  }
  for (const item of evidence.recovery) {
    append(
      { kind: "recovery", elapsedMs: item.elapsedMs, disposition: item.disposition },
      item,
      "recovery",
    );
  }
  for (const item of evidence.diagnostics) {
    const hasCommandScope = item.commandScope !== undefined;
    const hasCommandId = item.commandId !== undefined;
    if (hasCommandScope !== hasCommandId) throw new Error("report-diagnostic-evidence-invalid");
    const commandAlias =
      item.commandScope === undefined || item.commandId === undefined
        ? undefined
        : commandAliases.get(commandKey(item.commandScope, item.commandId));
    if (hasCommandId && commandAlias === undefined) {
      throw new Error("report-diagnostic-command-missing");
    }
    append(
      {
        kind: "diagnostic",
        elapsedMs: item.elapsedMs,
        code: safeDiagnosticCode(item.code),
        ...(commandAlias === undefined ? {} : { commandAlias }),
      },
      item,
      "diagnostic",
    );
  }

  ordered.sort(reportEventOrder);
  const events = Object.freeze(ordered.map(({ event }) => event));
  const durationMs = events.reduce((maximum, event) => Math.max(maximum, event.elapsedMs), 0);
  const report = {
    releaseId: evidence.releaseId,
    platform: evidence.platform,
    durationMs,
    ...(evidence.sharedMembership === undefined
      ? {}
      : { shared: Object.freeze({ membership: evidence.sharedMembership }) }),
    events,
  } satisfies GamePlayReport;
  if (!isGamePlayReport(report)) throw new Error("report-contract-invalid");
  return Object.freeze(report);
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseJsonObject(value: string, code: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error(code);
  }
  const record = object(parsed);
  if (record === null) throw new Error(code);
  return record;
}

function elapsedFromNumber(value: number, startedAtMs: number): number {
  if (!Number.isSafeInteger(value)) throw new Error("report-elapsed-invalid");
  const elapsed = value >= startedAtMs ? value - startedAtMs : value;
  if (!nonNegativeInteger(elapsed)) throw new Error("report-elapsed-invalid");
  return elapsed;
}

function elapsedFromTimestamp(value: string, startedAtMs: number): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error("report-timestamp-invalid");
  return elapsedFromNumber(timestamp, startedAtMs);
}

function stringArrayJson(value: string, code: string): readonly string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error(code);
  }
  if (
    !Array.isArray(parsed) ||
    !parsed.every((item) => typeof item === "string" && item.length > 0)
  ) {
    throw new Error(code);
  }
  return parsed;
}

type StoredTerminal = "accepted" | "no-op" | "rejected" | "invalid";

function isStoredTerminal(value: unknown): value is StoredTerminal {
  return value === "accepted" || value === "no-op" || value === "rejected" || value === "invalid";
}

function syncEvent(
  phase: string,
  disposition: string,
): Pick<SynchronizationEvent, "phase" | "disposition"> {
  if (phase === "connecting" && disposition === "started") {
    return { phase: "connecting", disposition: "scheduled" };
  }
  if (phase === "submitting" && disposition === "started") {
    return { phase: "submitting", disposition: "batch-claimed" };
  }
  if (phase === "pulling" && disposition === "started") {
    return { phase: "pulling", disposition: "scheduled" };
  }
  if (phase === "current" && disposition === "snapshot-replaced") {
    return { phase: "current", disposition: "pull-applied" };
  }
  if (
    phase === "revoked" &&
    (disposition === "snapshot-replaced" || disposition === "participant-revoked")
  ) {
    return { phase: "revoked", disposition: "membership-revoked" };
  }
  if (phase === "degraded" && disposition === "transport-failed") {
    return { phase: "degraded", disposition: "pull-failed" };
  }
  const allowedPhases: readonly SynchronizationEvent["phase"][] = [
    "offline",
    "connecting",
    "submitting",
    "pulling",
    "current",
    "degraded",
    "revoked",
  ];
  const allowedDispositions: readonly SynchronizationEvent["disposition"][] = [
    "scheduled",
    "coalesced",
    "batch-claimed",
    "submit-succeeded",
    "submit-failed",
    "pull-applied",
    "pull-failed",
    "membership-revoked",
  ];
  if (
    allowedPhases.includes(phase as SynchronizationEvent["phase"]) &&
    allowedDispositions.includes(disposition as SynchronizationEvent["disposition"])
  ) {
    return {
      phase: phase as SynchronizationEvent["phase"],
      disposition: disposition as SynchronizationEvent["disposition"],
    };
  }
  throw new Error("report-sync-event-unsupported");
}

interface ObservationRow {
  readonly observation_id: string;
  readonly availability: "available" | "permission-denied" | "unavailable" | "failed";
  readonly age_ms: number | null;
  readonly elapsed_ms: number;
}

function observationUseDisposition(observation: ObservationRow): CapabilityEvent["disposition"] {
  return observation.availability === "available" &&
    observation.age_ms !== null &&
    Number.isSafeInteger(observation.age_ms) &&
    observation.age_ms > MAXIMUM_FRESH_AGE_MS
    ? "expired"
    : observation.availability === "available"
      ? "consumed"
      : "denied";
}

async function readGamePlayReportEvidence(
  reader: ReportReader,
  runId: string,
  platform: Platform,
): Promise<GamePlayReportEvidence> {
  const run = await reader.getFirstAsync<{
    readonly release_id: GamePlayReport["releaseId"];
    readonly started_at: string;
  }>("SELECT release_id, started_at FROM runs WHERE run_id = ?", runId);
  if (run === null) throw new Error("report-run-missing");
  const startedAtMs = Date.parse(run.started_at);
  if (!Number.isFinite(startedAtMs)) throw new Error("report-run-incoherent");

  const localRows = await reader.getAllAsync<{
    readonly command_id: string;
    readonly expected_state_version: number;
    readonly result_json: string;
    readonly resulting_state_version: number;
    readonly elapsed_ms: number;
  }>(
    `SELECT command_id, expected_state_version, result_json, resulting_state_version, elapsed_ms
     FROM command_receipts WHERE run_id = ? ORDER BY elapsed_ms, command_id`,
    runId,
  );
  const commands: Array<GamePlayReportEvidence["commands"][number]> = localRows.map(
    (row, index) => {
      const result = parseJsonObject(row.result_json, "report-local-result-invalid");
      if (
        result.commandId !== row.command_id ||
        result.disposition !== "committed" ||
        !isStoredTerminal(result.terminal) ||
        result.resultingStateVersion !== row.resulting_state_version ||
        !nonNegativeInteger(row.expected_state_version) ||
        !nonNegativeInteger(row.resulting_state_version) ||
        (result.terminal === "accepted"
          ? row.resulting_state_version !== row.expected_state_version + 1
          : row.resulting_state_version !== row.expected_state_version)
      ) {
        throw new Error("report-local-result-invalid");
      }
      return {
        elapsedMs: elapsedFromNumber(row.elapsed_ms, startedAtMs),
        sourceSequence: index + 1,
        scope: "local",
        commandId: row.command_id,
        terminal: result.terminal,
        expectedStateVersion: row.expected_state_version,
        resultingStateVersion: row.resulting_state_version,
      };
    },
  );

  const observationRows = await reader.getAllAsync<ObservationRow>(
    `SELECT observation_id, availability, age_ms, elapsed_ms
     FROM observations WHERE run_id = ? ORDER BY elapsed_ms, observation_id`,
    runId,
  );
  const observations = new Map<string, ObservationRow>();
  const capabilities: Array<GamePlayReportEvidence["capabilities"][number]> = [];
  for (const [index, row] of observationRows.entries()) {
    if (observations.has(row.observation_id)) throw new Error("report-observation-duplicate");
    observations.set(row.observation_id, row);
    capabilities.push({
      elapsedMs: elapsedFromNumber(row.elapsed_ms, startedAtMs),
      sourceSequence: index + 1,
      capabilityId: FOREGROUND_LOCATION_CAPABILITY.id,
      disposition: row.availability === "available" ? "captured" : "denied",
    });
  }

  const localLinks = await reader.getAllAsync<{
    readonly command_id: string;
    readonly observation_id: string;
  }>(
    `SELECT command_id, observation_id FROM command_observations
     WHERE run_id = ? ORDER BY command_id, observation_id`,
    runId,
  );
  const localById = new Map(
    commands
      .filter((command) => command.scope === "local")
      .map((command) => [command.commandId, command]),
  );
  for (const [index, link] of localLinks.entries()) {
    const command = localById.get(link.command_id);
    const observation = observations.get(link.observation_id);
    if (command === undefined || observation === undefined) {
      throw new Error("report-observation-link-incoherent");
    }
    capabilities.push({
      elapsedMs: command.elapsedMs,
      sourceSequence: observationRows.length + index + 1,
      capabilityId: FOREGROUND_LOCATION_CAPABILITY.id,
      disposition: observationUseDisposition(observation),
    });
  }

  const lifecycle: Array<GamePlayReportEvidence["lifecycle"][number]> = [];
  const recovery: Array<GamePlayReportEvidence["recovery"][number]> = [];
  const diagnostics: Array<GamePlayReportEvidence["diagnostics"][number]> = [];
  const runEvents = await reader.getAllAsync<{
    readonly sequence: number;
    readonly elapsed_ms: number;
    readonly kind: "lifecycle" | "diagnostic";
    readonly phase: string | null;
    readonly disposition: string | null;
    readonly code: string | null;
    readonly command_id: string | null;
  }>(
    `SELECT sequence, elapsed_ms, kind, phase, disposition, code, command_id
     FROM run_events WHERE run_id = ? ORDER BY elapsed_ms, sequence`,
    runId,
  );
  for (const row of runEvents) {
    const elapsedMs = elapsedFromNumber(row.elapsed_ms, startedAtMs);
    if (
      row.kind === "lifecycle" &&
      (row.disposition === "mounted" ||
        row.disposition === "recovered" ||
        row.disposition === "unmounted" ||
        row.disposition === "mount-failed")
    ) {
      lifecycle.push({
        elapsedMs,
        sourceSequence: row.sequence,
        disposition: row.disposition,
      });
    } else if (
      (row.kind === "lifecycle" &&
        row.phase === "recovery" &&
        row.disposition === "application-restored") ||
      (row.kind === "diagnostic" && row.code === "application-restored")
    ) {
      recovery.push({ elapsedMs, sourceSequence: row.sequence, disposition: "run-restored" });
    } else if (
      row.kind === "lifecycle" &&
      row.phase === "transition" &&
      row.disposition === "interrupted"
    ) {
      diagnostics.push({
        elapsedMs,
        sourceSequence: row.sequence,
        code: "delivery-interrupted",
        ...(row.command_id === null
          ? {}
          : { commandScope: "local" as const, commandId: row.command_id }),
      });
    } else if (
      row.kind === "lifecycle" &&
      row.phase === "recovery" &&
      row.disposition === "failed"
    ) {
      diagnostics.push({
        elapsedMs,
        sourceSequence: row.sequence,
        code: "runtime-recovery-failed",
      });
    } else {
      throw new Error("report-run-event-unsupported");
    }
  }

  const session = await reader.getFirstAsync<{
    readonly session_id: string;
    readonly release_id: GamePlayReport["releaseId"];
    readonly membership_status: "active" | "revoked";
  }>(
    `SELECT session_id, release_id, membership_status
     FROM shared_sessions WHERE run_id = ?`,
    runId,
  );
  const synchronization: Array<GamePlayReportEvidence["synchronization"][number]> = [];
  if (session !== null) {
    if (session.release_id !== run.release_id) throw new Error("report-shared-release-conflict");
    const outbox = await reader.getAllAsync<{
      readonly command_id: string;
      readonly expected_state_version: number;
      readonly observation_ids_json: string;
      readonly status: "queued" | "submitting" | "blocked-revoked";
      readonly enqueued_at: string;
    }>(
      `SELECT command_id, expected_state_version, observation_ids_json, status, enqueued_at
       FROM shared_outbox WHERE session_id = ? ORDER BY enqueued_at, command_id`,
      session.session_id,
    );
    for (const [index, row] of outbox.entries()) {
      stringArrayJson(row.observation_ids_json, "report-shared-observation-links-invalid");
      commands.push({
        elapsedMs: elapsedFromTimestamp(row.enqueued_at, startedAtMs),
        sourceSequence: index + 1,
        scope: "shared",
        commandId: row.command_id,
        terminal: row.status === "blocked-revoked" ? "blocked-revoked" : "pending",
        expectedStateVersion: row.expected_state_version,
      });
    }

    const sharedResults = await reader.getAllAsync<{
      readonly command_id: string;
      readonly terminal: StoredTerminal;
      readonly resulting_state_version: number;
      readonly expected_state_version: number;
      readonly observation_ids_json: string;
      readonly decision_position: string;
      readonly decided_at: string;
    }>(
      `SELECT command_id, terminal, resulting_state_version, expected_state_version,
              observation_ids_json, decision_position, decided_at
       FROM shared_results WHERE session_id = ?
       ORDER BY CAST(decision_position AS INTEGER), command_id`,
      session.session_id,
    );
    for (const [index, row] of sharedResults.entries()) {
      if (
        !isStoredTerminal(row.terminal) ||
        !nonNegativeInteger(row.expected_state_version) ||
        !nonNegativeInteger(row.resulting_state_version) ||
        (row.terminal === "accepted"
          ? row.resulting_state_version !== row.expected_state_version + 1
          : row.resulting_state_version !== row.expected_state_version)
      ) {
        throw new Error("report-shared-result-invalid");
      }
      const elapsedMs = elapsedFromTimestamp(row.decided_at, startedAtMs);
      commands.push({
        elapsedMs,
        sourceSequence: outbox.length + index + 1,
        scope: "shared",
        commandId: row.command_id,
        terminal: row.terminal,
        expectedStateVersion: row.expected_state_version,
        resultingStateVersion: row.resulting_state_version,
      });
      const observationIds = stringArrayJson(
        row.observation_ids_json,
        "report-shared-observation-links-invalid",
      );
      for (const [observationIndex, observationId] of observationIds.entries()) {
        const observation = observations.get(observationId);
        if (observation === undefined) throw new Error("report-shared-observation-missing");
        capabilities.push({
          elapsedMs,
          sourceSequence:
            observationRows.length + localLinks.length + index * 1_000 + observationIndex + 1,
          capabilityId: FOREGROUND_LOCATION_CAPABILITY.id,
          disposition: observationUseDisposition(observation),
        });
      }
    }

    const syncRows = await reader.getAllAsync<{
      readonly sequence: number;
      readonly elapsed_ms: number;
      readonly phase: string;
      readonly disposition: string;
      readonly command_id: string | null;
    }>(
      `SELECT sequence, elapsed_ms, phase, disposition, command_id
       FROM shared_sync_events WHERE session_id = ? ORDER BY sequence`,
      session.session_id,
    );
    for (const row of syncRows) {
      const mapped = syncEvent(row.phase, row.disposition);
      synchronization.push({
        elapsedMs: elapsedFromNumber(row.elapsed_ms, startedAtMs),
        sourceSequence: row.sequence,
        ...mapped,
      });
      if (row.disposition === "snapshot-replaced") {
        recovery.push({
          elapsedMs: elapsedFromNumber(row.elapsed_ms, startedAtMs),
          sourceSequence: row.sequence,
          disposition: "snapshot-replaced",
        });
      }
    }
  }

  return {
    releaseId: run.release_id,
    platform,
    ...(session === null ? {} : { sharedMembership: session.membership_status }),
    lifecycle,
    commands,
    capabilities,
    synchronization,
    recovery,
    diagnostics,
  };
}

export async function createGamePlayReport(
  database: GamePlayReportDatabase,
  runId: string,
  platform: Platform,
): Promise<GamePlayReport> {
  const raw = database.raw();
  let evidence: GamePlayReportEvidence | undefined;
  if (raw.withExclusiveTransactionAsync === undefined) {
    evidence = await readGamePlayReportEvidence(raw, runId, platform);
  } else {
    await raw.withExclusiveTransactionAsync(async (transaction) => {
      evidence = await readGamePlayReportEvidence(transaction, runId, platform);
    });
  }
  if (evidence === undefined) throw new Error("report-transaction-result-missing");
  return buildGamePlayReport(evidence);
}
