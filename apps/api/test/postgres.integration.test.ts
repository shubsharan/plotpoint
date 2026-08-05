import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createPostgresPool, migrateAuthoritativeHunt, type PostgresPool } from "@plotpoint/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HuntService } from "../src/hunt-service.js";
import { createSecret } from "../src/security.js";

let container: StartedPostgreSqlContainer;
let pool: PostgresPool;
let service: HuntService;

const releaseId = `sha256:${"a".repeat(64)}`;
const target = (targetId: string, latitude: number) => ({
  targetId,
  prompt: targetId,
  zone: targetId,
  latitude,
  longitude: -122,
  radiusMeters: 100,
  maximumAgeMs: 15_000,
  maximumAccuracyMeters: 30,
});
const available = (observationId: string, latitude: number) => ({
  version: 1 as const,
  observationId,
  recordedAt: "2030-01-01T00:00:01.000Z",
  capturedAt: "2030-01-01T00:00:00.000Z",
  ageMs: 1000,
  availability: "available" as const,
  latitude,
  longitude: -122,
  horizontalAccuracy: 5,
});

describe("authoritative hunt PostgreSQL integration", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    pool = createPostgresPool({ connectionString: container.getConnectionUri() });
    await migrateAuthoritativeHunt(pool);
    await pool.query(
      "INSERT INTO release_registrations(release_id,manifest_json,mechanic_config_json) VALUES ($1,'{}',$2)",
      [
        releaseId,
        JSON.stringify({ version: 1, targets: [target("alpha", 37), target("beta", 37.001)] }),
      ],
    );
    service = new HuntService(pool, "integration-pepper-with-sufficient-length");
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("proves join retry, locked stale acceptance, duplicate no-op, receipt identity, and revocation", async () => {
    const session = await service.createSession({
      creationId: "creation-1",
      releaseId,
      teamLabel: "Team",
    });
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
      invitation: invitations[1]!.invitation,
      participantCredential: credentials[1]!,
    });
    const teammateThree = await service.join(session.sessionId, {
      joinRequestId: "join-3",
      invitation: invitations[2]!.invitation,
      participantCredential: credentials[2]!,
    });

    const command = (
      commandId: string,
      targetId: string,
      latitude: number,
      expectedStateVersion: number,
    ) => ({
      version: 1 as const,
      commandId,
      target: {
        aggregateKind: "team" as const,
        aggregateId: session.teamId,
        schemaId: "plotpoint.hunt.team-state.v1",
        schemaVersion: 1,
      },
      expectedStateVersion,
      type: "plotpoint.hunt.target-discovery.v1",
      payload: { targetId },
      observations: [available(`observation-${commandId}`, latitude)],
    });
    const [alpha, beta] = await Promise.all([
      service.submit(session.sessionId, credentials[0]!, command("alpha-command", "alpha", 37, 0)),
      service.submit(
        session.sessionId,
        credentials[1]!,
        command("beta-command", "beta", 37.001, 0),
      ),
    ]);
    expect([alpha.terminal, beta.terminal].sort()).toEqual(["accepted", "accepted"]);
    expect(new Set([alpha.resultingStateVersion, beta.resultingStateVersion])).toEqual(
      new Set([1, 2]),
    );
    await expect(
      service.submit(session.sessionId, credentials[2]!, command("alpha-repeat", "alpha", 37, 0)),
    ).resolves.toMatchObject({
      terminal: "no-op",
      outcomeCode: "target-already-discovered",
      resultingStateVersion: 2,
    });
    await expect(
      service.submit(session.sessionId, credentials[0]!, command("alpha-command", "alpha", 37, 0)),
    ).resolves.toMatchObject({ disposition: "duplicate", terminal: "accepted" });
    await expect(
      service.submit(session.sessionId, credentials[0]!, {
        ...command("alpha-command", "alpha", 37, 0),
        payload: { targetId: "beta" },
      }),
    ).rejects.toMatchObject({ code: "command-identity-conflict", status: 409 });

    const pull = await service.pull(session.sessionId, credentials[0]!, "0");
    expect(pull.snapshot.projections[0]).toMatchObject({
      stateVersion: 2,
      value: { completedTargets: 2, complete: true },
    });
    await service.revoke(session.sessionId, teammateThree.participantId, "revoke-1");
    await service.revoke(session.sessionId, teammateThree.participantId, "revoke-1");
    await expect(
      service.pull(session.sessionId, credentials[2]!, pull.nextCursor),
    ).rejects.toMatchObject({ code: "participant-revoked", status: 403 });
    await expect(service.pull(session.sessionId, credentials[1]!, "0")).resolves.toMatchObject({
      snapshot: { participantId: teammateTwo.participantId },
    });
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
      version: 1 as const,
      commandId: "fault-command",
      target: {
        aggregateKind: "team" as const,
        aggregateId: session.teamId,
        schemaId: "plotpoint.hunt.team-state.v1",
        schemaVersion: 1,
      },
      expectedStateVersion: 0,
      type: "plotpoint.hunt.target-discovery.v1",
      payload: { targetId: "alpha" },
      observations: [available("observation-fault", 37)],
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
