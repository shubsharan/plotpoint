import { once } from "node:events";

import {
  TARGET_DISCOVERY_COMMAND,
  TARGET_DISCOVERY_CONFIG_SCHEMA,
  TARGET_DISCOVERY_MECHANIC,
  TARGET_DISCOVERY_MODEL,
  TARGET_DISCOVERY_OUTCOME_SCHEMA,
  TARGET_DISCOVERY_PAYLOAD_SCHEMA,
  TARGET_DISCOVERY_PROJECTION_SCHEMA,
  TARGET_DISCOVERY_STATE_SCHEMA,
} from "@plotpoint/modules";
import type { GameComposition, LocationObservation, SyncCommand } from "@plotpoint/protocol";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { createSecret } from "../src/security.js";
import { createApiServer } from "../src/server.js";
import { SharedSessionService, SharedSessionServiceError } from "../src/shared-session-service.js";

const RELEASE_ID = `sha256:${"a".repeat(64)}` as const;
const OTHER_RELEASE_ID = `sha256:${"b".repeat(64)}` as const;
const configuration = {
  targets: [
    {
      targetId: "alpha",
      prompt: "Find alpha",
      zone: "North",
      latitude: 37,
      longitude: -122,
      radiusMeters: 100,
      maximumAgeMs: 15_000,
      maximumAccuracyMeters: 30,
    },
  ],
};

const composition: GameComposition = {
  application: { components: [] },
  aggregateModels: [
    {
      id: "co-op.player",
      authority: "local",
      kind: "player",
      stateSchema: { id: "co-op.player-state" },
      initializationSchema: { id: "co-op.initialization" },
      events: [],
      effects: [],
    },
    {
      id: TARGET_DISCOVERY_MODEL,
      authority: "server",
      kind: "team",
      stateSchema: { id: TARGET_DISCOVERY_STATE_SCHEMA },
      initializationSchema: { id: TARGET_DISCOVERY_CONFIG_SCHEMA },
      events: [],
      effects: [],
    },
  ],
  commands: [
    {
      id: TARGET_DISCOVERY_COMMAND,
      type: TARGET_DISCOVERY_COMMAND,
      aggregateModel: TARGET_DISCOVERY_MODEL,
      payloadSchema: { id: TARGET_DISCOVERY_PAYLOAD_SCHEMA },
      outcomeSchema: { id: TARGET_DISCOVERY_OUTCOME_SCHEMA },
      execution: "trusted-mechanic",
    },
  ],
  progressions: [],
  components: [],
  resources: [
    { id: "co-op.initialization", path: "schemas/co-op-init.json", role: "schema" },
    { id: "co-op.player-state", path: "schemas/co-op-player.json", role: "schema" },
    {
      id: "co-op.targets",
      path: "content/targets.json",
      role: "content",
      schema: { id: TARGET_DISCOVERY_CONFIG_SCHEMA },
    },
    ...[
      TARGET_DISCOVERY_CONFIG_SCHEMA,
      TARGET_DISCOVERY_OUTCOME_SCHEMA,
      TARGET_DISCOVERY_PAYLOAD_SCHEMA,
      TARGET_DISCOVERY_PROJECTION_SCHEMA,
      TARGET_DISCOVERY_STATE_SCHEMA,
    ].map((id) => ({ id, path: `schemas/${id}.json`, role: "schema" as const })),
  ],
  trustedMechanic: {
    id: TARGET_DISCOVERY_MECHANIC,
    aggregateModel: TARGET_DISCOVERY_MODEL,
    commands: [TARGET_DISCOVERY_COMMAND],
    configuration: "co-op.targets",
    projectionSchema: { id: TARGET_DISCOVERY_PROJECTION_SCHEMA },
    capabilities: [{ id: "plotpoint.location.foreground", major: 1, minimumMinor: 0 }],
  },
};

interface FixtureOptions {
  readonly projectionMismatch?: boolean;
  readonly schemaDigestMismatch?: boolean;
}

function rows<Row>(values: readonly Row[]) {
  return { rowCount: values.length, rows: [...values] };
}

