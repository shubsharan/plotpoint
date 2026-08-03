import {
  canonicalizeValue,
  type Aggregate,
  type DiagnosticCode,
  type ExecutionRecord,
  type ExecutionResult,
  type JsonObject,
  type JsonValue,
} from "@plotpoint/runtime";

export class PlotpointAssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlotpointAssertionError";
  }
}

function pointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

export function firstDifference(expected: JsonValue, actual: JsonValue, path = ""): string | null {
  if (Object.is(expected, actual)) return null;
  if (typeof expected !== typeof actual || expected === null || actual === null) return path;
  if (typeof expected !== "object" || typeof actual !== "object") return path;
  const expectedArray = Array.isArray(expected);
  const actualArray = Array.isArray(actual);
  if (expectedArray !== actualArray) return path;
  if (expectedArray && actualArray) {
    if (expected.length !== actual.length) return `${path}/length`;
    for (let index = 0; index < expected.length; index += 1) {
      const difference = firstDifference(
        expected[index] as JsonValue,
        actual[index] as JsonValue,
        `${path}/${index}`,
      );
      if (difference !== null) return difference;
    }
    return null;
  }
  const expectedObject = expected as JsonObject;
  const actualObject = actual as JsonObject;
  const keys = [...new Set([...Object.keys(expectedObject), ...Object.keys(actualObject)])].sort();
  for (const key of keys) {
    if (!(key in expectedObject) || !(key in actualObject)) return `${path}/${pointerSegment(key)}`;
    const difference = firstDifference(
      expectedObject[key] as JsonValue,
      actualObject[key] as JsonValue,
      `${path}/${pointerSegment(key)}`,
    );
    if (difference !== null) return difference;
  }
  return null;
}

function canonicalValue(value: unknown): JsonValue {
  const canonical = canonicalizeValue(value);
  if (canonical.kind === "invalid") {
    throw new PlotpointAssertionError(`value-not-canonical:${canonical.diagnostic.code}`);
  }
  return canonical.canonical.value;
}

export function assertAccepted<State extends JsonObject, Outcome extends JsonObject>(
  result: ExecutionResult<State, Outcome>,
): asserts result is Extract<ExecutionResult<State, Outcome>, { readonly kind: "accepted" }> {
  if (result.kind !== "accepted")
    throw new PlotpointAssertionError(`expected-accepted:${result.kind}`);
}

export function assertRejected<State extends JsonObject, Outcome extends JsonObject>(
  result: ExecutionResult<State, Outcome>,
): asserts result is Extract<ExecutionResult<State, Outcome>, { readonly kind: "rejected" }> {
  if (result.kind !== "rejected")
    throw new PlotpointAssertionError(`expected-rejected:${result.kind}`);
}

export function assertNoOp<State extends JsonObject, Outcome extends JsonObject>(
  result: ExecutionResult<State, Outcome>,
): asserts result is Extract<ExecutionResult<State, Outcome>, { readonly kind: "no-op" }> {
  if (result.kind !== "no-op") throw new PlotpointAssertionError(`expected-no-op:${result.kind}`);
}

export function assertInvalid<State extends JsonObject, Outcome extends JsonObject>(
  result: ExecutionResult<State, Outcome>,
  code?: DiagnosticCode,
): asserts result is Extract<ExecutionResult<State, Outcome>, { readonly kind: "invalid" }> {
  if (result.kind !== "invalid")
    throw new PlotpointAssertionError(`expected-invalid:${result.kind}`);
  if (code !== undefined && !result.diagnostics.some((diagnostic) => diagnostic.code === code)) {
    throw new PlotpointAssertionError(`missing-diagnostic:${code}`);
  }
}

export function assertCanonicalRecordEqual(left: ExecutionRecord, right: ExecutionRecord): void {
  const difference = firstDifference(canonicalValue(left), canonicalValue(right));
  if (difference !== null) throw new PlotpointAssertionError(`record-mismatch:${difference}`);
}

export function assertInputsPreserved(before: unknown, after: unknown): void {
  const difference = firstDifference(canonicalValue(before), canonicalValue(after));
  if (difference !== null) throw new PlotpointAssertionError(`input-mutated:${difference}`);
}

export function assertAggregateIsolation(
  before: readonly Aggregate[],
  after: readonly Aggregate[],
): void {
  assertInputsPreserved(before, after);
}

export function assertObservationConsumption(record: ExecutionRecord, expectedCount: number): void {
  if (record.observationTrace.length !== expectedCount) {
    throw new PlotpointAssertionError(
      `observation-consumption-mismatch:${record.observationTrace.length}:${expectedCount}`,
    );
  }
}

export function assertEffectsAsData(record: ExecutionRecord): void {
  canonicalValue(record.effectIntents ?? []);
}

export function assertProgressionStable(result: ExecutionResult<JsonObject, JsonObject>): void {
  if (result.kind === "invalid") throw new PlotpointAssertionError("progression-not-stable");
  canonicalValue(result.aggregate.progression ?? null);
}

export function assertDiagnostic(
  result: ExecutionResult<JsonObject, JsonObject>,
  code: DiagnosticCode,
): void {
  assertInvalid(result, code);
}
