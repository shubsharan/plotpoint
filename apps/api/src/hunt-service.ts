import {
  CONTRACT_VERSIONS,
  isReleaseId,
  openRelease,
  verifyRelease,
  isSyncCommand,
  type CanonicalJsonObject,
  type SyncCommandResult,
  type SyncCommand,
  type SyncPull,
} from "@plotpoint/protocol";
import {
  TEAM_HUNT_SCHEMA,
  TARGET_DISCOVERY_COMMAND,
  decideTargetDiscovery,
  initialTeamHuntState,
  parseTargetDiscoveryConfig,
  projectTeamHuntState,
  targetDiscoveryConfigReleasePath,
  type TargetDiscoveryConfig,
  type TeamHuntState,
} from "@plotpoint/modules";
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
  isSecret,
  requestDigest,
} from "./security.js";

export class HuntServiceError extends Error {
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
  revocation_operation_id?: string | null;
}

interface AggregateRow {
  release_id: `sha256:${string}`;
  team_id: string;
  state_version: number;
  state_json: TeamHuntState;
  mechanic_config_json: TargetDiscoveryConfig;
}

interface ReceiptRow {
  request_digest: string;
  terminal: SyncCommandResult["terminal"];
  outcome_code: string;
  resulting_state_version: number;
  decision_position: string;
}

function terminalResult(
  commandId: string,
  disposition: "decided" | "duplicate",
  row: ReceiptRow,
): SyncCommandResult {
  return {
    version: CONTRACT_VERSIONS.sharedSync,
    commandId,
    disposition,
    terminal: row.terminal,
    outcomeCode: row.outcome_code,
    resultingStateVersion: Number(row.resulting_state_version),
    decisionPosition: String(row.decision_position),
  };
}