function serviceFixture(options: FixtureOptions = {}) {
  let teamId = "team-1";
  let participantId = "participant-1";
  let participantCreated = false;
  let invitationConsumed = false;
  let consumedCredentialDigest: string | null = null;
  let stateVersion = 0;
  let receiptPosition = 0;
  let state: unknown = {
    complete: false,
    completedTargets: 0,
    targets: [{ status: "available", targetId: "alpha" }],
  };
  const schemaDigests = [
    {
      schemaId: TARGET_DISCOVERY_CONFIG_SCHEMA,
      path: `schemas/${TARGET_DISCOVERY_CONFIG_SCHEMA}.json`,
      digest: "sha256:b546973744aecad4c2bcc7c3579235e8403630a622700c3e8e4e83f076e28f6e",
    },
    {
      schemaId: TARGET_DISCOVERY_OUTCOME_SCHEMA,
      path: `schemas/${TARGET_DISCOVERY_OUTCOME_SCHEMA}.json`,
      digest: "sha256:e9e572d33bbd6cc80bceb97058ce8363f323a5736a8cdc414577e7d0a281343f",
    },
    {
      schemaId: TARGET_DISCOVERY_PAYLOAD_SCHEMA,
      path: `schemas/${TARGET_DISCOVERY_PAYLOAD_SCHEMA}.json`,
      digest: "sha256:cdb6e7d4466a8f0145421bebfd7e49b73a2d4ba6804076ee4552559972b9c523",
    },
    {
      schemaId: TARGET_DISCOVERY_PROJECTION_SCHEMA,
      path: `schemas/${TARGET_DISCOVERY_PROJECTION_SCHEMA}.json`,
      digest: "sha256:89f5280dd509d8b0a5f9a098a78a02f74c10d0476c340ca2fd06ac7bd8876739",
    },
    {
      schemaId: TARGET_DISCOVERY_STATE_SCHEMA,
      path: `schemas/${TARGET_DISCOVERY_STATE_SCHEMA}.json`,
      digest: "sha256:78efad0abca11dfcfefcf875c06255e9e072583ae640eab1f842257ca9531a00",
    },
  ];
  if (options.schemaDigestMismatch) {
    schemaDigests[0] = { ...schemaDigests[0]!, digest: `sha256:${"f".repeat(64)}` };
  }
  const manifestJson = {
    gameComposition: composition,
    stateSchemaVersion: 1,
    schemaDigests,
  };
  const query = vi.fn(async (text: string, values: readonly unknown[] = []) => {
    if (
      text.startsWith("BEGIN") ||
      text === "COMMIT" ||
      text === "ROLLBACK" ||
      text.startsWith("SELECT pg_advisory_xact_lock") ||
      text.startsWith("INSERT INTO authoritative_command_journal") ||
      text.startsWith("INSERT INTO authoritative_domain_events") ||
      text.startsWith("INSERT INTO authoritative_operational_events")
    ) {
      return rows([]);
    }
    if (text.includes("FROM hunt_sessions WHERE creation_id")) return rows([]);
    if (text.includes("FROM hunt_invitations WHERE secret_digest")) {
      return rows([
        {
          invitation_id: "invitation-1",
          session_id: "session-1",
          expires_at: "2031-01-01T00:00:00.000Z",
          consumed_at: invitationConsumed ? "2026-08-05T00:00:00.000Z" : null,
          consumed_join_request_id: invitationConsumed ? "join-1" : null,
          consumed_credential_digest: consumedCredentialDigest,
        },
      ]);
    }
    if (text.includes("FROM hunt_sessions") && text.includes("WHERE session_id = $1")) {
      return rows([{ session_id: "session-1", team_id: teamId, release_id: RELEASE_ID }]);
    }
    if (text.includes("FROM release_registrations WHERE release_id")) {
      return rows([{ manifest_json: manifestJson, mechanic_config_json: configuration }]);
    }
    if (text.startsWith("INSERT INTO hunt_sessions")) {
      teamId = String(values[4]);
      return rows([]);
    }
    if (text.startsWith("INSERT INTO team_aggregates")) {
      stateVersion = 0;
      state = JSON.parse(String(values[3]));
      return rows([]);
    }
    if (text.includes("FROM hunt_participants WHERE credential_digest")) {
      return rows([
        {
          participant_id: participantId,
          session_id: "session-1",
          team_id: teamId,
          status: "active",
          receipt_position: String(receiptPosition),
        },
      ]);
    }
    if (
      text.includes("FROM hunt_participants WHERE session_id") &&
      text.includes("join_request_id")
    ) {
      return rows(participantCreated ? [{ participant_id: participantId, team_id: teamId }] : []);
    }
    if (text.startsWith("INSERT INTO hunt_participants")) {
      participantId = String(values[0]);
      participantCreated = true;
      return rows([]);
    }
    if (text.startsWith("UPDATE hunt_invitations")) {
      invitationConsumed = true;
      consumedCredentialDigest = String(values[2]);
      return rows([]);
    }
    if (text.includes("FROM authoritative_command_receipts WHERE session_id")) return rows([]);
    if (text.includes("FROM team_aggregates aggregates JOIN hunt_sessions")) {
      return rows([
        {
          release_id: RELEASE_ID,
          team_id: options.projectionMismatch ? "another-team" : teamId,
          schema_id: TARGET_DISCOVERY_STATE_SCHEMA,
          state_version: stateVersion,
          state_json: state,
          manifest_json: manifestJson,
          mechanic_config_json: configuration,
        },
      ]);
    }
    if (text.startsWith("UPDATE team_aggregates")) {
      stateVersion = Number(values[2]);
      state = JSON.parse(String(values[3]));
      return rows([]);
    }
    if (text.startsWith("UPDATE hunt_participants SET receipt_position")) {
      receiptPosition += 1;
      return rows([{ receipt_position: String(receiptPosition) }]);
    }
    if (text.startsWith("INSERT INTO authoritative_command_receipts")) {
      return rows([
        {
          request_digest: String(values[3]),
          terminal: String(values[5]),
          outcome_code: String(values[6]),
          resulting_state_version: Number(values[7]),
          decision_position: String(values[8]),
        },
      ]);
    }
    if (text.startsWith("UPDATE authoritative_command_receipts SET result_json")) return rows([]);
    if (text.includes("FROM authoritative_command_receipts WHERE participant_id")) return rows([]);
    throw new Error(`unexpected-query:${text}`);
  });
  const client = { query, release: vi.fn() };
  const pool = { connect: vi.fn().mockResolvedValue(client), query } as unknown as Pool;
  return {
    service: new SharedSessionService(pool, "pepper-with-sufficient-length"),
    query,
    state: () => state,
  };
}

