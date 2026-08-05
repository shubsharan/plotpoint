import type { LocationObservation, SharedProjection } from "@plotpoint/protocol";

export const TARGET_DISCOVERY_COMMAND = "plotpoint.hunt.target-discovery" as const;
export const TEAM_HUNT_SCHEMA = "plotpoint.hunt.team-state" as const;
export const TARGET_DISCOVERY_CONFIG_CONTENT_ID = "plotpoint.hunt.targets" as const;

export function targetDiscoveryConfigReleasePath(): string {
  const encoded = Array.from(new TextEncoder().encode(TARGET_DISCOVERY_CONFIG_CONTENT_ID), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `content/${encoded}.json`;
}

export interface HuntTargetConfig {
  readonly targetId: string;
  readonly prompt: string;
  readonly zone: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusMeters: number;
  readonly maximumAgeMs: number;
  readonly maximumAccuracyMeters: number;
}

export interface TargetDiscoveryConfig {
  readonly targets: readonly HuntTargetConfig[];
}

export interface TeamHuntState {
  readonly targets: readonly {
    readonly targetId: string;
    readonly status: "available" | "discovered";
  }[];
  readonly completedTargets: number;
  readonly complete: boolean;
}

export type TargetDiscoveryDecision =
  | {
      readonly terminal: "accepted";
      readonly outcomeCode: "target-discovered";
      readonly state: TeamHuntState;
    }
  | {
      readonly terminal: "no-op";
      readonly outcomeCode: "target-already-discovered";
      readonly state: TeamHuntState;
    }
  | { readonly terminal: "rejected"; readonly outcomeCode: string; readonly state: TeamHuntState }
  | { readonly terminal: "invalid"; readonly outcomeCode: string; readonly state: TeamHuntState };

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseTargetDiscoveryConfig(value: unknown): TargetDiscoveryConfig {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("target-config-invalid");
  const candidate = value as Record<string, unknown>;
  if (
    !Array.isArray(candidate.targets) ||
    candidate.targets.length === 0 ||
    Object.keys(candidate).some((key) => key !== "targets")
  )
    throw new Error("target-config-invalid");
  const identities = new Set<string>();
  const targets = candidate.targets
    .map((entry) => {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry))
        throw new Error("target-config-invalid");
      const target = entry as Record<string, unknown>;
      const expected = [
        "targetId",
        "prompt",
        "zone",
        "latitude",
        "longitude",
        "radiusMeters",
        "maximumAgeMs",
        "maximumAccuracyMeters",
      ];
      if (
        Object.keys(target).length !== expected.length ||
        expected.some((key) => !Object.hasOwn(target, key)) ||
        typeof target.targetId !== "string" ||
        target.targetId.length === 0 ||
        identities.has(target.targetId) ||
        typeof target.prompt !== "string" ||
        typeof target.zone !== "string" ||
        !finite(target.latitude) ||
        target.latitude < -90 ||
        target.latitude > 90 ||
        !finite(target.longitude) ||
        target.longitude < -180 ||
        target.longitude > 180 ||
        !finite(target.radiusMeters) ||
        target.radiusMeters <= 0 ||
        !Number.isSafeInteger(target.maximumAgeMs) ||
        (target.maximumAgeMs as number) < 0 ||
        !finite(target.maximumAccuracyMeters) ||
        target.maximumAccuracyMeters < 0
      )
        throw new Error("target-config-invalid");
      identities.add(target.targetId);
      return Object.freeze(target as unknown as HuntTargetConfig);
    })
    .sort((left, right) =>
      left.targetId < right.targetId ? -1 : left.targetId > right.targetId ? 1 : 0,
    );
  return Object.freeze({ targets: Object.freeze(targets) });
}

export function initialTeamHuntState(config: TargetDiscoveryConfig): TeamHuntState {
  return Object.freeze({
    targets: Object.freeze(
      config.targets.map(({ targetId }) =>
        Object.freeze({ targetId, status: "available" as const }),
      ),
    ),
    completedTargets: 0,
    complete: false,
  });
}

function distanceMeters(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number,
): number {
  const radians = Math.PI / 180;
  const dLatitude = (latitude2 - latitude1) * radians;
  const dLongitude = (longitude2 - longitude1) * radians;
  const a =
    Math.sin(dLatitude / 2) ** 2 +
    Math.cos(latitude1 * radians) * Math.cos(latitude2 * radians) * Math.sin(dLongitude / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function decideTargetDiscovery(input: {
  readonly config: TargetDiscoveryConfig;
  readonly state: TeamHuntState;
  readonly targetId: string;
  readonly observation: LocationObservation | undefined;
}): TargetDiscoveryDecision {
  const target = input.config.targets.find(({ targetId }) => targetId === input.targetId);
  const stateTarget = input.state.targets.find(({ targetId }) => targetId === input.targetId);
  if (target === undefined || stateTarget === undefined)
    return { terminal: "invalid", outcomeCode: "target-unknown", state: input.state };
  if (stateTarget.status === "discovered")
    return { terminal: "no-op", outcomeCode: "target-already-discovered", state: input.state };
  const observation = input.observation;
  if (observation === undefined)
    return { terminal: "rejected", outcomeCode: "location-missing", state: input.state };
  if (observation.availability !== "available")
    return {
      terminal: "rejected",
      outcomeCode: `location-${observation.availability}`,
      state: input.state,
    };
  if (observation.ageMs < 0)
    return { terminal: "rejected", outcomeCode: "location-future", state: input.state };
  if (observation.ageMs > target.maximumAgeMs)
    return { terminal: "rejected", outcomeCode: "location-stale", state: input.state };
  if (observation.horizontalAccuracy > target.maximumAccuracyMeters)
    return { terminal: "rejected", outcomeCode: "location-inaccurate", state: input.state };
  if (
    distanceMeters(observation.latitude, observation.longitude, target.latitude, target.longitude) >
    target.radiusMeters
  ) {
    return { terminal: "rejected", outcomeCode: "location-outside-zone", state: input.state };
  }
  const targets = input.state.targets.map((entry) =>
    entry.targetId === input.targetId ? { ...entry, status: "discovered" as const } : entry,
  );
  const completedTargets = targets.filter(({ status }) => status === "discovered").length;
  return {
    terminal: "accepted",
    outcomeCode: "target-discovered",
    state: Object.freeze({
      targets: Object.freeze(targets),
      completedTargets,
      complete: completedTargets === targets.length,
    }),
  };
}

export function projectTeamHuntState(
  teamId: string,
  stateVersion: number,
  state: TeamHuntState,
): SharedProjection {
  return {
    aggregateKind: "team",
    aggregateId: teamId,
    schemaId: TEAM_HUNT_SCHEMA,
    schemaVersion: 1,
    stateVersion,
    value: {
      targets: state.targets.map((target) => ({
        targetId: target.targetId,
        status: target.status,
      })),
      completedTargets: state.completedTargets,
      complete: state.complete,
    },
  };
}
