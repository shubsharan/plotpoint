import {
  canonicalizeValue,
  type Aggregate,
  type AggregateKind,
  type ExecutableAggregateModel,
  type JsonObject,
  type ProgressionInstance,
} from "@plotpoint/runtime";

export interface FixtureOverrides<State extends JsonObject, Kind extends AggregateKind> {
  readonly model: ExecutableAggregateModel<Kind>;
  readonly state: State;
  readonly aggregateId?: string;
  readonly stateVersion?: number;
  readonly progression?: ProgressionInstance;
}

function aggregateFixture<State extends JsonObject, Kind extends AggregateKind>(
  kind: Kind,
  overrides: FixtureOverrides<State, Kind>,
): Aggregate<State, Kind> {
  if (overrides.model.aggregateKind !== kind) {
    throw new TypeError(`Invalid ${kind} fixture: aggregate-model-kind-mismatch`);
  }
  const candidate = {
    aggregateId: overrides.aggregateId ?? `${kind}-fixture`,
    modelId: overrides.model.modelId,
    aggregateKind: kind,
    schemaId: overrides.model.stateSchema.id,
    stateVersion: overrides.stateVersion ?? 0,
    state: overrides.state,
    ...(overrides.progression === undefined ? {} : { progression: overrides.progression }),
  };
  const canonical = canonicalizeValue(candidate);
  if (canonical.kind === "invalid") {
    throw new TypeError(`Invalid ${kind} fixture: ${canonical.diagnostic.code}`);
  }
  return canonical.canonical.value as unknown as Aggregate<State, Kind>;
}

export function playerFixture<State extends JsonObject>(
  overrides: FixtureOverrides<State, "player">,
): Aggregate<State, "player"> {
  return aggregateFixture("player", overrides);
}

export function teamFixture<State extends JsonObject>(
  overrides: FixtureOverrides<State, "team">,
): Aggregate<State, "team"> {
  return aggregateFixture("team", overrides);
}

export function sessionFixture<State extends JsonObject>(
  overrides: FixtureOverrides<State, "session">,
): Aggregate<State, "session"> {
  return aggregateFixture("session", overrides);
}
