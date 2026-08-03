import {
  canonicalizeValue,
  executeCommand,
  type Aggregate,
  type AggregateKind,
  type Command,
  type CommandDefinition,
  type DefinedProgression,
  type ExecutionResult,
  type JsonObject,
  type Observation,
  type RuntimePolicy,
} from "@plotpoint/runtime";

import { firstDifference } from "./assertions.js";

export interface RuntimeScenario<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
  Kind extends AggregateKind = AggregateKind,
> {
  readonly name: string;
  readonly definition: CommandDefinition<State, Payload, Outcome, Kind>;
  readonly aggregate: Aggregate<State, Kind>;
  readonly command: Command<Payload, Kind>;
  readonly observations: readonly Observation[];
  readonly progression?: DefinedProgression<State, Payload, Outcome, Kind>;
  readonly policy?: Partial<RuntimePolicy>;
  readonly nonTargetAggregates?: readonly Aggregate[];
}

export interface HarnessOptions {
  readonly failOnUnusedObservations?: boolean;
  readonly auditKnownAmbientApis?: boolean;
  readonly repeat?: number;
}

export interface RuntimeHarness {
  run<
    State extends JsonObject,
    Payload extends JsonObject,
    Outcome extends JsonObject,
    Kind extends AggregateKind,
  >(
    scenario: RuntimeScenario<State, Payload, Outcome, Kind>,
  ): ExecutionResult<State, Outcome, Payload, Kind>;
}

export type ScenarioResult<
  State extends JsonObject,
  Outcome extends JsonObject,
  Payload extends JsonObject = JsonObject,
  Kind extends AggregateKind = AggregateKind,
> = ExecutionResult<State, Outcome, Payload, Kind>;

export class RuntimeHarnessError extends Error {
  readonly code:
    | "ambient-authority-used"
    | "input-mutated"
    | "observation-unused"
    | "record-mismatch";
  readonly path?: string;

  constructor(code: RuntimeHarnessError["code"], path?: string) {
    super(path === undefined ? code : `${code}:${path}`);
    this.name = "RuntimeHarnessError";
    this.code = code;
    this.path = path;
  }
}

interface PatchedProperty {
  readonly target: object;
  readonly key: PropertyKey;
  readonly descriptor: PropertyDescriptor | undefined;
}

function patchProperty(
  changes: PatchedProperty[],
  target: object,
  key: PropertyKey,
  descriptor: PropertyDescriptor,
): void {
  const original = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { configurable: true, ...descriptor });
  changes.push({ target, key, descriptor: original });
}

function withKnownAmbientAudit<Value>(run: () => Value): {
  readonly value: Value;
  readonly violation?: string;
} {
  const changes: PatchedProperty[] = [];
  let violation: string | undefined;
  const blocked = (name: string) => () => {
    violation ??= name;
    throw new Error("known-ambient-authority-used");
  };
  try {
    patchProperty(changes, Date, "now", { value: blocked("clock"), writable: true });
    patchProperty(changes, Math, "random", { value: blocked("randomness"), writable: true });
    patchProperty(changes, globalThis, "fetch", { value: blocked("network"), writable: true });
    patchProperty(changes, globalThis, "localStorage", { get: blocked("storage") });
    if (globalThis.crypto !== undefined) {
      patchProperty(changes, globalThis.crypto, "randomUUID", {
        value: blocked("identifier"),
        writable: true,
      });
      patchProperty(changes, globalThis.crypto, "getRandomValues", {
        value: blocked("randomness"),
        writable: true,
      });
    }
    const value = run();
    return violation === undefined ? { value } : { value, violation };
  } finally {
    for (const change of changes.reverse()) {
      if (change.descriptor === undefined) Reflect.deleteProperty(change.target, change.key);
      else Object.defineProperty(change.target, change.key, change.descriptor);
    }
  }
}

function snapshotScenario(scenario: RuntimeScenario<JsonObject, JsonObject, JsonObject>) {
  const snapshot = canonicalizeValue({
    aggregate: scenario.aggregate,
    command: scenario.command,
    observations: scenario.observations,
    nonTargetAggregates: scenario.nonTargetAggregates ?? [],
  });
  if (snapshot.kind === "invalid")
    throw new TypeError(`Invalid scenario snapshot: ${snapshot.diagnostic.code}`);
  return snapshot.canonical.value;
}

export function createRuntimeHarness(options: HarnessOptions = {}): RuntimeHarness {
  const failOnUnusedObservations = options.failOnUnusedObservations ?? true;
  const auditKnownAmbientApis = options.auditKnownAmbientApis ?? true;
  const repeat = options.repeat ?? 1;
  if (!Number.isSafeInteger(repeat) || repeat < 1)
    throw new TypeError("Harness repeat must be a positive integer");

  return Object.freeze({
    run<
      State extends JsonObject,
      Payload extends JsonObject,
      Outcome extends JsonObject,
      Kind extends AggregateKind,
    >(
      scenario: RuntimeScenario<State, Payload, Outcome, Kind>,
    ): ExecutionResult<State, Outcome, Payload, Kind> {
      const comparableScenario = scenario as unknown as RuntimeScenario<
        JsonObject,
        JsonObject,
        JsonObject
      >;
      const before = snapshotScenario(comparableScenario);
      let first: ExecutionResult<State, Outcome, Payload, Kind> | undefined;
      for (let index = 0; index < repeat; index += 1) {
        const execute = () =>
          executeCommand({
            definition: scenario.definition,
            aggregate: scenario.aggregate,
            command: scenario.command,
            observations: scenario.observations,
            ...(scenario.progression === undefined ? {} : { progression: scenario.progression }),
            ...(scenario.policy === undefined ? {} : { policy: scenario.policy }),
          });
        const audited = auditKnownAmbientApis
          ? withKnownAmbientAudit(execute)
          : { value: execute() };
        if (audited.violation !== undefined) {
          throw new RuntimeHarnessError("ambient-authority-used", audited.violation);
        }
        const current = audited.value;
        const after = snapshotScenario(comparableScenario);
        const inputDifference = firstDifference(before, after);
        if (inputDifference !== null)
          throw new RuntimeHarnessError("input-mutated", inputDifference);
        if (
          failOnUnusedObservations &&
          "record" in current &&
          current.record.observationTrace.length !== scenario.observations.length
        ) {
          throw new RuntimeHarnessError(
            "observation-unused",
            `/${current.record.observationTrace.length}`,
          );
        }
        if (first === undefined) {
          first = current;
        } else {
          const expected = canonicalizeValue(first);
          const actual = canonicalizeValue(current);
          if (expected.kind === "invalid" || actual.kind === "invalid") {
            throw new TypeError("Runtime returned a non-canonical result");
          }
          const difference = firstDifference(expected.canonical.value, actual.canonical.value);
          if (difference !== null) throw new RuntimeHarnessError("record-mismatch", difference);
        }
      }
      return first as ExecutionResult<State, Outcome, Payload, Kind>;
    },
  });
}

export function runScenario<
  State extends JsonObject,
  Payload extends JsonObject,
  Outcome extends JsonObject,
  Kind extends AggregateKind,
>(
  scenario: RuntimeScenario<State, Payload, Outcome, Kind>,
  options?: HarnessOptions,
): ScenarioResult<State, Outcome, Payload, Kind> {
  return createRuntimeHarness(options).run(scenario);
}
