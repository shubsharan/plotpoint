import {
  canonicalizeValue,
  type Aggregate,
  type AggregateAuthority,
  type AggregateKind,
  type JsonObject,
  type ProgressionInstance,
} from "@plotpoint/runtime";

export interface FixtureOverrides<State extends JsonObject> {
  readonly state: State;
  readonly id?: string;
  readonly schemaVersion?: number;
  readonly stateVersion?: number;
  readonly authority?: AggregateAuthority;
  readonly progression?: ProgressionInstance;
}

function aggregateFixture<State extends JsonObject>(
  kind: AggregateKind,
  overrides: FixtureOverrides<State>,
): Aggregate<State> {
  const candidate = {
    kind,
    id: overrides.id ?? `${kind}-fixture`,
    schemaVersion: overrides.schemaVersion ?? 1,
    stateVersion: overrides.stateVersion ?? 0,
    authority: overrides.authority ?? "local",
    state: overrides.state,
    ...(overrides.progression === undefined ? {} : { progression: overrides.progression }),
  };
  const canonical = canonicalizeValue(candidate);
  if (canonical.kind === "invalid") {
    throw new TypeError(`Invalid ${kind} fixture: ${canonical.diagnostic.code}`);
  }
  return canonical.canonical.value as unknown as Aggregate<State>;
}

export function playerFixture<State extends JsonObject>(
  overrides: FixtureOverrides<State>,
): Aggregate<State> {
  return aggregateFixture("player", overrides);
}

export function teamFixture<State extends JsonObject>(
  overrides: FixtureOverrides<State>,
): Aggregate<State> {
  return aggregateFixture("team", overrides);
}

export function sessionFixture<State extends JsonObject>(
  overrides: FixtureOverrides<State>,
): Aggregate<State> {
  return aggregateFixture("session", overrides);
}
