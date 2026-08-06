import type { GamePlayReportEvent } from "@plotpoint/protocol";

type CommandEvent = Extract<GamePlayReportEvent, { readonly kind: "command" }>;
type CapabilityEvent = Extract<GamePlayReportEvent, { readonly kind: "capability" }>;
type SynchronizationEvent = Extract<GamePlayReportEvent, { readonly kind: "synchronization" }>;
type RecoveryEvent = Extract<GamePlayReportEvent, { readonly kind: "recovery" }>;
type LifecycleEvent = Extract<GamePlayReportEvent, { readonly kind: "lifecycle" }>;

export type GameplayEvidence =
  | {
      readonly kind: "command";
      readonly commandId: string;
      readonly scope: CommandEvent["scope"];
      readonly terminal: CommandEvent["terminal"];
      readonly expectedStateVersion: number;
      readonly resultingStateVersion?: number;
    }
  | {
      readonly kind: "capability";
      readonly commandId?: string;
      readonly observationId?: string;
      readonly capabilityId: string;
      readonly disposition: CapabilityEvent["disposition"];
    }
  | {
      readonly kind: "synchronization";
      readonly commandId?: string;
      readonly phase: SynchronizationEvent["phase"];
      readonly disposition: SynchronizationEvent["disposition"];
    }
  | { readonly kind: "recovery"; readonly disposition: RecoveryEvent["disposition"] }
  | { readonly kind: "lifecycle"; readonly disposition: LifecycleEvent["disposition"] }
  | {
      readonly kind: "diagnostic";
      readonly commandId?: string;
      readonly scope: "local" | "shared";
      readonly code: string;
    };

export const GAMEPLAY_LEDGER_MIGRATION = `
CREATE TABLE IF NOT EXISTS game_play_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(run_id), committed_at TEXT NOT NULL,
  elapsed_ms INTEGER NOT NULL, kind TEXT NOT NULL,
  command_id TEXT, evidence_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS game_play_events_run ON game_play_events(run_id, sequence);
CREATE TRIGGER IF NOT EXISTS game_play_events_no_update
BEFORE UPDATE ON game_play_events BEGIN
  SELECT RAISE(ABORT, 'game-play-evidence-immutable');
END;
CREATE TRIGGER IF NOT EXISTS game_play_events_no_delete
BEFORE DELETE ON game_play_events BEGIN
  SELECT RAISE(ABORT, 'game-play-evidence-immutable');
END;
`;

export const GAMEPLAY_LEDGER_COLUMNS = Object.freeze([
  "sequence",
  "run_id",
  "committed_at",
  "elapsed_ms",
  "kind",
  "command_id",
  "evidence_json",
] as const);

export const GAMEPLAY_LEDGER_TRIGGERS = Object.freeze([
  "game_play_events_no_delete",
  "game_play_events_no_update",
] as const);

export interface GameplayEvidenceDatabase {
  runAsync(query: string, ...parameters: unknown[]): Promise<unknown>;
  getFirstAsync<T>(query: string, ...parameters: unknown[]): Promise<T | null>;
}

function eventValue(evidence: GameplayEvidence): Readonly<Record<string, unknown>> {
  const value: Record<string, unknown> = { ...evidence };
  Reflect.deleteProperty(value, "kind");
  Reflect.deleteProperty(value, "commandId");
  return value;
}

export async function appendGameplayEvidence(
  database: GameplayEvidenceDatabase,
  input: {
    readonly runId: string;
    readonly evidence: GameplayEvidence;
    readonly timing?: { readonly committedAt?: string; readonly elapsedMs: number };
    readonly now?: () => Date;
  },
): Promise<void> {
  let timing = input.timing;
  if (timing === undefined || timing.committedAt === undefined) {
    const run = await database.getFirstAsync<{ readonly started_at: string }>(
      "SELECT started_at FROM runs WHERE run_id=?",
      input.runId,
    );
    if (run === null) throw new Error("gameplay-evidence-run-missing");
    const startedAtMs = Date.parse(run.started_at);
    const now = timing === undefined ? (input.now ?? (() => new Date()))() : undefined;
    const committedAtMs = timing === undefined ? now!.getTime() : startedAtMs + timing.elapsedMs;
    if (!Number.isFinite(startedAtMs) || !Number.isFinite(committedAtMs)) {
      throw new Error("gameplay-evidence-time-invalid");
    }
    timing = {
      committedAt: new Date(committedAtMs).toISOString(),
      elapsedMs: timing?.elapsedMs ?? Math.max(0, committedAtMs - startedAtMs),
    };
  }
  const committedAt = timing.committedAt;
  if (
    !Number.isSafeInteger(timing.elapsedMs) ||
    timing.elapsedMs < 0 ||
    committedAt === undefined ||
    !Number.isFinite(Date.parse(committedAt))
  ) {
    throw new Error("gameplay-evidence-time-invalid");
  }
  await database.runAsync(
    `INSERT INTO game_play_events
     (run_id,committed_at,elapsed_ms,kind,command_id,evidence_json)
     VALUES (?,?,?,?,?,?)`,
    input.runId,
    committedAt,
    timing.elapsedMs,
    input.evidence.kind,
    "commandId" in input.evidence ? (input.evidence.commandId ?? null) : null,
    JSON.stringify(eventValue(input.evidence)),
  );
}
