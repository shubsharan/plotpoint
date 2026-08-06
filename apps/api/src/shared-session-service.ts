import {
  hasTrustedMechanic,
  resolveTrustedMechanic,
  type AuthorizedParticipant,
  type TrustedMechanicAdapter,
  type TrustedMechanicResolution,
} from "@plotpoint/modules";
import {
  HOST_API_VERSION,
  inspectGameRelease,
  isReleaseId,
  isSharedJoinRequest,
  isSharedJoinResponse,
  isSyncCommand,
  isSyncCommandResult,
  openRelease,
  parseGameComposition,
  type GameComposition,
  type ReleaseManifest,
  type SharedJoinRequest,
  type SharedJoinResponse,
  type SyncCommand,
  type SyncCommandResult,
  type SyncPull,
} from "@plotpoint/protocol";
import { canonicalizeValue, type Aggregate, type JsonObject } from "@plotpoint/runtime";
import {
  queryOne,
  withReadCommittedTransaction,
  type PostgresClient,
  type PostgresPool,
} from "@plotpoint/db";

import {
  createOpaqueId,
  createSecret,
  credentialDigest,
  equalDigest,
  isSecret,
  requestDigest,
} from "./security.js";

export class SharedSessionServiceError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

interface ParticipantRow {
  participant_id: string;
  session_id: string;
  team_id: string;
  status: "active" | "revoked";
  receipt_position: string;
  revocation_operation_id?: string | null;
}

interface AggregateRow {
  release_id: `sha256:${string}`;
  team_id: string;
  schema_id: string;
  state_version: number;
  state_json: unknown;
  manifest_json: unknown;
  mechanic_config_json: unknown;
}

interface ReceiptRow {
  request_digest: string;
  result_json?: string;
  terminal: SyncCommandResult["terminal"];
  outcome_code: string;
  resulting_state_version: number;
  decision_position: string;
}

interface RegistrationEnvelope {
  readonly gameComposition: GameComposition;
  readonly schemaDigests: readonly RegisteredSchemaDigest[];
}

interface RegisteredSchemaDigest {
  readonly schemaId: string;
  readonly path: string;
  readonly digest: `sha256:${string}`;
}

interface RegisteredMechanic {
  readonly composition: GameComposition;
  readonly configuration: JsonObject;
  readonly resolution: Extract<TrustedMechanicResolution, { readonly kind: "resolved" }>;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function terminalResult(
  commandId: string,
  disposition: "decided" | "duplicate",
  row: ReceiptRow,
): SyncCommandResult {
  if (row.result_json !== undefined) {
    const stored: unknown = JSON.parse(row.result_json);
    if (isSyncCommandResult(stored) && stored.commandId === commandId) return stored;
    throw new Error("command-result-corrupt");
  }
  return {
    commandId,
    disposition,
    terminal: row.terminal,
    outcomeCode: row.outcome_code,
    resultingStateVersion: Number(row.resulting_state_version),
    decisionPosition: String(row.decision_position),
  };
}

function parseCursor(cursor: string | undefined): bigint | null {
  if (cursor === undefined || cursor === "") return 0n;
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    if (!/^:\d+$/.test(decoded) || Buffer.from(decoded).toString("base64url") !== cursor) {
      return null;
    }
    return BigInt(decoded.slice(1));
  } catch {
    return null;
  }
}

function encodeCursor(position: bigint): string {
  return Buffer.from(`:${position}`).toString("base64url");
}

function sharedJoinDigest(input: {
  readonly sessionId: string;
  readonly expectedReleaseId: string;
  readonly invitationId: string;
  readonly invitationDigest: string;
  readonly joinRequestId: string;
  readonly participantDigest: string;
}): string {
  return requestDigest({
    expectedReleaseId: input.expectedReleaseId,
    invitationDigest: input.invitationDigest,
    invitationId: input.invitationId,
    joinRequestId: input.joinRequestId,
    participantDigest: input.participantDigest,
    sessionId: input.sessionId,
  });
}

function canonicalObject(value: unknown): JsonObject | null {
  const canonical = canonicalizeValue(value);
  return canonical.kind === "valid" && object(canonical.canonical.value)
    ? canonical.canonical.value
    : null;
}

