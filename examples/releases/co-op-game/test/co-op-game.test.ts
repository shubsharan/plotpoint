import { describe, expect, it } from "vitest";

import targetConfiguration from "../content/targets.json" with { type: "json" };

const PARTICIPANTS = ["participant-one", "participant-two", "participant-three"] as const;
const REVISED_MAXIMUM_AGE_MS = 30_000;

type TargetConfiguration = typeof targetConfiguration;
type Target = TargetConfiguration["targets"][number];

function reviseObservationFreshness(
  configuration: TargetConfiguration,
  maximumAgeMs: number,
): TargetConfiguration {
  return {
    targets: configuration.targets.map((target) => ({ ...target, maximumAgeMs })),
  };
}

function withoutObservationFreshness({ maximumAgeMs: _maximumAgeMs, ...target }: Target) {
  return target;
}

describe("co-op game two-release journey", () => {
  it("assigns every real target to three participants and changes only observation freshness", () => {
    expect(targetConfiguration.targets).toHaveLength(PARTICIPANTS.length);

    const firstReleaseAssignments = targetConfiguration.targets.map((target, index) => ({
      participantId: PARTICIPANTS[index],
      targetId: target.targetId,
      observation: {
        ageMs: target.maximumAgeMs + 1,
        horizontalAccuracy: target.maximumAccuracyMeters,
        latitude: target.latitude,
        longitude: target.longitude,
      },
    }));
    expect(firstReleaseAssignments).toEqual([
      expect.objectContaining({ participantId: "participant-one", targetId: "ferry-building" }),
      expect.objectContaining({ participantId: "participant-two", targetId: "rincon-park" }),
      expect.objectContaining({ participantId: "participant-three", targetId: "south-park" }),
    ]);
    expect(new Set(firstReleaseAssignments.map(({ targetId }) => targetId)).size).toBe(
      targetConfiguration.targets.length,
    );

    const revisedConfiguration = reviseObservationFreshness(
      targetConfiguration,
      REVISED_MAXIMUM_AGE_MS,
    );
    expect(revisedConfiguration).not.toEqual(targetConfiguration);
    expect(revisedConfiguration.targets.map(withoutObservationFreshness)).toEqual(
      targetConfiguration.targets.map(withoutObservationFreshness),
    );
    expect(revisedConfiguration.targets.map(({ maximumAgeMs }) => maximumAgeMs)).toEqual([
      REVISED_MAXIMUM_AGE_MS,
      REVISED_MAXIMUM_AGE_MS,
      REVISED_MAXIMUM_AGE_MS,
    ]);
  });
});