async function withApiServer<T>(
  service: Parameters<typeof createApiServer>[0],
  run: (origin: string) => Promise<T>,
): Promise<T> {
  const server = createApiServer(service, { operatorToken: "operator" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("address-invalid");
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error))),
    );
  }
}

function apiFixture() {
  const sync = {
    kind: "snapshot" as const,
    reset: true,
    nextCursor: "0",
    snapshot: {
      sessionId: "session-1",
      releaseId: RELEASE_ID,
      participantId: "participant-1",
      teamId: "team-1",
      membershipStatus: "active" as const,
      confirmedAt: "2026-08-05T00:00:00.000Z",
      projections: [],
    },
    commandResults: [],
  };
  return {
    registerRelease: vi.fn().mockResolvedValue({ releaseId: RELEASE_ID, mechanicId: "mechanic" }),
    createSession: vi.fn().mockResolvedValue({
      sessionId: "session-1",
      teamId: "team-1",
      releaseId: RELEASE_ID,
      disposition: "created",
    }),
    createInvitation: vi.fn().mockResolvedValue({
      invitationId: "invitation-1",
      invitation: "invitation-secret-with-enough-entropy",
      expiresAt: "2031-01-01T00:00:00.000Z",
    }),
    join: vi.fn().mockResolvedValue({
      participantId: "participant-1",
      teamId: "team-1",
      releaseId: RELEASE_ID,
      disposition: "joined",
      sync,
    }),
    revoke: vi.fn().mockResolvedValue(undefined),
    submit: vi.fn().mockResolvedValue({
      commandId: "command-1",
      disposition: "decided",
      terminal: "accepted",
      outcomeCode: "accepted",
      resultingStateVersion: 1,
      decisionPosition: "1",
    }),
    pull: vi.fn().mockResolvedValue(sync),
  };
}