function parseCursor(cursor: string | undefined): number | null {
  if (cursor === undefined || cursor === "") return 0;
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    if (!/^:\d+$/.test(decoded) || Buffer.from(decoded).toString("base64url") !== cursor)
      return null;
    const value = Number(decoded.slice(3));
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

function encodeCursor(position: number): string {
  return Buffer.from(`:${position}`).toString("base64url");
}

export class HuntService {
  constructor(
    private readonly pool: PostgresPool,
    private readonly pepper: string,
  ) {}

  async registerRelease(
    bytes: Uint8Array,
    expectedReleaseId: string,
  ): Promise<{ releaseId: string; targetCount: number }> {
    if (!isReleaseId(expectedReleaseId))
      throw new HuntServiceError("expected-release-id-invalid", 400);
    const verified = await verifyRelease({ bytes, expectedReleaseId });
    if (verified.kind !== "verified") throw new HuntServiceError("release-invalid", 422);
    const opened = await openRelease(bytes);
    if (opened.kind !== "opened") throw new HuntServiceError("release-invalid", 422);
    const configEntry = opened.entries.find(
      ({ path }) => path === targetDiscoveryConfigReleasePath(),
    );
    if (configEntry === undefined) throw new HuntServiceError("target-config-missing", 422);
    let config: TargetDiscoveryConfig;
    try {
      config = parseTargetDiscoveryConfig(JSON.parse(new TextDecoder().decode(configEntry.bytes)));
    } catch {
      throw new HuntServiceError("target-config-invalid", 422);
    }
    await this.pool.query(
      `INSERT INTO release_registrations(release_id, manifest_json, mechanic_config_json)
       VALUES ($1, $2, $3) ON CONFLICT (release_id) DO NOTHING`,
      [verified.releaseId, JSON.stringify(verified.manifest), JSON.stringify(config)],
    );
    return { releaseId: verified.releaseId, targetCount: config.targets.length };
  }

  async createSession(input: {
    creationId: string;
    releaseId: string;
    teamLabel: string;
  }): Promise<{ sessionId: string; teamId: string; disposition: "created" | "duplicate" }> {
    const digest = requestDigest(input as unknown as CanonicalJsonObject);
    return withReadCommittedTransaction(this.pool, async (client) => {
      const existing = await queryOne<{
        session_id: string;
        team_id: string;
        creation_digest: string;
      }>(
        client,
        "SELECT session_id, team_id, creation_digest FROM hunt_sessions WHERE creation_id = $1 FOR UPDATE",
        [input.creationId],
      );
      if (existing !== null) {
        if (existing.creation_digest !== digest)
          throw new HuntServiceError("session-creation-conflict", 409);
        return {
          sessionId: existing.session_id,
          teamId: existing.team_id,
          disposition: "duplicate",
        };
      }
      const release = await queryOne<{ mechanic_config_json: TargetDiscoveryConfig }>(
        client,
        "SELECT mechanic_config_json FROM release_registrations WHERE release_id = $1",
        [input.releaseId],
      );
      if (release === null) throw new HuntServiceError("release-not-registered", 404);
      const sessionId = createOpaqueId("session");
      const teamId = createOpaqueId("team");
      await client.query(
        "INSERT INTO hunt_sessions(session_id, creation_id, creation_digest, release_id, team_id, team_label) VALUES ($1,$2,$3,$4,$5,$6)",
        [sessionId, input.creationId, digest, input.releaseId, teamId, input.teamLabel],
      );
      await client.query(
        "INSERT INTO team_aggregates(session_id, team_id, schema_id, schema_version, state_version, state_json) VALUES ($1,$2,$3,1,0,$4)",
        [
          sessionId,
          teamId,
          TEAM_HUNT_SCHEMA,
          JSON.stringify(initialTeamHuntState(release.mechanic_config_json)),
        ],
      );
      return { sessionId, teamId, disposition: "created" };
    });
  }

  async createInvitation(
    sessionId: string,
    invitationId: string,
    expiresAt: string,
  ): Promise<{ invitationId: string; invitation: string; expiresAt: string }> {
    if (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now())
      throw new HuntServiceError("invitation-expiry-invalid", 400);
    const session = await this.pool.query<{ session_id: string }>(
      "SELECT session_id FROM hunt_sessions WHERE session_id = $1",
      [sessionId],
    );
    if (session.rowCount !== 1) throw new HuntServiceError("session-not-found", 404);
    const invitation = createSecret();
    await this.pool.query(
      "INSERT INTO hunt_invitations(invitation_id, session_id, secret_digest, expires_at) VALUES ($1,$2,$3,$4)",
      [invitationId, sessionId, credentialDigest(invitation, this.pepper), expiresAt],
    );
    return { invitationId, invitation, expiresAt };
  }

  async join(
    sessionId: string,
    input: { joinRequestId: string; invitation: string; participantCredential: string },
  ): Promise<{
    participantId: string;
    teamId: string;
    releaseId: string;
    disposition: "joined" | "duplicate";
    sync: SyncPull;
  }> {
    if (!isSecret(input.invitation) || !isSecret(input.participantCredential))
      throw new HuntServiceError("join-not-authorized", 401);
    const invitationDigest = credentialDigest(input.invitation, this.pepper);
    const participantDigest = credentialDigest(input.participantCredential, this.pepper);
    const joined = await withReadCommittedTransaction(this.pool, async (client) => {
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
      )
        throw new HuntServiceError("join-not-authorized", 401);
      if (invitation.consumed_at !== null) {
        if (
          invitation.consumed_join_request_id !== input.joinRequestId ||
          invitation.consumed_credential_digest !== participantDigest
        )
          throw new HuntServiceError("join-not-authorized", 401);
        const existing = await queryOne<{ participant_id: string; team_id: string }>(
          client,
          "SELECT participant_id, team_id FROM hunt_participants WHERE session_id = $1 AND join_request_id = $2",
          [sessionId, input.joinRequestId],
        );
        if (existing === null) throw new Error("join-retry-incoherent");
        return { ...existing, disposition: "duplicate" as const };
      }
      const session = await queryOne<{ team_id: string }>(
        client,
        "SELECT team_id FROM hunt_sessions WHERE session_id = $1",
        [sessionId],
      );
      if (session === null) throw new HuntServiceError("join-not-authorized", 401);
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
    return {
      participantId: joined.participant_id,
      teamId: joined.team_id,
      releaseId: sync.snapshot.releaseId,
      disposition: joined.disposition,
      sync,
    };
  }

  async revoke(sessionId: string, participantId: string, operationId: string): Promise<void> {
    if (operationId.length === 0) throw new HuntServiceError("revoke-request-invalid", 400);
    await withReadCommittedTransaction(this.pool, async (client) => {
      const participant = await queryOne<ParticipantRow>(
        client,
        "SELECT participant_id, session_id, team_id, status, revocation_operation_id FROM hunt_participants WHERE participant_id = $1 AND session_id = $2 FOR UPDATE",
        [participantId, sessionId],
      );
      if (participant === null) throw new HuntServiceError("participant-not-found", 404);
      if (
        participant.revocation_operation_id !== null &&
        participant.revocation_operation_id !== operationId
      )
        throw new HuntServiceError("revocation-operation-conflict", 409);
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
    lock: "FOR SHARE" | "",
  ): Promise<ParticipantRow> {
    if (!isSecret(credential)) throw new HuntServiceError("participant-not-authorized", 401);
    const participant = await queryOne<ParticipantRow>(
      client,
      `SELECT participant_id, session_id, team_id, status FROM hunt_participants WHERE credential_digest = $1 AND session_id = $2 ${lock}`,
      [credentialDigest(credential, this.pepper), sessionId],
    );
    if (participant === null) throw new HuntServiceError("participant-not-authorized", 401);
    if (participant.status === "revoked") throw new HuntServiceError("participant-revoked", 403);
    return participant;
  }

  async submit(
    sessionId: string,
    credential: string,
    command: SyncCommand,
  ): Promise<SyncCommandResult> {
    if (!isSyncCommand(command)) throw new HuntServiceError("command-invalid", 400);
    const digest = requestDigest(command as unknown as CanonicalJsonObject);
    return withReadCommittedTransaction(this.pool, async (client) => {
      const participant = await this.authenticate(client, sessionId, credential, "FOR SHARE");
      const duplicate = await queryOne<ReceiptRow>(
        client,
        "SELECT request_digest, terminal, outcome_code, resulting_state_version, decision_position::text FROM authoritative_command_receipts WHERE session_id = $1 AND command_id = $2",
        [sessionId, command.commandId],
      );
      if (duplicate !== null) {
        if (duplicate.request_digest !== digest)
          throw new HuntServiceError("command-identity-conflict", 409);
        return terminalResult(command.commandId, "duplicate", duplicate);
      }
      const aggregate = await queryOne<AggregateRow>(
        client,
        `SELECT sessions.release_id, aggregates.team_id, aggregates.state_version, aggregates.state_json,
                releases.mechanic_config_json
         FROM team_aggregates aggregates JOIN hunt_sessions sessions USING(session_id)
         JOIN release_registrations releases USING(release_id)
         WHERE aggregates.session_id = $1 AND aggregates.team_id = $2 FOR UPDATE OF aggregates`,
        [sessionId, participant.team_id],
      );
      if (aggregate === null) throw new Error("team-aggregate-missing");
      let decision: ReturnType<typeof decideTargetDiscovery>;
      const payloadKeys = Object.keys(command.payload);
      if (command.expectedStateVersion > Number(aggregate.state_version)) {
        decision = {
          terminal: "invalid",
          outcomeCode: "expected-version-ahead",
          state: aggregate.state_json,
        };
      } else if (
        command.type !== TARGET_DISCOVERY_COMMAND ||
        command.target.aggregateKind !== "team" ||
        command.target.aggregateId !== aggregate.team_id ||
        command.target.schemaId !== TEAM_HUNT_SCHEMA ||
        command.target.schemaVersion !== 1 ||
        payloadKeys.length !== 1 ||
        payloadKeys[0] !== "targetId" ||
        typeof command.payload.targetId !== "string" ||
        command.observations.length !== 1
      ) {
        decision = {
          terminal: "invalid",
          outcomeCode: "command-shape-invalid",
          state: aggregate.state_json,
        };
      } else {
        decision = decideTargetDiscovery({
          config: aggregate.mechanic_config_json,
          state: aggregate.state_json,
          targetId: command.payload.targetId,
          observation: command.observations[0],
        });
      }
      const resultingVersion =
        decision.terminal === "accepted"
          ? Number(aggregate.state_version) + 1
          : Number(aggregate.state_version);
      if (decision.terminal === "accepted") {
        await client.query(
          "UPDATE team_aggregates SET state_version = $3, state_json = $4 WHERE session_id = $1 AND team_id = $2",
          [sessionId, participant.team_id, resultingVersion, JSON.stringify(decision.state)],
        );
      }
      const receipt = await queryOne<ReceiptRow>(
        client,
        `INSERT INTO authoritative_command_receipts(session_id, command_id, participant_id, request_digest, terminal, outcome_code, resulting_state_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING request_digest, terminal, outcome_code, resulting_state_version, decision_position::text`,
        [
          sessionId,
          command.commandId,
          participant.participant_id,
          digest,
          decision.terminal,
          decision.outcomeCode,
          resultingVersion,
        ],
      );
      if (receipt === null) throw new Error("command-receipt-missing");
      if (decision.terminal === "accepted") {
        await client.query(
          "INSERT INTO authoritative_command_journal(session_id, command_id, before_version, after_version, outcome_code) VALUES ($1,$2,$3,$4,$5)",
          [
            sessionId,
            command.commandId,
            aggregate.state_version,
            resultingVersion,
            decision.outcomeCode,
          ],
        );
        await client.query(
          "INSERT INTO authoritative_domain_events(event_id, session_id, command_id, event_type, event_json) VALUES ($1,$2,$3,'target-discovered',$4)",
          [
            createOpaqueId("event"),
            sessionId,
            command.commandId,
            JSON.stringify({ type: "target-discovered", targetId: command.payload.targetId }),
          ],
        );
      }
      await client.query(
        "INSERT INTO authoritative_operational_events(event_id, session_id, participant_id, command_id, code, state_version, elapsed_ms) VALUES ($1,$2,$3,$4,$5,$6,0)",
        [
          createOpaqueId("operation"),
          sessionId,
          participant.participant_id,
          command.commandId,
          `command-${decision.terminal}`,
          resultingVersion,
        ],
      );
      return terminalResult(command.commandId, "decided", receipt);
    });
  }

  async pull(sessionId: string, credential: string, cursor: string | undefined): Promise<SyncPull> {
    const requested = parseCursor(cursor);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const participant = await this.authenticate(client, sessionId, credential, "");
      const aggregate = await queryOne<AggregateRow>(
        client,
        `SELECT sessions.release_id, aggregates.team_id, aggregates.state_version, aggregates.state_json,
                releases.mechanic_config_json
         FROM team_aggregates aggregates JOIN hunt_sessions sessions USING(session_id)
         JOIN release_registrations releases USING(release_id)
         WHERE aggregates.session_id = $1 AND aggregates.team_id = $2`,
        [sessionId, participant.team_id],
      );
      if (aggregate === null) throw new Error("team-aggregate-missing");
      const high = await queryOne<{ position: string }>(
        client,
        "SELECT COALESCE(MAX(decision_position), 0)::text AS position FROM authoritative_command_receipts",
        [],
      );
      const highWater = Number(high?.position ?? 0);
      const reset = requested === null || requested > highWater;
      const after = reset ? 0 : requested;
      const results = await client.query<ReceiptRow & { command_id: string }>(
        `SELECT command_id, request_digest, terminal, outcome_code, resulting_state_version, decision_position::text
         FROM authoritative_command_receipts WHERE participant_id = $1 AND decision_position > $2 AND decision_position <= $3
         ORDER BY decision_position`,
        [participant.participant_id, after, highWater],
      );
      const pull: SyncPull = {
        version: CONTRACT_VERSIONS.sharedSync,
        kind: "snapshot",
        reset,
        nextCursor: encodeCursor(highWater),
        snapshot: {
          version: CONTRACT_VERSIONS.sharedSync,
          sessionId,
          releaseId: aggregate.release_id,
          participantId: participant.participant_id,
          teamId: participant.team_id,
          membershipStatus: "active",
          confirmedAt: new Date().toISOString(),
          projections: [
            projectTeamHuntState(
              participant.team_id,
              Number(aggregate.state_version),
              aggregate.state_json,
            ),
          ],
        },
        commandResults: results.rows.map((row) => terminalResult(row.command_id, "decided", row)),
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
