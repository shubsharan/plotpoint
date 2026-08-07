import {
  canonicalizeValue,
  type Aggregate,
  type AggregateKind,
  type ExecutableAggregateModel,
  type ExecutionResult,
  type JsonObject,
  type Observation,
  type RuntimeCommand,
} from "@plotpoint/runtime";

import { firstDifference } from "./assertions.js";

export interface RuntimeScenario<Kind extends AggregateKind = AggregateKind> {
  readonly name: string;
  readonly model: ExecutableAggregateModel<Kind>;
  readonly aggregate: Aggregate<JsonObject, Kind>;
  readonly command: RuntimeCommand<JsonObject, Kind>;
  readonly observations: readonly Observation[];
  readonly nonTargetAggregates?: readonly Aggregate[];
}

export interface HarnessOptions {
  readonly failOnUnusedObservations?: boolean;
  readonly auditKnownAmbientApis?: boolean;
  readonly repeat?: number;
}

export interface RuntimeHarness {
  run<Kind extends AggregateKind>(
    scenario: RuntimeScenario<Kind>,
  ): ExecutionResult<JsonObject, JsonObject, JsonObject, Kind>;
}

export type ScenarioResult<Kind extends AggregateKind = AggregateKind> = ExecutionResult<
  JsonObject,
  JsonObject,
  JsonObject,
  Kind
>;

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

function snapshotScenario(scenario: RuntimeScenario) {
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
    run<Kind extends AggregateKind>(
      scenario: RuntimeScenario<Kind>,
    ): ExecutionResult<JsonObject, JsonObject, JsonObject, Kind> {
      const before = snapshotScenario(scenario);
      let first: ExecutionResult<JsonObject, JsonObject, JsonObject, Kind> | undefined;
      for (let index = 0; index < repeat; index += 1) {
        const execute = () =>
          scenario.model.execute({
            aggregate: scenario.aggregate,
            command: scenario.command,
            observations: scenario.observations,
          });
        const audited = auditKnownAmbientApis
          ? withKnownAmbientAudit(execute)
          : { value: execute() };
        if (audited.violation !== undefined) {
          throw new RuntimeHarnessError("ambient-authority-used", audited.violation);
        }
        const current = audited.value;
        const after = snapshotScenario(scenario);
        const inputDifference = firstDifference(before, after);
        if (inputDifference !== null)
          throw new RuntimeHarnessError("input-mutated", inputDifference);
        if (
          failOnUnusedObservations &&
          current.kind === "recorded" &&
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
      if (first === undefined) throw new TypeError("Harness produced no execution result");
      return first;
    },
  });
}

export function runScenario<Kind extends AggregateKind>(
  scenario: RuntimeScenario<Kind>,
  options?: HarnessOptions,
): ScenarioResult<Kind> {
  return createRuntimeHarness(options).run(scenario);
}
