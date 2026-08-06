import {
  HOST_BRIDGE_VERSION,
  openRelease,
  parseHostBridgeEnvelope,
  verifyRelease,
  type CanonicalJsonObject,
  type ReleaseId,
  type ReleaseManifest,
} from "@plotpoint/protocol";
import { canonicalizeValue } from "@plotpoint/runtime";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";

import type { PlayerDatabase } from "../persistence/database";
import { validateCandidateTransition } from "../persistence/validation";
import type { RunRecord } from "../model";
import type { CandidateTransition, DurableCommandRecord, DurableTransitionResult } from "../model";

export interface RecoveryBootstrap {
  readonly runId: string;
  readonly releaseId: ReleaseId;
  readonly startedAt: string;
  readonly aggregate: {
    readonly modelId: string;
    readonly aggregateId: string;
    readonly aggregateKind: "player";
    readonly schemaId: string;
    readonly state: CanonicalJsonObject;
    readonly stateVersion: number;
    readonly progression?: import("@plotpoint/protocol").ProgressionInstance;
  } | null;
}

export interface RecoverySnapshotRow {
  readonly model_id: string;
  readonly aggregate_id: string;
  readonly aggregate_kind: string;
  readonly schema_id: string;
  readonly state_version: number;
  readonly state_json: string;
  readonly progression_json: string | null;
  readonly journal_position: number;
}

export interface RecoveryJournalRow {
  readonly sequence: number;
  readonly command_id: string;
  readonly record_json: string;
}

export interface RecoveryReceiptRow {
  readonly command_id: string;
  readonly expected_state_version: number;
  readonly candidate_json: string;
  readonly result_json: string;
  readonly resulting_state_version: number;
}

export interface RecoveryObservationLinkRow {
  readonly command_id: string;
  readonly observation_id: string;
  readonly observation_exists: number;
}

export interface RecoveryRecords {
  readonly snapshot: RecoverySnapshotRow | null;
  readonly journals: readonly RecoveryJournalRow[];
  readonly receipts: readonly RecoveryReceiptRow[];
  readonly observationLinks: readonly RecoveryObservationLinkRow[];
}

export type RecoveryRecordsResult =
  | { readonly kind: "valid"; readonly aggregate: RecoveryBootstrap["aggregate"] }
  | { readonly kind: "invalid"; readonly code: string };

export type RecoveryStateValidator = (input: {
  readonly schemaId: string;
  readonly state: CanonicalJsonObject;
}) => boolean;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  return (
    actual.length === expected.length && actual.every((field, index) => field === expected[index])
  );
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseRecoveryCandidate(value: string): CandidateTransition | null {
  const validated = validateCandidateTransition(parseJson(value));
  return validated.kind === "valid" ? validated.candidate : null;
}

function parseRecoveryResult(value: string): DurableTransitionResult | null {
  const parsed = parseHostBridgeEnvelope(
    {
      version: HOST_BRIDGE_VERSION,
      requestId: "recovery",
      type: "transition.result",
      payload: parseJson(value),
    },
    "host-to-web",
  );
  return parsed.kind === "valid" && parsed.envelope.type === "transition.result"
    ? parsed.envelope.payload
    : null;
}

function canonicalEqual(left: unknown, right: unknown): boolean {
  const leftCanonical = canonicalizeValue(left);
  const rightCanonical = canonicalizeValue(right);
  return (
    leftCanonical.kind === "valid" &&
    rightCanonical.kind === "valid" &&
    JSON.stringify(leftCanonical.canonical.value) === JSON.stringify(rightCanonical.canonical.value)
  );
}

function parseRecoveryCommandRecord(value: string): DurableCommandRecord | null {
  const parsed = parseJson(value);
  if (!isPlainObject(parsed) || !hasExactFields(parsed, ["candidate", "result"])) return null;
  const candidate = validateCandidateTransition(parsed.candidate);
  const result = parseRecoveryResult(JSON.stringify(parsed.result));
  return candidate.kind === "valid" && result !== null
    ? { candidate: candidate.candidate, result }
    : null;
}

function parsedObject(value: string): CanonicalJsonObject | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const canonical = canonicalizeValue(parsed);
    return canonical.kind === "valid" && !Array.isArray(canonical.canonical.value)
      ? (canonical.canonical.value as CanonicalJsonObject)
      : null;
  } catch {
    return null;
  }
}

export function isRecoverableSnapshotState(value: unknown): value is CanonicalJsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const canonical = canonicalizeValue(value);
  return canonical.kind === "valid" && !Array.isArray(canonical.canonical.value);
}