function parseRegistrationEnvelope(value: unknown): RegistrationEnvelope | null {
  if (!object(value) || !Object.hasOwn(value, "gameComposition")) return null;
  if (
    !Array.isArray(value.schemaDigests) ||
    !value.schemaDigests.every(
      (entry) =>
        object(entry) &&
        Object.keys(entry).length === 3 &&
        typeof entry.schemaId === "string" &&
        entry.schemaId.length > 0 &&
        typeof entry.path === "string" &&
        entry.path.length > 0 &&
        typeof entry.digest === "string" &&
        isReleaseId(entry.digest),
    )
  ) {
    return null;
  }
  const schemaDigests = value.schemaDigests as unknown as RegisteredSchemaDigest[];
  if (new Set(schemaDigests.map(({ schemaId }) => schemaId)).size !== schemaDigests.length) {
    return null;
  }
  const parsed = parseGameComposition(value.gameComposition);
  if (parsed.kind === "invalid") return null;
  return {
    gameComposition: parsed.gameComposition,
    schemaDigests,
  };
}

function mechanicFailure(code: string): SharedSessionServiceError {
  const statuses: Readonly<Record<string, number>> = {
    "unknown-mechanic": 422,
    "invalid-binding": 422,
    "invalid-configuration": 422,
    "model-contract-mismatch": 422,
    "command-contract-mismatch": 422,
    "schema-contract-mismatch": 422,
    "projection-invalid": 500,
  };
  return new SharedSessionServiceError(code, statuses[code] ?? 422);
}

function resolveRegisteredMechanic(
  manifestJson: unknown,
  configurationJson: unknown,
): RegisteredMechanic {
  const envelope = parseRegistrationEnvelope(manifestJson);
  const configuration = canonicalObject(configurationJson);
  if (envelope === null || configuration === null) {
    throw new Error("release-registration-invalid");
  }
  const binding = envelope.gameComposition.trustedMechanic;
  if (binding === undefined) throw new Error("release-registration-invalid");
  const resolution = resolveTrustedMechanic({
    binding,
    composition: envelope.gameComposition,
    configuration,
  });
  if (resolution.kind !== "resolved") throw new Error("release-registration-invalid");
  const validated = resolution.adapter.validateBinding({
    binding,
    composition: envelope.gameComposition,
    configuration,
  });
  if (validated.kind !== "valid") throw new Error("release-registration-invalid");
  const registered = {
    composition: envelope.gameComposition,
    configuration: validated.value.configuration,
    resolution,
  };
  const currentDigests = currentSchemaDigests(envelope.gameComposition, registered);
  const currentCanonical = canonicalizeValue(currentDigests);
  const storedCanonical = canonicalizeValue(envelope.schemaDigests);
  if (
    currentDigests === null ||
    currentCanonical.kind !== "valid" ||
    storedCanonical.kind !== "valid" ||
    currentCanonical.canonical.text !== storedCanonical.canonical.text
  ) {
    throw new Error("release-registration-invalid");
  }
  return registered;
}

function inventoriedSchemaDigest(
  composition: GameComposition,
  manifest: ReleaseManifest,
  schemaId: string,
): string | null {
  const resources = composition.resources.filter(
    (resource) => resource.id === schemaId && resource.role === "schema",
  );
  if (resources.length !== 1) return null;
  const entries = manifest.inventory.filter((entry) => entry.path === resources[0]?.path);
  return entries.length === 1 ? (entries[0]?.digest ?? null) : null;
}

function ordinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function currentSchemaDigests(
  composition: GameComposition,
  registered: RegisteredMechanic,
): readonly RegisteredSchemaDigest[] | null {
  const binding = composition.trustedMechanic;
  if (binding === undefined) return null;
  const adapter = registered.resolution.adapter;
  const model = composition.aggregateModels.find(({ id }) => id === binding.aggregateModel);
  const configuration = composition.resources.find(
    (resource) => resource.id === binding.configuration && resource.role === "content",
  );
  if (
    model === undefined ||
    configuration === undefined ||
    configuration.role !== "content" ||
    configuration.schema === undefined
  ) {
    return null;
  }
  const required = new Map<string, string>();
  const add = (schemaId: string, digest: string): boolean => {
    const existing = required.get(schemaId);
    if (existing !== undefined && existing !== digest) return false;
    required.set(schemaId, digest);
    return true;
  };
  if (
    !add(model.stateSchema.id, adapter.model.stateSchema.schemaDigest) ||
    !add(model.initializationSchema.id, adapter.model.initializationSchema.schemaDigest) ||
    !add(configuration.schema.id, adapter.configurationSchema.schemaDigest) ||
    !add(binding.projectionSchema.id, adapter.projectionSchema.schemaDigest)
  ) {
    return null;
  }
  for (const descriptor of model.events) {
    const schema = adapter.model.eventSchemas[descriptor.type];
    if (schema === undefined || !add(descriptor.schema.id, schema.schemaDigest)) return null;
  }
  for (const descriptor of model.effects) {
    const schema = adapter.model.effectSchemas[descriptor.type];
    if (schema === undefined || !add(descriptor.schema.id, schema.schemaDigest)) return null;
  }
  for (const commandId of binding.commands) {
    const descriptor = composition.commands.find(({ id }) => id === commandId);
    if (descriptor === undefined) return null;
    const contract = adapter.model.commandContracts[descriptor.type];
    if (
      contract === undefined ||
      !add(descriptor.payloadSchema.id, contract.payloadSchema.schemaDigest) ||
      !add(descriptor.outcomeSchema.id, contract.outcomeSchema.schemaDigest)
    ) {
      return null;
    }
  }
  const output: RegisteredSchemaDigest[] = [];
  for (const [schemaId, digest] of required) {
    const resources = composition.resources.filter(
      ({ id, role }) => id === schemaId && role === "schema",
    );
    if (resources.length !== 1 || !isReleaseId(digest)) return null;
    output.push({ schemaId, path: resources[0]!.path, digest });
  }
  return output.sort((left, right) => ordinal(left.schemaId, right.schemaId));
}

function registeredSchemaDigests(
  composition: GameComposition,
  manifest: ReleaseManifest,
  registered: RegisteredMechanic,
): readonly RegisteredSchemaDigest[] | null {
  const current = currentSchemaDigests(composition, registered);
  if (current === null) return null;
  return current.every(
    ({ schemaId, digest }) => inventoriedSchemaDigest(composition, manifest, schemaId) === digest,
  )
    ? current
    : null;
}

function aggregateForRow<Kind extends "team" | "session">(
  row: AggregateRow,
  adapter: TrustedMechanicAdapter<Kind>,
): Aggregate<JsonObject, Kind> {
  const state = adapter.model.stateSchema.validate(row.state_json);
  if (
    row.schema_id !== adapter.model.stateSchema.id ||
    !Number.isSafeInteger(Number(row.state_version)) ||
    Number(row.state_version) < 0 ||
    !state.valid
  ) {
    throw new Error("authoritative-aggregate-invalid");
  }
  return {
    aggregateId: row.team_id,
    modelId: adapter.model.modelId,
    aggregateKind: adapter.model.aggregateKind,
    schemaId: row.schema_id,
    stateVersion: Number(row.state_version),
    state: state.value,
  };
}

function projectAggregate<Kind extends "team" | "session">(
  adapter: TrustedMechanicAdapter<Kind>,
  row: AggregateRow,
  participant: AuthorizedParticipant,
) {
  return adapter.project({
    participant,
    aggregate: aggregateForRow(row, adapter),
  });
}

export class SharedSessionService {
  constructor(
    private readonly pool: PostgresPool,
    private readonly pepper: string,
  ) {}

