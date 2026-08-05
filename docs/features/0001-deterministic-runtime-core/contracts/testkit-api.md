# Contract: Deterministic Testkit

## Compatibility Surface

Gate 1 exposes named fixtures, harnesses, assertions, and replay helpers from `@plotpoint/testkit`. The package consumes only the public `@plotpoint/runtime` root API for this feature. Property generators used by Plotpoint's own tests remain internal.

## Scripted Observations

```ts
export function clock(value: string | number): Observation;
export function identifier(value: string): Observation;
export function random(value: number): Observation;
export function observation(kind: string, key: string, value: JsonValue): Observation;
export function capability(key: string, value: JsonValue): Observation;
```

Helpers construct ordinary canonical observation entries; they do not expose fallback clocks, random generators, identifier generators, or devices. Random values must be finite and within the contract range selected by the corresponding command definition.

## Aggregate Fixtures

```ts
export function playerFixture<State extends JsonObject>(
  overrides: FixtureOverrides<State>,
): Aggregate<State, "player">;
export function teamFixture<State extends JsonObject>(
  overrides: FixtureOverrides<State>,
): Aggregate<State, "team">;
export function sessionFixture<State extends JsonObject>(
  overrides: FixtureOverrides<State>,
): Aggregate<State, "session">;
```

Fixture defaults are explicit and appear in returned data. Builders create detached values so test
fixtures cannot share mutable nested references accidentally.

## Scenario Harness

```ts
export interface RuntimeScenario<State, Payload, Outcome, Kind> {
  readonly name: string;
  readonly definition: CommandDefinition<State, Payload, Outcome, Kind>;
  readonly aggregate: Aggregate<State, Kind>;
  readonly command: Command<Payload, Kind>;
  readonly observations: readonly Observation[];
  readonly progression?: DefinedProgression<State, Payload, Outcome, Kind>;
  readonly policy?: Partial<RuntimePolicy>;
}

export interface HarnessOptions {
  readonly failOnUnusedObservations?: boolean;
  readonly auditKnownAmbientApis?: boolean;
  readonly repeat?: number;
}

export function createRuntimeHarness(options?: HarnessOptions): RuntimeHarness;
export function runScenario<State, Payload, Outcome, Kind>(
  scenario: RuntimeScenario<State, Payload, Outcome, Kind>,
  options?: HarnessOptions,
): ScenarioResult<State, Outcome>;
```

Default strict author behavior is:

- unused observations fail the scenario;
- inputs and nested aliases are snapshotted and checked after execution;
- the scenario runs at least once, with callers able to request the 100 repeats needed by the feature evidence;
- each repeated execution compares canonical state, outcome, events, effects, observation trace, progression trace, diagnostics, and record text;
- common ambient APIs are replaced with throwing sentinels only for the isolated test scope and restored even when a scenario fails;
- tests that alter process globals run serially.

Ambient auditing covers the declared supported test environment and is evidence, not a hostile-code security sandbox. Imported filesystem or network modules and arbitrary closure behavior remain compiler/isolation concerns.

## Consumption Failures

| Condition                         | Runtime result                              | Strict harness result                         |
| --------------------------------- | ------------------------------------------- | --------------------------------------------- |
| Script ends before a request      | Invalid `observation-exhausted`             | Failed scenario                               |
| Next script identity differs      | Invalid `observation-order-mismatch`        | Failed scenario with expected/actual identity |
| Script contains remaining entries | Accepted/rejected result plus unused trace  | Failed scenario when strict mode is enabled   |
| Script value is non-canonical     | Invalid canonical diagnostic before handler | Failed scenario                               |

The harness never supplies a default ambient value.

## Replay

```ts
export interface ReplayInput<State, Payload, Outcome, Kind> {
  readonly record: ExecutionRecord<State, Outcome>;
  readonly definition: CommandDefinition<State, Payload, Outcome, Kind>;
  readonly progression?: DefinedProgression<State, Payload, Outcome, Kind>;
}

export function replayScenario<State, Payload, Outcome>(
  input: ReplayInput<State, Payload, Outcome>,
): ReplayResult<State, Outcome>;
```

Replay accepts only a recorded execution result's record. Preflight invalidity is intentionally non-replayable. Replay requires the same stable command and progression definition identity because release identity and compiled definition lookup are later-gate concerns. It reuses the record's canonical aggregate, command, observations, and resolved policy, then compares the complete canonical result and record. A mismatch identifies the first material path rather than returning only `false`.

## Assertions

Public assertions cover:

- accepted, rejected, no-op, and invalid result variants;
- canonical record equality;
- caller input and nested alias preservation;
- exact observation consumption;
- expected cycle, conflict, and limit diagnostics.

Assertions produce test-framework-neutral thrown assertion errors. Plotpoint's own suite and documented contributor workflow use Vitest, while consumers may use another runner without changing runtime semantics.
Mutation, isolation, effect non-execution, progression stability, exact consumption, and repeatability are enforced by the harness rather than exposed as assertions that overstate what one result can prove. Known ambient API use is reported as an explicit harness error naming the blocked API; it is not flattened into `handler-threw`.

## Internal Model Evidence

Repository tests run under Vitest and use `fast-check` with an independent, simpler progression reference model. Generators and model commands are not exported from `@plotpoint/testkit` in Gate 1. Every failure must print a replayable seed/path; retained regression fixtures cover discovered counterexamples.