export async function verifyRecoveryArtifact(input: {
  readonly bytes: Uint8Array;
  readonly expectedReleaseId: ReleaseId;
  readonly manifestJson: string;
}): Promise<
  | {
      readonly kind: "valid";
      readonly manifest: ReleaseManifest;
      readonly validateState: RecoveryStateValidator;
    }
  | { readonly kind: "invalid"; readonly code: string }
> {
  const verified = await verifyRelease({
    bytes: input.bytes,
    expectedReleaseId: input.expectedReleaseId,
  });
  if (verified.kind === "invalid") {
    return {
      kind: "invalid",
      code: verified.diagnostics[0]?.code ?? "recovery-release-invalid",
    };
  }
  try {
    const storedManifest = JSON.parse(input.manifestJson) as unknown;
    if (JSON.stringify(storedManifest) !== JSON.stringify(verified.manifest)) {
      return { kind: "invalid", code: "recovery-manifest-mismatch" };
    }
  } catch {
    return { kind: "invalid", code: "recovery-manifest-invalid" };
  }
  const opened = await openRelease(input.bytes);
  if (opened.kind === "invalid") return { kind: "invalid", code: "recovery-release-open-invalid" };
  try {
    const decoder = new TextDecoder();
    const validators = new Map<string, ValidateFunction>();
    for (const requirement of opened.manifest.aggregateSchemas) {
      const entry = opened.entries.find(({ path }) => path === requirement.path);
      if (entry === undefined) {
        return { kind: "invalid", code: "recovery-aggregate-schema-missing" };
      }
      if (validators.has(requirement.id)) {
        return { kind: "invalid", code: "recovery-aggregate-schema-duplicate" };
      }
      validators.set(
        requirement.id,
        new Ajv2020({ allErrors: true, strict: true }).compile(
          JSON.parse(decoder.decode(entry.bytes)) as object,
        ),
      );
    }
    return {
      kind: "valid",
      manifest: verified.manifest,
      validateState: ({ schemaId, state }) => validators.get(schemaId)?.(state) === true,
    };
  } catch {
    return { kind: "invalid", code: "recovery-aggregate-schema-invalid" };
  }
}

