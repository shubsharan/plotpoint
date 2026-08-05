import { describe, expect, it } from "vitest";
import {
  decideTargetDiscovery,
  initialTeamHuntState,
  parseTargetDiscoveryConfigV1,
  targetDiscoveryConfigReleasePath,
} from "../src/index.js";

const config = parseTargetDiscoveryConfigV1({
  version: 1,
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

const available = (overrides: Record<string, unknown> = {}) => ({
  version: 1 as const,
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

describe("trusted target discovery", () => {
  it("addresses the compiler-emitted configuration by stable content identity", () => {
    expect(targetDiscoveryConfigReleasePath()).toBe(
      "content/706c6f74706f696e742e68756e742e746172676574732e7631.json",
    );
  });
  it("accepts an in-zone observation and makes a duplicate a no-op", () => {
    const first = decideTargetDiscovery({
      config,
      state: initialTeamHuntState(config),
      targetId: "alpha",
      observation: available(),
    });
    expect(first).toMatchObject({ terminal: "accepted", outcomeCode: "target-discovered" });
    expect(
      decideTargetDiscovery({
        config,
        state: first.state,
        targetId: "alpha",
        observation: available(),
      }),
    ).toMatchObject({ terminal: "no-op" });
  });

  it.each([
    [undefined, "location-missing"],
    [
      {
        version: 1,
        observationId: "denied",
        recordedAt: "2026-08-04T00:00:00.000Z",
        availability: "permission-denied",
      },
      "location-permission-denied",
    ],
    [available({ ageMs: -1 }), "location-future"],
    [available({ ageMs: 15_001 }), "location-stale"],
    [available({ horizontalAccuracy: 31 }), "location-inaccurate"],
    [available({ latitude: 40 }), "location-outside-zone"],
  ])("rejects non-qualifying evidence", (observation, outcomeCode) => {
    expect(
      decideTargetDiscovery({
        config,
        state: initialTeamHuntState(config),
        targetId: "alpha",
        observation: observation as never,
      }),
    ).toMatchObject({ terminal: "rejected", outcomeCode });
  });

  it("accepts a different target from a stale aggregate view when that target remains available", () => {
    const first = decideTargetDiscovery({
      config,
      state: initialTeamHuntState(config),
      targetId: "alpha",
      observation: available(),
    });
    expect(
      decideTargetDiscovery({
        config,
        state: first.state,
        targetId: "beta",
        observation: available({ latitude: 37.001 }),
      }),
    ).toMatchObject({ terminal: "accepted" });
  });
});
