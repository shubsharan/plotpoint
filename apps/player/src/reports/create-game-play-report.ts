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

function synchronizationEvidence(
  phase: unknown,
  disposition: unknown,
): Pick<SynchronizationEvent, "phase" | "disposition"> | null {
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
  return typeof phase === "string" &&
    typeof disposition === "string" &&
    allowedPhases.includes(phase as SynchronizationEvent["phase"]) &&
    allowedDispositions.includes(disposition as SynchronizationEvent["disposition"])
    ? {
        phase: phase as SynchronizationEvent["phase"],
        disposition: disposition as SynchronizationEvent["disposition"],
      }
    : null;
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
  if (!Number.isFinite(Date.parse(run.started_at))) throw new Error("report-run-incoherent");

  const lifecycle: Array<GamePlayReportEvidence["lifecycle"][number]> = [];
  const commands: Array<GamePlayReportEvidence["commands"][number]> = [];
  const capabilities: Array<GamePlayReportEvidence["capabilities"][number]> = [];
  const synchronization: Array<GamePlayReportEvidence["synchronization"][number]> = [];
  const recovery: Array<GamePlayReportEvidence["recovery"][number]> = [];
  const diagnostics: Array<GamePlayReportEvidence["diagnostics"][number]> = [];
  const rows = await reader.getAllAsync<{
    readonly sequence: number;
    readonly elapsed_ms: number;
    readonly kind: string;
    readonly command_id: string | null;
    readonly evidence_json: string;
  }>(
    `SELECT sequence,elapsed_ms,kind,command_id,evidence_json
     FROM game_play_events WHERE run_id=? ORDER BY sequence`,
    runId,
  );
  for (const row of rows) {
    if (!nonNegativeInteger(row.elapsed_ms)) throw new Error("report-elapsed-invalid");
    const elapsedMs = row.elapsed_ms;
    const value = parseJsonObject(row.evidence_json, "report-ledger-evidence-invalid");
    const ordered = { elapsedMs, sourceSequence: row.sequence };
    if (row.kind === "lifecycle" && typeof value.disposition === "string") {
      lifecycle.push({
        ...ordered,
        disposition: value.disposition as LifecycleEvent["disposition"],
      });
    } else if (
      row.kind === "command" &&
      row.command_id !== null &&
      (value.scope === "local" || value.scope === "shared") &&
      typeof value.terminal === "string" &&
      nonNegativeInteger(value.expectedStateVersion) &&
      (value.resultingStateVersion === undefined || nonNegativeInteger(value.resultingStateVersion))
    ) {
      commands.push({
        ...ordered,
        scope: value.scope,
        commandId: row.command_id,
        terminal: value.terminal as CommandEvent["terminal"],
        expectedStateVersion: value.expectedStateVersion,
        ...(value.resultingStateVersion === undefined
          ? {}
          : { resultingStateVersion: value.resultingStateVersion }),
      });
    } else if (
      row.kind === "capability" &&
      typeof value.capabilityId === "string" &&
      typeof value.disposition === "string"
    ) {
      capabilities.push({
        ...ordered,
        capabilityId: value.capabilityId,
        disposition: value.disposition as CapabilityEvent["disposition"],
      });
    } else if (row.kind === "synchronization") {
      const event = synchronizationEvidence(value.phase, value.disposition);
      if (event === null) throw new Error("report-ledger-evidence-invalid");
      synchronization.push({ ...ordered, ...event });
    } else if (row.kind === "recovery" && typeof value.disposition === "string") {
      recovery.push({ ...ordered, disposition: value.disposition as RecoveryEvent["disposition"] });
    } else if (row.kind === "diagnostic" && typeof value.code === "string") {
      diagnostics.push({
        ...ordered,
        code: value.code,
        ...(row.command_id === null
          ? {}
          : {
              commandScope: value.scope === "shared" ? ("shared" as const) : ("local" as const),
              commandId: row.command_id,
            }),
      });
    } else throw new Error("report-ledger-evidence-invalid");
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
  if (session !== null) {
    if (session.release_id !== run.release_id) throw new Error("report-shared-release-conflict");
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