export function validateRecoveryRecords(
  manifest: ReleaseManifest,
  records: RecoveryRecords,
  validateState: RecoveryStateValidator,
): RecoveryRecordsResult {
  if (records.snapshot === null) {
    return records.journals.length === 0 &&
      records.receipts.length === 0 &&
      records.observationLinks.length === 0
      ? { kind: "valid", aggregate: null }
      : { kind: "invalid", code: "recovery-records-without-snapshot" };
  }

  const snapshot = records.snapshot;
  if (
    !hasExactFields(snapshot as unknown as Record<string, unknown>, [
      "aggregate_id",
      "aggregate_kind",
      "journal_position",
      "model_id",
      "progression_json",
      "schema_id",
      "state_json",
      "state_version",
    ]) ||
    records.journals.some(
      (journal) =>
        !hasExactFields(journal as unknown as Record<string, unknown>, [
          "command_id",
          "record_json",
          "sequence",
        ]),
    ) ||
    records.receipts.some(
      (receipt) =>
        !hasExactFields(receipt as unknown as Record<string, unknown>, [
          "candidate_json",
          "command_id",
          "expected_state_version",
          "result_json",
          "resulting_state_version",
        ]),
    ) ||
    records.observationLinks.some(
      (link) =>
        !hasExactFields(link as unknown as Record<string, unknown>, [
          "command_id",
          "observation_exists",
          "observation_id",
        ]),
    )
  ) {
    return { kind: "invalid", code: "recovery-record-shape-invalid" };
  }
  const state = parsedObject(snapshot.state_json);
  const progression =
    snapshot.progression_json === null ? undefined : parseJson(snapshot.progression_json);
  if (
    state === null ||
    snapshot.model_id.length === 0 ||
    snapshot.aggregate_id.length === 0 ||
    snapshot.aggregate_kind !== "player" ||
    (snapshot.progression_json !== null && progression === null) ||
    !Number.isSafeInteger(snapshot.state_version) ||
    snapshot.state_version < 0 ||
    !Number.isSafeInteger(snapshot.journal_position) ||
    snapshot.journal_position < 0
  ) {
    return { kind: "invalid", code: "recovery-snapshot-invalid" };
  }

  const schema = manifest.aggregateSchemas.find(
    (requirement) =>
      requirement.kind === snapshot.aggregate_kind && requirement.id === snapshot.schema_id,
  );
  if (schema === undefined) {
    return { kind: "invalid", code: "recovery-snapshot-schema-mismatch" };
  }
  if (!validateState({ schemaId: snapshot.schema_id, state })) {
    return { kind: "invalid", code: "recovery-snapshot-state-schema-invalid" };
  }
  const bootstrapEnvelope = parseHostBridgeEnvelope(
    {
      version: HOST_BRIDGE_VERSION,
      requestId: "recovery",
      type: "runtime.bootstrap",
      payload: {
        runId: "recovery",
        releaseId: `sha256:${"0".repeat(64)}`,
        aggregate: {
          modelId: snapshot.model_id,
          aggregateId: snapshot.aggregate_id,
          aggregateKind: snapshot.aggregate_kind,
          schemaId: snapshot.schema_id,
          stateVersion: snapshot.state_version,
          state,
          ...(progression === undefined ? {} : { progression }),
        },
      },
    },
    "host-to-web",
  );
  if (
    bootstrapEnvelope.kind === "invalid" ||
    bootstrapEnvelope.envelope.type !== "runtime.bootstrap"
  ) {
    return { kind: "invalid", code: "recovery-snapshot-invalid" };
  }
  if (
    snapshot.journal_position !== records.journals.length ||
    snapshot.state_version !== snapshot.journal_position
  ) {
    return { kind: "invalid", code: "recovery-journal-position-mismatch" };
  }

  const receipts = new Map(records.receipts.map((receipt) => [receipt.command_id, receipt]));
  if (receipts.size !== records.receipts.length) {
    return { kind: "invalid", code: "recovery-receipt-duplicate" };
  }
  const parsedReceipts = new Map<
    string,
    { readonly candidate: CandidateTransition; readonly result: DurableTransitionResult }
  >();
  const acceptedCommands = new Set<string>();
  for (const receipt of records.receipts) {
    const candidate = parseRecoveryCandidate(receipt.candidate_json);
    const result = parseRecoveryResult(receipt.result_json);
    if (
      candidate === null ||
      result === null ||
      candidate.commandId !== receipt.command_id ||
      result.commandId !== receipt.command_id ||
      candidate.expectedStateVersion !== receipt.expected_state_version ||
      result.resultingStateVersion !== receipt.resulting_state_version ||
      result.disposition !== "committed" ||
      candidate.terminal !== result.terminal ||
      candidate.modelId !== snapshot.model_id ||
      candidate.target.aggregateKind !== "player" ||
      candidate.target.aggregateId !== snapshot.aggregate_id ||
      candidate.target.schemaId !== snapshot.schema_id ||
      receipt.resulting_state_version !==
        receipt.expected_state_version + (candidate.terminal === "accepted" ? 1 : 0) ||
      (candidate.terminal === "invalid"
        ? result.terminal !== "invalid" ||
          !canonicalEqual(candidate.diagnosticCodes, result.diagnosticCodes)
        : result.terminal === "invalid" || !canonicalEqual(candidate.outcome, result.outcome))
    ) {
      return { kind: "invalid", code: "recovery-receipt-invalid" };
    }
    parsedReceipts.set(receipt.command_id, { candidate, result });
    if (candidate.terminal === "accepted") acceptedCommands.add(receipt.command_id);

    const durableLinks = records.observationLinks
      .filter((link) => link.command_id === receipt.command_id)
      .map((link) => link.observation_id)
      .sort();
    const claimedLinks = [...candidate.observationIds].sort();
    if (
      durableLinks.length !== claimedLinks.length ||
      durableLinks.some((id, index) => id !== claimedLinks[index])
    ) {
      return { kind: "invalid", code: "recovery-observation-link-mismatch" };
    }
  }
  if (
    records.observationLinks.some(
      (link) => link.observation_exists !== 1 || !receipts.has(link.command_id),
    )
  ) {
    return { kind: "invalid", code: "recovery-observation-link-invalid" };
  }
  if (acceptedCommands.size !== records.journals.length) {
    return { kind: "invalid", code: "recovery-journal-receipt-mismatch" };
  }

  for (const [index, journal] of records.journals.entries()) {
    const sequence = index + 1;
    const receipt = receipts.get(journal.command_id);
    if (
      journal.sequence !== sequence ||
      receipt === undefined ||
      receipt.expected_state_version !== sequence - 1 ||
      receipt.resulting_state_version !== sequence
    ) {
      return { kind: "invalid", code: "recovery-journal-receipt-mismatch" };
    }
    const receiptRecord = parsedReceipts.get(journal.command_id);
    const journalRecord = parseRecoveryCommandRecord(journal.record_json);
    if (
      receiptRecord === undefined ||
      journalRecord === null ||
      receiptRecord.candidate.terminal !== "accepted" ||
      !canonicalEqual(journalRecord, receiptRecord)
    ) {
      return { kind: "invalid", code: "recovery-journal-receipt-mismatch" };
    }
  }

  return {
    kind: "valid",
    aggregate: {
      modelId: snapshot.model_id,
      aggregateId: snapshot.aggregate_id,
      aggregateKind: "player",
      schemaId: snapshot.schema_id,
      state,
      stateVersion: snapshot.state_version,
      ...(bootstrapEnvelope.envelope.payload.aggregate.progression === undefined
        ? {}
        : { progression: bootstrapEnvelope.envelope.payload.aggregate.progression }),
    },
  };
}

