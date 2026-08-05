import {
  openRelease,
  verifyRelease,
  type CanonicalJsonObject,
  type ReleaseId,
  type ReleaseManifest,
} from "@plotpoint/protocol";
import { canonicalizeValue } from "@plotpoint/runtime";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";

import type { PlayerDatabase } from "../persistence/database";
import type { RunRecord } from "../model";

export interface RecoveryBootstrap {
  readonly runId: string;
  readonly releaseId: ReleaseId;
  readonly startedAt: string;
  readonly aggregate: {
    readonly aggregateId: string;
    readonly aggregateKind: "player";
    readonly schemaId: string;
    readonly schemaVersion: number;
    readonly state: CanonicalJsonObject;
    readonly stateVersion: number;
  } | null;
}

export interface RecoverySnapshotRow {
  readonly aggregate_id: string;
  readonly aggregate_kind: string;
  readonly schema_id: string;
  readonly schema_version: number;
  readonly state_version: number;
  readonly state_json: string;
  readonly journal_position: number;
}

export interface RecoveryJournalRow {
  readonly sequence: number;
  readonly command_id: string;
  readonly outcome_json: string;
  readonly progression_json: string;
}

export interface RecoveryReceiptRow {
  readonly command_id: string;
  readonly expected_version: number;
  readonly result_json: string;
  readonly resulting_version: number;
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
  readonly schemaVersion: number;
  readonly state: CanonicalJsonObject;
}) => boolean;

interface RecoveryReceiptResult {
  readonly kind: "accepted";
  readonly commandId: string;
  readonly commandOutcome: "accepted" | "no-op" | "rejected" | "invalid";
  readonly aggregateId: string;
  readonly aggregateKind: "player";
  readonly schemaId: string;
  readonly schemaVersion: number;
  readonly expectedVersion: number;
  readonly resultingVersion: number;
  readonly observationIds: readonly string[];
  readonly outcome?: CanonicalJsonObject;
  readonly diagnosticCodes?: readonly string[];
}

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

