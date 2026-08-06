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
  const aggregateId = overrides.aggregateId ?? `${kind}-fixture`;
  if (aggregateId.length === 0) {
    throw new TypeError(`Invalid ${kind} fixture: aggregate-id-invalid`);
  }
  const stateVersion = overrides.stateVersion ?? 0;
  if (!Number.isSafeInteger(stateVersion) || stateVersion < 0) {
    throw new TypeError(`Invalid ${kind} fixture: state-version-invalid`);
  }
  const validatedState = overrides.model.stateSchema.validate(overrides.state);
  if (!validatedState.valid) {
    throw new TypeError(`Invalid ${kind} fixture: state-invalid`);
  }
  if (
    (overrides.model.progression === undefined) !== (overrides.progression === undefined) ||
    (overrides.model.progression !== undefined &&
      overrides.progression?.graphId !== overrides.model.progression.graphId)
  ) {
    throw new TypeError(`Invalid ${kind} fixture: progression-model-mismatch`);
  }
  const candidate = {
    aggregateId,
    modelId: overrides.model.modelId,
    aggregateKind: kind,
    schemaId: overrides.model.stateSchema.id,
    stateVersion,
    state: validatedState.value,
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