async function failClosed(database: PlayerDatabase, runId: string, code: string): Promise<never> {
  await database.raw().runAsync("UPDATE runs SET status = 'invalid' WHERE run_id = ?", runId);
  await database.recordRunEvent(runId, {
    kind: "lifecycle",
    elapsedMs: 0,
    phase: "recovery",
    disposition: "failed",
    diagnosticCode: code,
  });
  throw new Error(code);
}

export async function recoverRun(
  database: PlayerDatabase,
  run: Pick<RunRecord, "runId" | "releaseId" | "startedAt"> & Partial<Pick<RunRecord, "status">>,
  options: {
    readonly recordRestore?: boolean;
    readonly readArtifact: (uri: string) => Promise<Uint8Array>;
  },
): Promise<RecoveryBootstrap | null> {
  if (run.status === "invalid") return null;
  const installation = await database.installedRelease(run.releaseId);
  if (installation === null) return failClosed(database, run.runId, "recovery-release-missing");

  let artifact: Awaited<ReturnType<typeof verifyRecoveryArtifact>>;
  try {
    artifact = await verifyRecoveryArtifact({
      bytes: await options.readArtifact(installation.artifactUri),
      expectedReleaseId: run.releaseId,
      manifestJson: installation.manifestJson,
    });
  } catch {
    return failClosed(database, run.runId, "recovery-release-unreadable");
  }
  if (artifact.kind === "invalid") return failClosed(database, run.runId, artifact.code);

  const transaction = database.raw();
  const records: RecoveryRecords = {
    snapshot: await transaction.getFirstAsync<RecoverySnapshotRow>(
      `SELECT model_id, aggregate_id, aggregate_kind, schema_id, state_version,
              state_json, progression_json, journal_position FROM snapshots WHERE run_id = ?`,
      run.runId,
    ),
    journals: await transaction.getAllAsync<RecoveryJournalRow>(
      `SELECT sequence, command_id, record_json
       FROM journal WHERE run_id = ? ORDER BY sequence`,
      run.runId,
    ),
    receipts: await transaction.getAllAsync<RecoveryReceiptRow>(
      `SELECT command_id, expected_state_version, candidate_json, result_json,
              resulting_state_version
       FROM command_receipts WHERE run_id = ?`,
      run.runId,
    ),
    observationLinks: await transaction.getAllAsync<RecoveryObservationLinkRow>(
      `SELECT links.command_id, links.observation_id,
              CASE WHEN observations.observation_id IS NULL THEN 0 ELSE 1 END AS observation_exists
       FROM command_observations AS links
       LEFT JOIN observations ON observations.run_id = links.run_id
        AND observations.observation_id = links.observation_id
       WHERE links.run_id = ?`,
      run.runId,
    ),
  };
  const recovered = validateRecoveryRecords(artifact.manifest, records, artifact.validateState);
  if (recovered.kind === "invalid") return failClosed(database, run.runId, recovered.code);

  if (options.recordRestore === true) {
    await database.recordRecoveryEvent(
      run.runId,
      "application-restored",
      Date.now() - Date.parse(run.startedAt),
    );
  }
  return {
    runId: run.runId,
    releaseId: run.releaseId,
    startedAt: run.startedAt,
    aggregate: recovered.aggregate,
  };
}

export async function recoverLatestRun(
  database: PlayerDatabase,
  options: {
    readonly recordRestore?: boolean;
    readonly readArtifact: (uri: string) => Promise<Uint8Array>;
  },
): Promise<RecoveryBootstrap | null> {
  const run = await database.latestRun();
  return run === null ? null : recoverRun(database, run, options);
}