  async registerRelease(
    bytes: Uint8Array,
    expectedReleaseId: string,
  ): Promise<{ releaseId: string; mechanicId: string }> {
    if (!isReleaseId(expectedReleaseId)) {
      throw new SharedSessionServiceError("expected-release-id-invalid", 400);
    }
    const inspection = await inspectGameRelease(bytes);
    if ("kind" in inspection || inspection.release.releaseId !== expectedReleaseId) {
      throw new SharedSessionServiceError("release-invalid", 422);
    }
    if (
      inspection.release.manifest.hostApi.major !== HOST_API_VERSION.major ||
      inspection.release.manifest.hostApi.minimumMinor > HOST_API_VERSION.minor
    ) {
      throw new SharedSessionServiceError("host-api-unsupported", 422);
    }
    const binding = inspection.gameComposition.trustedMechanic;
    if (binding === undefined) {
      throw new SharedSessionServiceError("trusted-mechanic-missing", 422);
    }
    if (!hasTrustedMechanic(binding.id)) {
      throw new SharedSessionServiceError("unknown-mechanic", 422);
    }
    const opened = await openRelease(bytes);
    if (opened.kind !== "opened") throw new SharedSessionServiceError("release-invalid", 422);
    const resource = inspection.gameComposition.resources.find(
      (candidate) => candidate.id === binding.configuration && candidate.role === "content",
    );
    const entry =
      resource === undefined
        ? undefined
        : opened.entries.find((candidate) => candidate.path === resource.path);
    if (entry === undefined) throw new SharedSessionServiceError("invalid-configuration", 422);
    let configuration: unknown;
    try {
      configuration = JSON.parse(new TextDecoder().decode(entry.bytes));
    } catch {
      throw new SharedSessionServiceError("invalid-configuration", 422);
    }
    const resolution = resolveTrustedMechanic({
      binding,
      composition: inspection.gameComposition,
      configuration,
    });
    if (resolution.kind !== "resolved") throw mechanicFailure(resolution.diagnostic.code);
    const validated = resolution.adapter.validateBinding({
      binding,
      composition: inspection.gameComposition,
      configuration,
    });
    if (validated.kind !== "valid") throw mechanicFailure(validated.diagnostic.code);
    const registered: RegisteredMechanic = {
      composition: inspection.gameComposition,
      configuration: validated.value.configuration,
      resolution,
    };
    const schemaDigests = registeredSchemaDigests(
      inspection.gameComposition,
      inspection.release.manifest,
      registered,
    );
    if (schemaDigests === null) {
      throw new SharedSessionServiceError("schema-contract-mismatch", 422);
    }
    const manifestJson: RegistrationEnvelope = {
      gameComposition: inspection.gameComposition,
      schemaDigests,
    };
    const persisted = await this.pool.query(
      `INSERT INTO release_registrations(release_id, manifest_json, mechanic_config_json)
       VALUES ($1, $2, $3)
       ON CONFLICT (release_id) DO UPDATE SET release_id = EXCLUDED.release_id
       WHERE release_registrations.manifest_json = EXCLUDED.manifest_json
         AND release_registrations.mechanic_config_json = EXCLUDED.mechanic_config_json
       RETURNING release_id`,
      [
        inspection.release.releaseId,
        JSON.stringify(manifestJson),
        JSON.stringify(validated.value.configuration),
      ],
    );
    if (persisted.rowCount !== 1) {
      throw new SharedSessionServiceError("release-registration-conflict", 409);
    }
    return { releaseId: inspection.release.releaseId, mechanicId: resolution.adapter.id };
  }

