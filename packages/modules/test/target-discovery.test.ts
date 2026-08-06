import type { Aggregate, JsonObject } from "@plotpoint/runtime";
import type {
  GameComposition,
  LocationObservation,
  SyncCommand,
  TrustedMechanicBinding,
} from "@plotpoint/protocol";
import { describe, expect, it } from "vitest";
import {
  TARGET_DISCOVERY_COMMAND,
  TARGET_DISCOVERY_CONFIG_SCHEMA,
  TARGET_DISCOVERY_MECHANIC,
  TARGET_DISCOVERY_MODEL,
  TARGET_DISCOVERY_OUTCOME_SCHEMA,
  TARGET_DISCOVERY_PAYLOAD_SCHEMA,
  TARGET_DISCOVERY_PROJECTION_SCHEMA,
  TARGET_DISCOVERY_STATE_SCHEMA,
  resolveTrustedMechanic,
  targetDiscoveryConfigReleasePath,
} from "../src/index.js";

const config = Object.freeze({
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
    {
      targetId: "beta",
      prompt: "Find beta",
      zone: "South",
      latitude: 37.001,
      longitude: -122,
      radiusMeters: 100,
      maximumAgeMs: 15_000,
      maximumAccuracyMeters: 30,
    },
  ],
});

const binding: TrustedMechanicBinding = {
  id: TARGET_DISCOVERY_MECHANIC,
  aggregateModel: TARGET_DISCOVERY_MODEL,
  commands: [TARGET_DISCOVERY_COMMAND],
  configuration: "co-op.targets",
  projectionSchema: { id: TARGET_DISCOVERY_PROJECTION_SCHEMA },
  capabilities: [{ id: "plotpoint.location.foreground", major: 1, minimumMinor: 0 }],
};