function parseRecoveryReceiptResult(value: string): RecoveryReceiptResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) return null;
  const commandOutcome = parsed.commandOutcome;
  if (
    commandOutcome !== "accepted" &&
    commandOutcome !== "no-op" &&
    commandOutcome !== "rejected" &&
    commandOutcome !== "invalid"
  ) {
    return null;
  }
  const terminalField = commandOutcome === "invalid" ? "diagnosticCodes" : "outcome";
  if (
    !hasExactFields(parsed, [
      "aggregateId",
      "aggregateKind",
      "commandId",
      "commandOutcome",
      "expectedVersion",
      terminalField,
      "kind",
      "observationIds",
      "resultingVersion",
      "schemaId",
      "schemaVersion",
    ]) ||
    parsed.kind !== "accepted" ||
    typeof parsed.commandId !== "string" ||
    parsed.commandId.length === 0 ||
    typeof parsed.aggregateId !== "string" ||
    parsed.aggregateId.length === 0 ||
    parsed.aggregateKind !== "player" ||
    typeof parsed.schemaId !== "string" ||
    parsed.schemaId.length === 0 ||
    !Number.isSafeInteger(parsed.schemaVersion) ||
    (parsed.schemaVersion as number) < 1 ||
    !Number.isSafeInteger(parsed.expectedVersion) ||
    (parsed.expectedVersion as number) < 0 ||
    !Number.isSafeInteger(parsed.resultingVersion) ||
    (parsed.resultingVersion as number) < 0 ||
    !Array.isArray(parsed.observationIds) ||
    !parsed.observationIds.every((id) => typeof id === "string" && id.length > 0) ||
    new Set(parsed.observationIds).size !== parsed.observationIds.length
  ) {
    return null;
  }
  if (commandOutcome === "invalid") {
    if (
      !Array.isArray(parsed.diagnosticCodes) ||
      !parsed.diagnosticCodes.every((code) => typeof code === "string" && code.length > 0)
    ) {
      return null;
    }
  } else if (!isPlainObject(parsed.outcome) || canonicalizeValue(parsed.outcome).kind !== "valid") {
    return null;
  }
  return parsed as unknown as RecoveryReceiptResult;
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
      validators.set(
        `${requirement.id}\0${requirement.version}`,
        new Ajv2020({ allErrors: true, strict: true }).compile(
          JSON.parse(decoder.decode(entry.bytes)) as object,
        ),
      );
    }
    return {
      kind: "valid",
      manifest: verified.manifest,
      validateState: ({ schemaId, schemaVersion, state }) =>
        validators.get(`${schemaId}\0${schemaVersion}`)?.(state) === true,
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
  const state = parsedObject(snapshot.state_json);
  if (
    state === null ||
    snapshot.aggregate_id.length === 0 ||
    snapshot.aggregate_kind !== "player" ||
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
  if (schema === undefined || schema.version !== snapshot.schema_version) {
    return { kind: "invalid", code: "recovery-snapshot-schema-mismatch" };
  }
  if (
    !validateState({
      schemaId: snapshot.schema_id,
      schemaVersion: snapshot.schema_version,
      state,
    })
  ) {
    return { kind: "invalid", code: "recovery-snapshot-state-schema-invalid" };
  }
  if (
    snapshot.journal_position !== records.journals.length ||
    snapshot.state_version !== snapshot.journal_position
  ) {
    return { kind: "invalid", code: "recovery-journal-position-mismatch" };
  }

  const receipts = new Map(records.receipts.map((receipt) => [receipt.command_id, receipt]));
  const acceptedCommands = new Set<string>();
  for (const receipt of records.receipts) {
    const result = parseRecoveryReceiptResult(receipt.result_json);
    if (
      result === null ||
      result.commandId !== receipt.command_id ||
      result.expectedVersion !== receipt.expected_version ||
      result.resultingVersion !== receipt.resulting_version ||
      result.aggregateKind !== "player" ||
      result.aggregateId !== snapshot.aggregate_id ||
      result.schemaId !== snapshot.schema_id ||
      result.schemaVersion !== snapshot.schema_version ||
      receipt.resulting_version !==
        receipt.expected_version + (result.commandOutcome === "accepted" ? 1 : 0)
    ) {
      return { kind: "invalid", code: "recovery-receipt-invalid" };
    }
    if (result.commandOutcome === "accepted") acceptedCommands.add(receipt.command_id);

    const durableLinks = records.observationLinks
      .filter((link) => link.command_id === receipt.command_id)
      .map((link) => link.observation_id)
      .sort();
    const claimedLinks = [...result.observationIds].sort();
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
      receipt.expected_version !== sequence - 1 ||
      receipt.resulting_version !== sequence
    ) {
      return { kind: "invalid", code: "recovery-journal-receipt-mismatch" };
    }
    const result = parseRecoveryReceiptResult(receipt.result_json);
    if (result === null) return { kind: "invalid", code: "recovery-receipt-invalid" };
    if (result.commandOutcome !== "accepted") {
      return { kind: "invalid", code: "recovery-journal-receipt-mismatch" };
    }
    try {
      const outcome = parsedObject(journal.outcome_json);
      const progression = JSON.parse(journal.progression_json) as unknown;
      if (
        outcome === null ||
        JSON.stringify(outcome) !== JSON.stringify(result.outcome) ||
        !Array.isArray(progression) ||
        !progression.every((change) => typeof change === "string")
      ) {
        return { kind: "invalid", code: "recovery-journal-payload-invalid" };
      }
    } catch {
      return { kind: "invalid", code: "recovery-journal-payload-invalid" };
    }
  }

  return {
    kind: "valid",
    aggregate: {
      aggregateId: snapshot.aggregate_id,
      aggregateKind: "player",
      schemaId: snapshot.schema_id,
      schemaVersion: snapshot.schema_version,
      state,
      stateVersion: snapshot.state_version,
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
      `SELECT aggregate_id, aggregate_kind, schema_id, schema_version, state_version,
              state_json, journal_position FROM snapshots WHERE run_id = ?`,
      run.runId,
    ),
    journals: await transaction.getAllAsync<RecoveryJournalRow>(
      `SELECT sequence, command_id, outcome_json, progression_json
       FROM journal WHERE run_id = ? ORDER BY sequence`,
      run.runId,
    ),
    receipts: await transaction.getAllAsync<RecoveryReceiptRow>(
      `SELECT command_id, expected_version, result_json, resulting_version
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