const location: LocationObservation = {
  observationId: "observation-1",
  recordedAt: "2026-08-04T00:00:00.000Z",
  availability: "available",
  capturedAt: "2026-08-04T00:00:00.000Z",
  ageMs: 0,
  latitude: 37,
  longitude: -122,
  horizontalAccuracy: 5,
};

describe("generic shared-session service", () => {
  it("exposes the complete version-prefixed API with plain release-pinned bodies", async () => {
    const fake = apiFixture();
    await withApiServer(fake, async (origin) => {
      const responses = [
        await fetch(`${origin}/v1/releases`, {
          method: "POST",
          headers: {
            authorization: "Bearer operator",
            "content-type": "application/vnd.plotpoint.release",
            "x-plotpoint-expected-release-id": RELEASE_ID,
          },
          body: Uint8Array.of(1, 2, 3),
        }),
        await fetch(`${origin}/v1/shared-sessions`, {
          method: "POST",
          headers: { authorization: "Bearer operator", "content-type": "application/json" },
          body: JSON.stringify({
            creationId: "create-1",
            releaseId: RELEASE_ID,
            teamLabel: "Team",
          }),
        }),
        await fetch(`${origin}/v1/shared-sessions/session-1/invitations`, {
          method: "POST",
          headers: { authorization: "Bearer operator", "content-type": "application/json" },
          body: JSON.stringify({
            invitationId: "invitation-1",
            expiresAt: "2031-01-01T00:00:00.000Z",
          }),
        }),
        await fetch(`${origin}/v1/shared-sessions/session-1/participants`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            joinRequestId: "join-1",
            expectedReleaseId: RELEASE_ID,
            invitation: "invitation-secret-with-enough-entropy",
            participantCredential: "participant-secret-with-enough-entropy",
          }),
        }),
        await fetch(`${origin}/v1/shared-sessions/session-1/participants/participant-1/revoke`, {
          method: "POST",
          headers: { authorization: "Bearer operator", "content-type": "application/json" },
          body: JSON.stringify({ operationId: "revoke-1" }),
        }),
        await fetch(`${origin}/v1/shared-sessions/session-1/commands`, {
          method: "POST",
          headers: {
            authorization: "Bearer participant-secret-with-enough-entropy",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            commandId: "command-1",
            target: {
              aggregateKind: "team",
              aggregateId: "team-1",
              schemaId: "team-state",
            },
            expectedStateVersion: 0,
            type: "trusted.command",
            payload: {},
            observations: [],
          }),
        }),
        await fetch(`${origin}/v1/shared-sessions/session-1/sync?after=0`, {
          headers: { authorization: "Bearer participant-secret-with-enough-entropy" },
        }),
      ];

      expect(responses.map(({ status }) => status)).toEqual([200, 200, 200, 200, 200, 200, 200]);
      const bodies = await Promise.all(responses.map((response) => response.json()));
      expect(JSON.stringify(bodies)).not.toMatch(/"version"\s*:/);
      expect(fake.join).toHaveBeenCalledWith("session-1", {
        joinRequestId: "join-1",
        expectedReleaseId: RELEASE_ID,
        invitation: "invitation-secret-with-enough-entropy",
        participantCredential: "participant-secret-with-enough-entropy",
      });
    });
  });

  it("returns a closed safe error for an HTTP join release mismatch", async () => {
    const fake = apiFixture();
    fake.join.mockRejectedValueOnce(new SharedSessionServiceError("session-release-mismatch", 409));
    await withApiServer(fake, async (origin) => {
      const response = await fetch(`${origin}/v1/shared-sessions/session-1/participants`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          joinRequestId: "join-mismatch",
          expectedReleaseId: OTHER_RELEASE_ID,
          invitation: "invitation-secret-with-enough-entropy",
          participantCredential: "participant-secret-with-enough-entropy",
        }),
      });
      const value = await response.json();

      expect(response.status).toBe(409);
      expect(value).toEqual({
        code: "session-release-mismatch",
        requestId: expect.any(String),
      });
      expect(JSON.stringify(value)).not.toMatch(/invitation|credential|sha256:/);
    });
  });

  it("checks the expected release before reading or consuming an invitation", async () => {
    const fixture = serviceFixture();
    const input = {
      joinRequestId: "join-1",
      expectedReleaseId: OTHER_RELEASE_ID,
      invitation: createSecret(),
      participantCredential: createSecret(),
    };

    await expect(fixture.service.join("session-1", input)).rejects.toMatchObject({
      code: "session-release-mismatch",
      status: 409,
    });
    expect(
      fixture.query.mock.calls.some(([text]) => String(text).includes("hunt_invitations")),
    ).toBe(false);
  });

  it("returns one coherent binding for an exact release-pinned join retry", async () => {
    const fixture = serviceFixture();
    const input = {
      joinRequestId: "join-1",
      expectedReleaseId: RELEASE_ID,
      invitation: createSecret(),
      participantCredential: createSecret(),
    };

    const joined = await fixture.service.join("session-1", input);
    const duplicate = await fixture.service.join("session-1", input);

    expect(joined).toMatchObject({ disposition: "joined", releaseId: RELEASE_ID });
    expect(duplicate).toMatchObject({
      participantId: joined.participantId,
      teamId: joined.teamId,
      releaseId: RELEASE_ID,
      disposition: "duplicate",
    });
    for (const response of [joined, duplicate]) {
      expect(response.releaseId).toBe(response.sync.snapshot.releaseId);
      expect(response.participantId).toBe(response.sync.snapshot.participantId);
      expect(response.teamId).toBe(response.sync.snapshot.teamId);
      expect(response.sync.snapshot.sessionId).toBe("session-1");
      expect(response).not.toHaveProperty("version");
      expect(response.sync).not.toHaveProperty("version");
    }
    await expect(
      fixture.service.join("session-1", { ...input, expectedReleaseId: OTHER_RELEASE_ID }),
    ).rejects.toMatchObject({ code: "session-release-mismatch", status: 409 });
  });

  it("initializes the selected platform model only from registered configuration", async () => {
    const fixture = serviceFixture();
    const created = await fixture.service.createSession({
      creationId: "create-1",
      releaseId: RELEASE_ID,
      teamLabel: "Operator-only Label",
    });
    expect(created).toMatchObject({ releaseId: RELEASE_ID, disposition: "created" });
    expect(fixture.state()).toEqual({
      complete: false,
      completedTargets: 0,
      targets: [{ status: "available", targetId: "alpha" }],
    });
    expect(JSON.stringify(fixture.state())).not.toContain("Operator-only Label");
  });

  it("dispatches a declared command through the release-scoped adapter", async () => {
    const fixture = serviceFixture();
    const created = await fixture.service.createSession({
      creationId: "create-1",
      releaseId: RELEASE_ID,
      teamLabel: "Team",
    });
    const command: SyncCommand = {
      commandId: "command-1",
      target: {
        aggregateKind: "team",
        aggregateId: created.teamId,
        schemaId: TARGET_DISCOVERY_STATE_SCHEMA,
      },
      expectedStateVersion: 0,
      type: TARGET_DISCOVERY_COMMAND,
      payload: { targetId: "alpha" },
      observations: [location],
    };
    await expect(
      fixture.service.submit(created.sessionId, createSecret(), command),
    ).resolves.toMatchObject({
      commandId: "command-1",
      disposition: "decided",
      terminal: "accepted",
      outcomeCode: "target-discovered",
      resultingStateVersion: 1,
    });
    expect(fixture.state()).toMatchObject({ complete: true, completedTargets: 1 });
    expect(JSON.stringify(fixture.query.mock.calls)).toMatch(/request_json/);
  });

  it("rejects an invalid adapter projection instead of stamping a partial view", async () => {
    const fixture = serviceFixture({ projectionMismatch: true });
    await fixture.service.createSession({
      creationId: "create-1",
      releaseId: RELEASE_ID,
      teamLabel: "Team",
    });
    await expect(
      fixture.service.pull("session-1", createSecret(), undefined),
    ).rejects.toMatchObject({
      code: "projection-invalid",
      status: 500,
    });
    expect(fixture.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rejects adapter digest drift", async () => {
    await expect(
      serviceFixture({ schemaDigestMismatch: true }).service.createSession({
        creationId: "create-1",
        releaseId: RELEASE_ID,
        teamLabel: "Team",
      }),
    ).rejects.toThrow("release-registration-invalid");
  });
});