const composition: GameComposition = {
  application: { components: [] },
  aggregateModels: [
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
    {
      id: "co-op.targets",
      path: "content/636f2d6f702e74617267657473.json",
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
  trustedMechanic: binding,
};

const participant = Object.freeze({
  sessionId: "session-1",
  participantId: "participant-1",
  teamId: "team-1",
});

function adapter() {
  const result = resolveTrustedMechanic({ binding, composition, configuration: config });
  if (result.kind !== "resolved") throw new Error(result.diagnostic.code);
  if (result.aggregateKind !== "team") throw new Error("unexpected-mechanic-kind");
  return result.adapter;
}

function aggregate(mechanic = adapter(), configuration = config) {
  const initialized = mechanic.model.initialize(configuration);
  if (initialized.kind !== "initialized") throw new Error(initialized.diagnostics[0]?.code);
  return { ...initialized.aggregate, aggregateId: participant.teamId };
}

type AvailableLocation = Extract<LocationObservation, { readonly availability: "available" }>;

const available = (overrides: Partial<AvailableLocation> = {}): AvailableLocation => ({
  observationId: "observation-1",
  recordedAt: "2026-08-04T00:00:00.000Z",
  availability: "available" as const,
  capturedAt: "2026-08-04T00:00:00.000Z",
  ageMs: 0,
  latitude: 37,
  longitude: -122,
  horizontalAccuracy: 5,
  ...overrides,
});

const denied: LocationObservation = {
  observationId: "denied",
  recordedAt: "2026-08-04T00:00:00.000Z",
  availability: "permission-denied",
};

describe("trusted target discovery", () => {
  it("addresses the compiler-emitted configuration by stable content identity", () => {
    expect(targetDiscoveryConfigReleasePath(binding)).toBe(
      "content/636f2d6f702e74617267657473.json",
    );
  });

  it("executes an in-zone observation with coordinate-free terminal evidence", () => {
    const command = syncCommand(available());
    const mechanic = adapter();
    const result = mechanic.execute({
      participant,
      aggregate: aggregate(mechanic),
      command,
      observations: command.observations,
    });
    expect(result).toMatchObject({
      terminal: "accepted",
      outcomeCode: "target-discovered",
      aggregateBefore: { stateVersion: 0 },
      aggregateAfter: { stateVersion: 1 },
      capabilityEvidence: [{ observationId: "observation-1", disposition: "consumed" }],
    });
    expect(JSON.stringify(result)).not.toMatch(/latitude|longitude|horizontalAccuracy/);
  });

  it.each([
    [[], undefined, "location-missing"],
    [undefined, denied, "location-denied"],
    [undefined, available({ ageMs: -1 }), "location-future"],
    [undefined, available({ ageMs: 15_001 }), "location-stale"],
    [undefined, available({ horizontalAccuracy: 31 }), "location-inaccurate"],
    [undefined, available({ latitude: 40 }), "location-outside-zone"],
  ])("rejects non-qualifying evidence", (observationOverride, observation, code) => {
    const command = syncCommand(observation);
    expect(
      adapter().execute({
        participant,
        aggregate: aggregate(),
        command,
        observations: observationOverride ?? command.observations,
      }),
    ).toMatchObject({ terminal: "rejected", outcomeCode: code });
  });

  it("rejects antipodal evidence when floating-point error exceeds the haversine domain", () => {
    const antipodalConfiguration = {
      targets: [{ ...config.targets[0]!, latitude: -87.4, longitude: 0 }],
    };
    const resolved = resolveTrustedMechanic({
      binding,
      composition,
      configuration: antipodalConfiguration,
    });
    if (resolved.kind !== "resolved" || resolved.aggregateKind !== "team") {
      throw new Error("antipodal-mechanic-resolution-failed");
    }
    const observation = available({ latitude: 87.4, longitude: 180 });
    const command = syncCommand(observation);
    expect(
      resolved.adapter.execute({
        participant,
        aggregate: aggregate(resolved.adapter, antipodalConfiguration),
        command,
        observations: command.observations,
      }),
    ).toMatchObject({ terminal: "rejected", outcomeCode: "location-outside-zone" });
  });

  it("initializes, executes accepted/no-op decisions, and projects one complete team view", () => {
    const mechanic = adapter();
    const initialized = mechanic.model.initialize(config);
    if (initialized.kind !== "initialized") throw new Error(initialized.diagnostics[0]?.code);
    expect(initialized.aggregate).not.toHaveProperty("progression");
    const aggregate: Aggregate<JsonObject, "team"> = {
      ...initialized.aggregate,
      aggregateId: participant.teamId,
    };
    const first = mechanic.execute({
      participant,
      aggregate,
      command: syncCommand(available(), 99),
      observations: [available()],
    });
    expect(first).toMatchObject({
      terminal: "accepted",
      outcomeCode: "target-discovered",
      aggregateAfter: { stateVersion: 1 },
    });
    expect(JSON.stringify(first)).not.toMatch(/latitude|longitude|horizontalAccuracy/);
    expect(
      mechanic.execute({
        participant,
        aggregate: first.aggregateAfter,
        command: syncCommand(available(), 0),
        observations: [available()],
      }),
    ).toMatchObject({
      terminal: "no-op",
      outcomeCode: "target-already-discovered",
      aggregateAfter: { stateVersion: 1 },
    });

    expect(mechanic.project({ participant, aggregate: first.aggregateAfter })).toEqual({
      kind: "projected",
      projection: {
        aggregateKind: "team",
        aggregateId: "team-1",
        schemaId: TARGET_DISCOVERY_PROJECTION_SCHEMA,
        stateVersion: 1,
        value: first.aggregateAfter.state,
      },
    });
  });

  it("commits mechanic-owned freshness dispositions for revised 5-second and 30-second policies", () => {
    const executeWithMaximumAge = (maximumAgeMs: number) => {
      const revised = { targets: config.targets.map((target) => ({ ...target, maximumAgeMs })) };
      const resolved = resolveTrustedMechanic({ binding, composition, configuration: revised });
      if (resolved.kind !== "resolved" || resolved.aggregateKind !== "team") {
        throw new Error("revised-mechanic-resolution-failed");
      }
      const initialized = resolved.adapter.model.initialize(revised);
      if (initialized.kind !== "initialized") throw new Error("revised-mechanic-init-failed");
      const aggregate = { ...initialized.aggregate, aggregateId: participant.teamId };
      return resolved.adapter.execute({
        participant,
        aggregate,
        command: syncCommand(available({ ageMs: 10_000 }), 0),
        observations: [available({ ageMs: 10_000 })],
      });
    };

    expect(executeWithMaximumAge(5_000)).toMatchObject({
      terminal: "rejected",
      capabilityEvidence: [{ disposition: "expired" }],
    });
    expect(executeWithMaximumAge(30_000)).toMatchObject({
      terminal: "accepted",
      capabilityEvidence: [{ disposition: "consumed" }],
    });
  });

  it("returns explicit invalid execution and projection results", () => {
    const mechanic = adapter();
    const wrongTarget = syncCommand(available());
    expect(
      mechanic.execute({
        participant,
        aggregate: aggregate(mechanic),
        command: { ...wrongTarget, target: { ...wrongTarget.target, aggregateId: "other-team" } },
        observations: wrongTarget.observations,
      }),
    ).toMatchObject({ terminal: "invalid", outcomeCode: "command-target-mismatch" });

    expect(
      mechanic.project({
        participant,
        aggregate: {
          aggregateId: "other-team",
          modelId: TARGET_DISCOVERY_MODEL,
          aggregateKind: "team",
          schemaId: TARGET_DISCOVERY_STATE_SCHEMA,
          stateVersion: 0,
          state: { targets: [], completedTargets: 0, complete: false },
        },
      }),
    ).toEqual({
      kind: "invalid",
      diagnostic: {
        code: "projection-invalid",
        logicalIds: ["other-team", "team-1", TARGET_DISCOVERY_PROJECTION_SCHEMA],
      },
    });

    expect(
      mechanic.project({
        participant,
        aggregate: {
          aggregateId: participant.teamId,
          modelId: TARGET_DISCOVERY_MODEL,
          aggregateKind: "team",
          schemaId: TARGET_DISCOVERY_STATE_SCHEMA,
          stateVersion: -1,
          state: { targets: [], completedTargets: 0, complete: false },
        },
      }),
    ).toMatchObject({ kind: "invalid", diagnostic: { code: "projection-invalid" } });
  });
});

function syncCommand(observation: LocationObservation | undefined, version = 7): SyncCommand {
  return {
    commandId: "command-1",
    target: {
      aggregateKind: "team",
      aggregateId: participant.teamId,
      schemaId: TARGET_DISCOVERY_STATE_SCHEMA,
    },
    expectedStateVersion: version,
    type: TARGET_DISCOVERY_COMMAND,
    payload: { targetId: "alpha" },
    observations: observation === undefined ? [] : [observation],
  };
}