  async createSession(input: {
    creationId: string;
    releaseId: string;
    teamLabel: string;
  }): Promise<{
    sessionId: string;
    teamId: string;
    releaseId: string;
    disposition: "created" | "duplicate";
  }> {
    if (
      input.creationId.length === 0 ||
      !isReleaseId(input.releaseId) ||
      input.teamLabel.length === 0
    ) {
      throw new SharedSessionServiceError("session-request-invalid", 400);
    }
    const digest = requestDigest({
      creationId: input.creationId,
      releaseId: input.releaseId,
      teamLabel: input.teamLabel,
    });
    return withReadCommittedTransaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `shared-session-creation:${input.creationId}`,
      ]);
      const existing = await queryOne<{
        session_id: string;
        team_id: string;
        release_id: string;
        creation_digest: string;
      }>(
        client,
        "SELECT session_id, team_id, release_id, creation_digest FROM hunt_sessions WHERE creation_id = $1 FOR UPDATE",
        [input.creationId],
      );
      if (existing !== null) {
        if (existing.creation_digest !== digest) {
          throw new SharedSessionServiceError("session-creation-conflict", 409);
        }
        return {
          sessionId: existing.session_id,
          teamId: existing.team_id,
          releaseId: existing.release_id,
          disposition: "duplicate" as const,
        };
      }
      const release = await queryOne<{ manifest_json: unknown; mechanic_config_json: unknown }>(
        client,
        "SELECT manifest_json, mechanic_config_json FROM release_registrations WHERE release_id = $1",
        [input.releaseId],
      );
      if (release === null) throw new SharedSessionServiceError("release-not-registered", 404);
      const registered = resolveRegisteredMechanic(
        release.manifest_json,
        release.mechanic_config_json,
      );
      const binding = registered.composition.trustedMechanic;
      if (binding === undefined) throw new Error("release-registration-invalid");
      const validation = registered.resolution.adapter.validateBinding({
        binding,
        composition: registered.composition,
        configuration: registered.configuration,
      });
      if (validation.kind !== "valid") throw new Error("release-registration-invalid");
      const initialized = registered.resolution.adapter.model.initialize(
        validation.value.initializationInput,
      );
      if (initialized.kind !== "initialized") {
        throw new SharedSessionServiceError("invalid-configuration", 422);
      }
      const sessionId = createOpaqueId("session");
      const teamId = createOpaqueId("team");
      await client.query(
        "INSERT INTO hunt_sessions(session_id, creation_id, creation_digest, release_id, team_id, team_label) VALUES ($1,$2,$3,$4,$5,$6)",
        [sessionId, input.creationId, digest, input.releaseId, teamId, input.teamLabel],
      );
      await client.query(
        "INSERT INTO team_aggregates(session_id, team_id, schema_id, state_version, state_json) VALUES ($1,$2,$3,0,$4)",
        [
          sessionId,
          teamId,
          initialized.aggregate.schemaId,
          JSON.stringify(initialized.aggregate.state),
        ],
      );
      return {
        sessionId,
        teamId,
        releaseId: input.releaseId,
        disposition: "created" as const,
      };
    });
  }

  async createInvitation(
    sessionId: string,
    invitationId: string,
    expiresAt: string,
  ): Promise<{ invitationId: string; invitation: string; expiresAt: string }> {
    if (
      sessionId.length === 0 ||
      invitationId.length === 0 ||
      !Number.isFinite(Date.parse(expiresAt)) ||
      Date.parse(expiresAt) <= Date.now()
    ) {
      throw new SharedSessionServiceError("invitation-expiry-invalid", 400);
    }
    const session = await this.pool.query<{ session_id: string }>(
      "SELECT session_id FROM hunt_sessions WHERE session_id = $1",
      [sessionId],
    );
    if (session.rowCount !== 1) throw new SharedSessionServiceError("session-not-found", 404);
    const invitation = createSecret();
    await this.pool.query(
      "INSERT INTO hunt_invitations(invitation_id, session_id, secret_digest, expires_at) VALUES ($1,$2,$3,$4)",
      [invitationId, sessionId, credentialDigest(invitation, this.pepper), expiresAt],
    );
    return { invitationId, invitation, expiresAt };
  }

  async join(sessionId: string, input: SharedJoinRequest): Promise<SharedJoinResponse> {
    if (!isSharedJoinRequest(input)) {
      throw new SharedSessionServiceError("join-request-invalid", 400);
    }
    if (!isSecret(input.invitation) || !isSecret(input.participantCredential)) {
      throw new SharedSessionServiceError("join-not-authorized", 401);
    }
    const invitationDigest = credentialDigest(input.invitation, this.pepper);
    const participantDigest = credentialDigest(input.participantCredential, this.pepper);
    const joined = await withReadCommittedTransaction(this.pool, async (client) => {
      const session = await queryOne<{ team_id: string; release_id: `sha256:${string}` }>(
        client,
        "SELECT team_id, release_id FROM hunt_sessions WHERE session_id = $1 FOR SHARE",
        [sessionId],
      );
      if (session === null) throw new SharedSessionServiceError("join-not-authorized", 401);
      if (session.release_id !== input.expectedReleaseId) {
        throw new SharedSessionServiceError("session-release-mismatch", 409);
      }
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `shared-join:${sessionId}:${input.joinRequestId}`,
      ]);
      const invitation = await queryOne<{
        invitation_id: string;
        session_id: string;
        expires_at: string;
        consumed_at: string | null;
        consumed_join_request_id: string | null;
        consumed_credential_digest: string | null;
      }>(client, "SELECT * FROM hunt_invitations WHERE secret_digest = $1 FOR UPDATE", [
        invitationDigest,
      ]);
      if (
        invitation === null ||
        invitation.session_id !== sessionId ||
        Date.parse(invitation.expires_at) <= Date.now()
      ) {
        throw new SharedSessionServiceError("join-not-authorized", 401);
      }
      if (invitation.consumed_at !== null) {
        if (
          invitation.consumed_join_request_id === null ||
          invitation.consumed_credential_digest === null ||
          !equalDigest(
            sharedJoinDigest({
              sessionId,
              expectedReleaseId: input.expectedReleaseId,
              invitationId: invitation.invitation_id,
              invitationDigest,
              joinRequestId: input.joinRequestId,
              participantDigest,
            }),
            sharedJoinDigest({
              sessionId: invitation.session_id,
              expectedReleaseId: session.release_id,
              invitationId: invitation.invitation_id,
              invitationDigest,
              joinRequestId: invitation.consumed_join_request_id,
              participantDigest: invitation.consumed_credential_digest,
            }),
          )
        ) {
          throw new SharedSessionServiceError("join-not-authorized", 401);
        }
        const existing = await queryOne<{ participant_id: string; team_id: string }>(
          client,
          "SELECT participant_id, team_id FROM hunt_participants WHERE session_id = $1 AND join_request_id = $2",
          [sessionId, input.joinRequestId],
        );
        if (existing === null) throw new Error("join-retry-incoherent");
        if (existing.team_id !== session.team_id) throw new Error("join-retry-incoherent");
        return { ...existing, disposition: "duplicate" as const };
      }
      const conflicting = await queryOne<{ participant_id: string }>(
        client,
        "SELECT participant_id FROM hunt_participants WHERE session_id = $1 AND join_request_id = $2 FOR SHARE",
        [sessionId, input.joinRequestId],
      );
      if (conflicting !== null) {
        throw new SharedSessionServiceError("join-not-authorized", 401);
      }
      const participantId = createOpaqueId("participant");
      await client.query(
        "INSERT INTO hunt_participants(participant_id, session_id, team_id, join_request_id, credential_digest, status) VALUES ($1,$2,$3,$4,$5,'active')",
        [participantId, sessionId, session.team_id, input.joinRequestId, participantDigest],
      );
      await client.query(
        "UPDATE hunt_invitations SET consumed_at = transaction_timestamp(), consumed_join_request_id = $2, consumed_credential_digest = $3 WHERE invitation_id = $1",
        [invitation.invitation_id, input.joinRequestId, participantDigest],
      );
      return {
        participant_id: participantId,
        team_id: session.team_id,
        disposition: "joined" as const,
      };
    });
    const sync = await this.pull(sessionId, input.participantCredential, undefined);
    const response: SharedJoinResponse = {
      participantId: joined.participant_id,
      teamId: joined.team_id,
      releaseId: input.expectedReleaseId,
      disposition: joined.disposition,
      sync,
    };
    if (sync.snapshot.sessionId !== sessionId || !isSharedJoinResponse(response)) {
      throw new Error("join-response-incoherent");
    }
    return response;
  }

  async revoke(sessionId: string, participantId: string, operationId: string): Promise<void> {
    if (operationId.length === 0) {
      throw new SharedSessionServiceError("revoke-request-invalid", 400);
    }
    await withReadCommittedTransaction(this.pool, async (client) => {
      const participant = await queryOne<ParticipantRow>(
        client,
        "SELECT participant_id, session_id, team_id, status, revocation_operation_id FROM hunt_participants WHERE participant_id = $1 AND session_id = $2 FOR UPDATE",
        [participantId, sessionId],
      );
      if (participant === null) throw new SharedSessionServiceError("participant-not-found", 404);
      if (
        participant.revocation_operation_id !== null &&
        participant.revocation_operation_id !== operationId
      ) {
        throw new SharedSessionServiceError("revocation-operation-conflict", 409);
      }
      await client.query(
        "UPDATE hunt_participants SET status = 'revoked', revoked_at = COALESCE(revoked_at, transaction_timestamp()), revocation_operation_id = COALESCE(revocation_operation_id, $2) WHERE participant_id = $1",
        [participantId, operationId],
      );
    });
  }

  private async authenticate(
    client: PostgresClient,
    sessionId: string,
    credential: string,
    lock: "FOR UPDATE" | "",
  ): Promise<ParticipantRow> {
    if (!isSecret(credential)) {
      throw new SharedSessionServiceError("participant-not-authorized", 401);
    }
    const participant = await queryOne<ParticipantRow>(
      client,
      `SELECT participant_id, session_id, team_id, status, receipt_position::text FROM hunt_participants WHERE credential_digest = $1 AND session_id = $2 ${lock}`,
      [credentialDigest(credential, this.pepper), sessionId],
    );
    if (participant === null) {
      throw new SharedSessionServiceError("participant-not-authorized", 401);
    }
    if (participant.status === "revoked") {
      throw new SharedSessionServiceError("participant-revoked", 403);
    }
    return participant;
  }

  async submit(
    sessionId: string,
    credential: string,
    command: SyncCommand,
  ): Promise<SyncCommandResult> {
    if (!isSyncCommand(command)) throw new SharedSessionServiceError("command-invalid", 400);
    const canonicalCommand = canonicalObject(command);
    if (canonicalCommand === null) throw new SharedSessionServiceError("command-invalid", 400);
    const digest = requestDigest(canonicalCommand);
    return withReadCommittedTransaction(this.pool, async (client) => {
      const participant = await this.authenticate(client, sessionId, credential, "FOR UPDATE");
      const duplicate = await queryOne<ReceiptRow>(
        client,
        "SELECT request_digest, result_json, terminal, outcome_code, resulting_state_version, decision_position::text FROM authoritative_command_receipts WHERE session_id = $1 AND participant_id = $2 AND command_id = $3",
        [sessionId, participant.participant_id, command.commandId],
      );
      if (duplicate !== null) {
        if (duplicate.request_digest !== digest) {
          throw new SharedSessionServiceError("command-identity-conflict", 409);
        }
        return terminalResult(command.commandId, "duplicate", duplicate);
      }
      const row = await queryOne<AggregateRow>(
        client,
        `SELECT sessions.release_id, aggregates.team_id, aggregates.schema_id,
                aggregates.state_version, aggregates.state_json,
                releases.manifest_json, releases.mechanic_config_json
         FROM team_aggregates aggregates JOIN hunt_sessions sessions USING(session_id)
         JOIN release_registrations releases USING(release_id)
         WHERE aggregates.session_id = $1 AND aggregates.team_id = $2 FOR UPDATE OF aggregates`,
        [sessionId, participant.team_id],
      );
      if (row === null) throw new Error("authoritative-aggregate-missing");
      const registered = resolveRegisteredMechanic(row.manifest_json, row.mechanic_config_json);
      const authorizedParticipant = {
        sessionId,
        participantId: participant.participant_id,
        teamId: participant.team_id,
      };
      const dispatch =
        registered.resolution.aggregateKind === "team"
          ? registered.resolution.adapter.execute({
              participant: authorizedParticipant,
              aggregate: aggregateForRow(row, registered.resolution.adapter),
              command,
              observations: command.observations,
            })
          : registered.resolution.adapter.execute({
              participant: authorizedParticipant,
              aggregate: aggregateForRow(row, registered.resolution.adapter),
              command,
              observations: command.observations,
            });

      if (dispatch.aggregateAfter.stateVersion !== dispatch.aggregateBefore.stateVersion) {
        await client.query(
          "UPDATE team_aggregates SET state_version = $3, state_json = $4 WHERE session_id = $1 AND team_id = $2",
          [
            sessionId,
            participant.team_id,
            dispatch.aggregateAfter.stateVersion,
            JSON.stringify(dispatch.aggregateAfter.state),
          ],
        );
      }
      const position = await queryOne<{ receipt_position: string }>(
        client,
        `UPDATE hunt_participants SET receipt_position = receipt_position + 1
         WHERE session_id = $1 AND participant_id = $2 RETURNING receipt_position::text`,
        [sessionId, participant.participant_id],
      );
      if (position === null) throw new Error("participant-receipt-position-missing");
      const receipt = await queryOne<ReceiptRow>(
        client,
        `INSERT INTO authoritative_command_receipts(session_id, command_id, participant_id, request_digest, request_json, terminal, outcome_code, resulting_state_version, result_json, decision_position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'{}',$9)
         RETURNING request_digest, terminal, outcome_code, resulting_state_version, decision_position::text`,
        [
          sessionId,
          command.commandId,
          participant.participant_id,
          digest,
          JSON.stringify(canonicalCommand),
          dispatch.terminal,
          dispatch.outcomeCode,
          dispatch.aggregateAfter.stateVersion,
          position.receipt_position,
        ],
      );
      if (receipt === null) throw new Error("command-receipt-missing");
      const decided: SyncCommandResult = {
        ...terminalResult(command.commandId, "decided", receipt),
        ...(dispatch.capabilityEvidence.length === 0
          ? {}
          : { capabilityEvidence: dispatch.capabilityEvidence }),
      };
      await client.query(
        "UPDATE authoritative_command_receipts SET result_json = $4 WHERE session_id = $1 AND participant_id = $2 AND command_id = $3",
        [sessionId, participant.participant_id, command.commandId, JSON.stringify(decided)],
      );
      if (dispatch.terminal === "accepted") {
        await client.query(
          "INSERT INTO authoritative_command_journal(session_id, participant_id, command_id, before_version, after_version, outcome_code) VALUES ($1,$2,$3,$4,$5,$6)",
          [
            sessionId,
            participant.participant_id,
            command.commandId,
            dispatch.aggregateBefore.stateVersion,
            dispatch.aggregateAfter.stateVersion,
            dispatch.outcomeCode,
          ],
        );
        for (const event of dispatch.domainEvents) {
          await client.query(
            "INSERT INTO authoritative_domain_events(event_id, session_id, participant_id, command_id, event_type, event_json) VALUES ($1,$2,$3,$4,$5,$6)",
            [
              createOpaqueId("event"),
              sessionId,
              participant.participant_id,
              command.commandId,
              typeof event.type === "string" ? event.type : "domain-event",
              JSON.stringify(event),
            ],
          );
        }
      }
      await client.query(
        "INSERT INTO authoritative_operational_events(event_id, session_id, participant_id, command_id, code, state_version, elapsed_ms) VALUES ($1,$2,$3,$4,$5,$6,0)",
        [
          createOpaqueId("operation"),
          sessionId,
          participant.participant_id,
          command.commandId,
          `command-${dispatch.terminal}`,
          dispatch.aggregateAfter.stateVersion,
        ],
      );
      return decided;
    });
  }

  async pull(sessionId: string, credential: string, cursor: string | undefined): Promise<SyncPull> {
    const requested = parseCursor(cursor);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const participant = await this.authenticate(client, sessionId, credential, "");
      const row = await queryOne<AggregateRow>(
        client,
        `SELECT sessions.release_id, aggregates.team_id, aggregates.schema_id,
                aggregates.state_version, aggregates.state_json,
                releases.manifest_json, releases.mechanic_config_json
         FROM team_aggregates aggregates JOIN hunt_sessions sessions USING(session_id)
         JOIN release_registrations releases USING(release_id)
         WHERE aggregates.session_id = $1 AND aggregates.team_id = $2`,
        [sessionId, participant.team_id],
      );
      if (row === null) throw new Error("authoritative-aggregate-missing");
      const registered = resolveRegisteredMechanic(row.manifest_json, row.mechanic_config_json);
      const authorizedParticipant = {
        sessionId,
        participantId: participant.participant_id,
        teamId: participant.team_id,
      };
      const projection =
        registered.resolution.aggregateKind === "team"
          ? projectAggregate(registered.resolution.adapter, row, authorizedParticipant)
          : projectAggregate(registered.resolution.adapter, row, authorizedParticipant);
      if (projection.kind !== "projected") throw mechanicFailure(projection.diagnostic.code);
      let highWater: bigint;
      try {
        highWater = BigInt(participant.receipt_position);
      } catch {
        throw new Error("participant-receipt-position-invalid");
      }
      if (highWater < 0n) throw new Error("participant-receipt-position-invalid");
      const reset = requested === null || requested > highWater;
      const after = reset ? 0n : requested;
      const results = await client.query<ReceiptRow & { command_id: string }>(
        `SELECT command_id, request_digest, result_json, terminal, outcome_code, resulting_state_version, decision_position::text
         FROM authoritative_command_receipts WHERE participant_id = $1 AND decision_position > $2 AND decision_position <= $3
         ORDER BY decision_position`,
        [participant.participant_id, after.toString(), highWater.toString()],
      );
      const pull: SyncPull = {
        kind: "snapshot",
        reset,
        nextCursor: encodeCursor(highWater),
        snapshot: {
          sessionId,
          releaseId: row.release_id,
          participantId: participant.participant_id,
          teamId: participant.team_id,
          membershipStatus: "active",
          confirmedAt: new Date().toISOString(),
          projections: [projection.projection],
        },
        commandResults: results.rows.map((result) =>
          terminalResult(result.command_id, "decided", result),
        ),
      };
      await client.query("COMMIT");
      return pull;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
