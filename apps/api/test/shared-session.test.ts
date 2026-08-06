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
import { SharedSessionService } from "../src/shared-session-service.js";

const RELEASE_ID = `sha256:${"a".repeat(64)}` as const;
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
  readonly schemaVersionMismatch?: boolean;
}

function rows<Row>(values: readonly Row[]) {
  return { rowCount: values.length, rows: [...values] };
}

function serviceFixture(options: FixtureOptions = {}) {
  let teamId = "team-uninitialized";
  let stateVersion = 0;
  let state: unknown;
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
    if (text.includes("FROM release_registrations WHERE release_id")) {
      return rows([{ manifest_json: manifestJson, mechanic_config_json: configuration }]);
    }
    if (text.startsWith("INSERT INTO hunt_sessions")) {
      teamId = String(values[4]);
      return rows([]);
    }
    if (text.startsWith("INSERT INTO team_aggregates")) {
      stateVersion = 0;
      state = JSON.parse(String(values[4]));
      return rows([]);
    }
    if (text.includes("FROM hunt_participants WHERE credential_digest")) {
      return rows([
        {
          participant_id: "participant-1",
          session_id: "session-1",
          team_id: teamId,
          status: "active",
        },
      ]);
    }
    if (text.includes("FROM authoritative_command_receipts WHERE session_id")) return rows([]);
    if (text.includes("FROM team_aggregates aggregates JOIN hunt_sessions")) {
      return rows([
        {
          release_id: RELEASE_ID,
          team_id: options.projectionMismatch ? "another-team" : teamId,
          schema_id: TARGET_DISCOVERY_STATE_SCHEMA,
          schema_version: options.schemaVersionMismatch ? 2 : 1,
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
    if (text.startsWith("INSERT INTO authoritative_command_receipts")) {
      return rows([
        {
          request_digest: String(values[3]),
          terminal: String(values[4]),
          outcome_code: String(values[5]),
          resulting_state_version: Number(values[6]),
          decision_position: "1",
        },
      ]);
    }
    if (text.includes("COALESCE(MAX(decision_position)")) return rows([{ position: "0" }]);
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
        schemaVersion: 1,
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
    expect(JSON.stringify(fixture.query.mock.calls)).not.toMatch(/latitude|longitude/);
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

  it("rejects adapter digest drift and persisted aggregate schema-version drift", async () => {
    await expect(
      serviceFixture({ schemaDigestMismatch: true }).service.createSession({
        creationId: "create-1",
        releaseId: RELEASE_ID,
        teamLabel: "Team",
      }),
    ).rejects.toThrow("release-registration-invalid");

    const fixture = serviceFixture({ schemaVersionMismatch: true });
    await fixture.service.createSession({
      creationId: "create-1",
      releaseId: RELEASE_ID,
      teamLabel: "Team",
    });
    await expect(fixture.service.pull("session-1", createSecret(), undefined)).rejects.toThrow(
      "authoritative-aggregate-invalid",
    );
  });
});
