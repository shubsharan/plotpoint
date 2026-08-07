import { readFile, rm } from "node:fs/promises";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { TARGET_DISCOVERY_COMMAND, TARGET_DISCOVERY_STATE_SCHEMA } from "@plotpoint/modules";
import { createPostgresPool, migrateAuthoritativeHunt, type PostgresPool } from "@plotpoint/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { compileProject } from "../../../packages/compiler/dist/index.js";
import { createSecret } from "../src/security.js";
import { SharedSessionService } from "../src/shared-session-service.js";

let container: StartedPostgreSqlContainer;
let pool: PostgresPool;
let service: SharedSessionService;
let releaseId: `sha256:${string}`;
const outputFile = `/tmp/plotpoint-api-co-op-${globalThis.crypto.randomUUID()}.pprelease`;

const available = (observationId: string, latitude: number, longitude: number) => {
  const recordedAt = Date.now();
  return {
    observationId,
    recordedAt: new Date(recordedAt).toISOString(),
    capturedAt: new Date(recordedAt - 1_000).toISOString(),
    ageMs: 1_000,
    availability: "available" as const,
    latitude,
    longitude,
    horizontalAccuracy: 5,
  };
};

describe("generic shared-session PostgreSQL integration", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    pool = createPostgresPool({ connectionString: container.getConnectionUri() });
    await migrateAuthoritativeHunt(pool);

    const compilation = await compileProject({
      projectRoot: new URL("../../../examples/releases/co-op-game/", import.meta.url).pathname,
      outputFile,
    });
    if (compilation.kind !== "compiled") {
      throw new Error(`co-op-compilation-failed:${JSON.stringify(compilation.diagnostics)}`);
    }
    releaseId = compilation.releaseId;
    service = new SharedSessionService(pool, "integration-pepper-with-sufficient-length");
    await service.registerRelease(await readFile(outputFile), releaseId);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
    await rm(outputFile, { force: true });
  });

  it("joins three participants and confirms one persisted-location discovery", async () => {
    const creation = {
      creationId: "creation-1",
      releaseId,
      teamLabel: "Team",
    };
    const created = await Promise.all([
      service.createSession(creation),
      service.createSession(creation),
    ]);
    expect(new Set(created.map(({ disposition }) => disposition))).toEqual(
      new Set(["created", "duplicate"]),
    );
    expect(new Set(created.map(({ sessionId }) => sessionId))).toHaveLength(1);
    const session = created[0]!;
    const invitations = await Promise.all(
      ["one", "two", "three"].map((name) =>
        service.createInvitation(
          session.sessionId,
          `invitation-${name}`,
          "2031-01-01T00:00:00.000Z",
        ),
      ),
    );
    const credentials = [createSecret(), createSecret(), createSecret()];
    const joinInput = {
      joinRequestId: "join-1",
      expectedReleaseId: releaseId,
      invitation: invitations[0]!.invitation,
      participantCredential: credentials[0]!,
    };
    const joined = await service.join(session.sessionId, joinInput);
    await expect(service.join(session.sessionId, joinInput)).resolves.toMatchObject({
      participantId: joined.participantId,
      disposition: "duplicate",
    });
    const teammateTwo = await service.join(session.sessionId, {
      joinRequestId: "join-2",
      expectedReleaseId: releaseId,
      invitation: invitations[1]!.invitation,
      participantCredential: credentials[1]!,
    });
    const teammateThree = await service.join(session.sessionId, {
      joinRequestId: "join-3",
      expectedReleaseId: releaseId,
      invitation: invitations[2]!.invitation,
      participantCredential: credentials[2]!,
    });

    const command = (commandId: string, targetId: string, expectedStateVersion: number) => ({
      commandId,
      target: {
        aggregateKind: "team" as const,
        aggregateId: session.teamId,
        schemaId: TARGET_DISCOVERY_STATE_SCHEMA,
      },
      expectedStateVersion,
      type: TARGET_DISCOVERY_COMMAND,
      payload: { targetId },
      observations: [available(`observation-${commandId}`, 37.7955, -122.3937)],
    });
    const ferryCommand = command("ferry-command", "ferry-building", 0);
    const exactRetries = await Promise.all([
      service.submit(session.sessionId, credentials[0]!, ferryCommand),
      service.submit(session.sessionId, credentials[0]!, ferryCommand),
    ]);
    expect(new Set(exactRetries.map(({ disposition }) => disposition))).toEqual(
      new Set(["decided"]),
    );
    expect(exactRetries).toEqual([
      expect.objectContaining({
        terminal: "accepted",
        outcomeCode: "target-discovered",
        resultingStateVersion: 1,
      }),
      expect.objectContaining({
        terminal: "accepted",
        outcomeCode: "target-discovered",
        resultingStateVersion: 1,
      }),
    ]);
    await expect(
      service.submit(session.sessionId, credentials[1]!, ferryCommand),
    ).resolves.toMatchObject({
      disposition: "decided",
      terminal: "no-op",
      outcomeCode: "target-already-discovered",
      resultingStateVersion: 1,
    });
    await expect(
      service.submit(
        session.sessionId,
        credentials[1]!,
        command("ferry-repeat", "ferry-building", 1),
      ),
    ).resolves.toMatchObject({
      terminal: "no-op",
      outcomeCode: "target-already-discovered",
      resultingStateVersion: 1,
    });
    await expect(
      service.submit(session.sessionId, credentials[0]!, ferryCommand),
    ).resolves.toMatchObject({ disposition: "decided", terminal: "accepted" });
    await expect(
      service.submit(
        session.sessionId,
        credentials[0]!,
        command("ferry-command", "rincon-park", 0),
      ),
    ).rejects.toMatchObject({ code: "command-identity-conflict", status: 409 });

    const staleObservation = {
      ...available("observation-offline-aged", 37.8009, -122.3876),
      capturedAt: new Date(Date.now() - 60_000).toISOString(),
      ageMs: 0,
    };
    const staleCommand = {
      ...command("offline-aged-command", "rincon-park", 1),
      observations: [staleObservation],
    };
    const staleResult = await service.submit(session.sessionId, credentials[0]!, staleCommand);
    expect(staleResult).toMatchObject({
      terminal: "rejected",
      outcomeCode: "location-stale",
      capabilityEvidence: [{ disposition: "expired" }],
    });
    await expect(service.submit(session.sessionId, credentials[0]!, staleCommand)).resolves.toEqual(
      staleResult,
    );

    const receiptColumns = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'authoritative_command_receipts'`,
    );
    expect(receiptColumns.rows.map(({ column_name }) => column_name)).not.toContain("request_json");
    const persistedReceipt = await pool.query<{
      request_digest: string;
      result_json: string;
    }>(
      `SELECT request_digest, result_json FROM authoritative_command_receipts
       WHERE session_id = $1 AND participant_id = $2 AND command_id = $3`,
      [session.sessionId, joined.participantId, staleCommand.commandId],
    );
    expect(persistedReceipt.rows).toHaveLength(1);
    expect(persistedReceipt.rows[0]?.request_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(persistedReceipt.rows[0]?.result_json).not.toMatch(
      /rincon-park|payload|observations|latitude|longitude|horizontalAccuracy|capturedAt|recordedAt|ageMs/,
    );

    const pull = await service.pull(session.sessionId, credentials[0]!, "0");
    expect(pull.snapshot.projections).toEqual([
      expect.objectContaining({
        schemaId: "plotpoint.location.team-projection",
        stateVersion: 1,
        value: expect.objectContaining({ completedTargets: 1, complete: false }),
      }),
    ]);
    await service.revoke(session.sessionId, teammateThree.participantId, "revoke-1");
    await service.revoke(session.sessionId, teammateThree.participantId, "revoke-1");
    await expect(
      service.pull(session.sessionId, credentials[2]!, pull.nextCursor),
    ).rejects.toMatchObject({ code: "participant-revoked", status: 403 });
    await expect(service.pull(session.sessionId, credentials[1]!, "0")).resolves.toMatchObject({
      snapshot: { participantId: teammateTwo.participantId },
    });
  }, 120_000);

  it("keeps participant cursors commit-safe, contiguous, and mutually independent", async () => {
    const session = await service.createSession({
      creationId: "creation-participant-cursors",
      releaseId,
      teamLabel: "Participant cursors",
    });
    const invitations = await Promise.all(
      ["one", "two"].map((suffix) =>
        service.createInvitation(
          session.sessionId,
          `invitation-participant-cursors-${suffix}`,
          "2031-01-01T00:00:00.000Z",
        ),
      ),
    );
    const credentials = [createSecret(), createSecret()] as const;
    const participants = await Promise.all(
      invitations.map((invitation, index) =>
        service.join(session.sessionId, {
          joinRequestId: `join-participant-cursors-${index + 1}`,
          expectedReleaseId: releaseId,
          invitation: invitation.invitation,
          participantCredential: credentials[index]!,
        }),
      ),
    );
    const heldClient = await pool.connect();
    try {
      await heldClient.query("BEGIN");
      await heldClient.query(
        "SELECT participant_id FROM hunt_participants WHERE session_id = $1 AND participant_id = $2 FOR UPDATE",
        [session.sessionId, participants[0]!.participantId],
      );
      await heldClient.query(
        "UPDATE hunt_participants SET receipt_position = 1 WHERE session_id = $1 AND participant_id = $2",
        [session.sessionId, participants[0]!.participantId],
      );
      const heldResult = {
        commandId: "held-command",
        disposition: "decided",
        terminal: "no-op",
        outcomeCode: "held-no-op",
        resultingStateVersion: 0,
        decisionPosition: "1",
      } as const;
      await heldClient.query(
        `INSERT INTO authoritative_command_receipts
         (session_id,command_id,participant_id,request_digest,terminal,outcome_code,
          resulting_state_version,result_json,decision_position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1)`,
        [
          session.sessionId,
          heldResult.commandId,
          participants[0]!.participantId,
          "held-request-digest",
          heldResult.terminal,
          heldResult.outcomeCode,
          heldResult.resultingStateVersion,
          JSON.stringify(heldResult),
        ],
      );

      const beforeCommit = await service.pull(
        session.sessionId,
        credentials[0],
        participants[0]!.sync.nextCursor,
      );
      expect(beforeCommit.nextCursor).toBe(participants[0]!.sync.nextCursor);
      expect(beforeCommit.commandResults).toEqual([]);

      const independent = await pool.connect();
      try {
        await independent.query("BEGIN");
        const position = await independent.query<{ receipt_position: string }>(
          `UPDATE hunt_participants SET receipt_position = receipt_position + 1
           WHERE session_id = $1 AND participant_id = $2 RETURNING receipt_position::text`,
          [session.sessionId, participants[1]!.participantId],
        );
        expect(position.rows).toEqual([{ receipt_position: "1" }]);
        const independentResult = {
          commandId: "independent-command",
          disposition: "decided",
          terminal: "no-op",
          outcomeCode: "independent-no-op",
          resultingStateVersion: 0,
          decisionPosition: "1",
        } as const;
        await independent.query(
          `INSERT INTO authoritative_command_receipts
           (session_id,command_id,participant_id,request_digest,terminal,outcome_code,
            resulting_state_version,result_json,decision_position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1)`,
          [
            session.sessionId,
            independentResult.commandId,
            participants[1]!.participantId,
            "independent-request-digest",
            independentResult.terminal,
            independentResult.outcomeCode,
            independentResult.resultingStateVersion,
            JSON.stringify(independentResult),
          ],
        );
        await independent.query("COMMIT");
      } finally {
        independent.release();
      }

      await heldClient.query("COMMIT");
      const committed = await service.pull(
        session.sessionId,
        credentials[0],
        participants[0]!.sync.nextCursor,
      );
      expect(committed.commandResults).toEqual([
        expect.objectContaining({ commandId: "held-command", decisionPosition: "1" }),
      ]);
      const independentPull = await service.pull(
        session.sessionId,
        credentials[1],
        participants[1]!.sync.nextCursor,
      );
      expect(independentPull.commandResults).toEqual([
        expect.objectContaining({ commandId: "independent-command", decisionPosition: "1" }),
      ]);

      await expect(
        service.submit(session.sessionId, credentials[0], {
          commandId: "after-held-command",
          target: {
            aggregateKind: "team",
            aggregateId: session.teamId,
            schemaId: TARGET_DISCOVERY_STATE_SCHEMA,
          },
          expectedStateVersion: 0,
          type: TARGET_DISCOVERY_COMMAND,
          payload: { targetId: "ferry-building" },
          observations: [available("observation-after-held", 37.7955, -122.3937)],
        }),
      ).resolves.toMatchObject({ decisionPosition: "2" });
    } catch (error) {
      await heldClient.query("ROLLBACK");
      throw error;
    } finally {
      heldClient.release();
    }
  }, 120_000);

  it("checks release pinning before invitation consumption and preserves exact join retry identity", async () => {
    const session = await service.createSession({
      creationId: "creation-release-pin",
      releaseId,
      teamLabel: "Release pin",
    });
    const invitation = await service.createInvitation(
      session.sessionId,
      "invitation-release-pin",
      "2031-01-01T00:00:00.000Z",
    );
    const input = {
      joinRequestId: "join-release-pin",
      expectedReleaseId: releaseId,
      invitation: invitation.invitation,
      participantCredential: createSecret(),
    };

    await expect(
      service.join(session.sessionId, {
        ...input,
        expectedReleaseId: `sha256:${"f".repeat(64)}`,
      }),
    ).rejects.toMatchObject({ code: "session-release-mismatch", status: 409 });
    const beforeJoin = await pool.query(
      "SELECT consumed_at, consumed_join_request_id, consumed_credential_digest FROM hunt_invitations WHERE invitation_id = $1",
      ["invitation-release-pin"],
    );
    expect(beforeJoin.rows).toEqual([
      {
        consumed_at: null,
        consumed_join_request_id: null,
        consumed_credential_digest: null,
      },
    ]);

    const joined = await service.join(session.sessionId, input);
    await pool.query("UPDATE hunt_invitations SET expires_at = $2 WHERE invitation_id = $1", [
      "invitation-release-pin",
      "2000-01-01T00:00:00.000Z",
    ]);
    const duplicate = await service.join(session.sessionId, input);
    expect(joined).toMatchObject({
      releaseId,
      teamId: session.teamId,
      disposition: "joined",
    });
    expect(duplicate).toMatchObject({
      participantId: joined.participantId,
      teamId: joined.teamId,
      releaseId,
      disposition: "duplicate",
    });
    for (const response of [joined, duplicate]) {
      expect(response.releaseId).toBe(response.sync.snapshot.releaseId);
      expect(response.participantId).toBe(response.sync.snapshot.participantId);
      expect(response.teamId).toBe(response.sync.snapshot.teamId);
      expect(response.sync.snapshot.sessionId).toBe(session.sessionId);
      expect(response).not.toHaveProperty("version");
      expect(response.sync).not.toHaveProperty("version");
    }

    await expect(
      service.join(session.sessionId, {
        ...input,
        participantCredential: createSecret(),
      }),
    ).rejects.toMatchObject({ code: "join-not-authorized", status: 401 });
    await expect(
      service.join(session.sessionId, { ...input, joinRequestId: "changed-consumed-join" }),
    ).rejects.toMatchObject({ code: "join-not-authorized", status: 401 });
    const consumedState = await pool.query(
      "SELECT consumed_join_request_id, consumed_credential_digest FROM hunt_invitations WHERE invitation_id = $1",
      ["invitation-release-pin"],
    );
    const participantCount = await pool.query(
      "SELECT COUNT(*)::integer AS count FROM hunt_participants WHERE session_id = $1",
      [session.sessionId],
    );
    expect(consumedState.rows).toEqual([
      {
        consumed_join_request_id: input.joinRequestId,
        consumed_credential_digest: expect.any(String),
      },
    ]);
    expect(participantCount.rows).toEqual([{ count: 1 }]);

    await expect(
      service.join(session.sessionId, {
        ...input,
        expectedReleaseId: `sha256:${"e".repeat(64)}`,
      }),
    ).rejects.toMatchObject({ code: "session-release-mismatch", status: 409 });

    const changedInvitation = await service.createInvitation(
      session.sessionId,
      "invitation-release-pin-changed",
      "2031-01-01T00:00:00.000Z",
    );
    await expect(
      service.join(session.sessionId, {
        ...input,
        invitation: changedInvitation.invitation,
      }),
    ).rejects.toMatchObject({ code: "join-not-authorized", status: 401 });
    const changedInvitationRow = await pool.query(
      "SELECT consumed_at FROM hunt_invitations WHERE invitation_id = $1",
      ["invitation-release-pin-changed"],
    );
    expect(changedInvitationRow.rows).toEqual([{ consumed_at: null }]);

    const expiredInvitation = await service.createInvitation(
      session.sessionId,
      "invitation-release-pin-expired",
      "2031-01-01T00:00:00.000Z",
    );
    await pool.query("UPDATE hunt_invitations SET expires_at = $2 WHERE invitation_id = $1", [
      "invitation-release-pin-expired",
      "2000-01-01T00:00:00.000Z",
    ]);
    await expect(
      service.join(session.sessionId, {
        ...input,
        joinRequestId: "expired-unconsumed-join",
        invitation: expiredInvitation.invitation,
      }),
    ).rejects.toMatchObject({ code: "join-not-authorized", status: 401 });
    const expiredInvitationRow = await pool.query(
      "SELECT consumed_at FROM hunt_invitations WHERE invitation_id = $1",
      ["invitation-release-pin-expired"],
    );
    expect(expiredInvitationRow.rows).toEqual([{ consumed_at: null }]);
  }, 120_000);

  it("rolls back all writes when the final operational-event write fails", async () => {
    const session = await service.createSession({
      creationId: "creation-fault",
      releaseId,
      teamLabel: "Fault",
    });
    const invitation = await service.createInvitation(
      session.sessionId,
      "invitation-fault",
      "2031-01-01T00:00:00.000Z",
    );
    const credential = createSecret();
    await service.join(session.sessionId, {
      joinRequestId: "join-fault",
      expectedReleaseId: releaseId,
      invitation: invitation.invitation,
      participantCredential: credential,
    });
    await pool.query(
      `CREATE OR REPLACE FUNCTION fail_operational_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fault'; END $$`,
    );
    await pool.query(
      "CREATE TRIGGER injected_fault BEFORE INSERT ON authoritative_operational_events FOR EACH ROW EXECUTE FUNCTION fail_operational_event() ",
    );
    const input = {
      commandId: "fault-command",
      target: {
        aggregateKind: "team" as const,
        aggregateId: session.teamId,
        schemaId: TARGET_DISCOVERY_STATE_SCHEMA,
      },
      expectedStateVersion: 0,
      type: TARGET_DISCOVERY_COMMAND,
      payload: { targetId: "ferry-building" },
      observations: [available("observation-fault", 37.7955, -122.3937)],
    };
    await expect(service.submit(session.sessionId, credential, input)).rejects.toThrow("fault");
    await pool.query("DROP TRIGGER injected_fault ON authoritative_operational_events");
    const rows = await pool.query(
      "SELECT (SELECT COUNT(*) FROM authoritative_command_receipts WHERE session_id=$1) receipts, (SELECT state_version FROM team_aggregates WHERE session_id=$1) version",
      [session.sessionId],
    );
    expect(rows.rows[0]).toMatchObject({ receipts: "0", version: 0 });
  }, 120_000);
});
