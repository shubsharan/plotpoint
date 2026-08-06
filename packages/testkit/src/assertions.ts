import {
  canonicalizeValue,
  type DiagnosticCode,
  type ExecutionRecord,
  type ExecutionResult,
  type AggregateKind,
  type JsonObject,
  type JsonValue,
  type PreflightInvalidExecution,
  type RecordedExecution,
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

type RecordedWithTerminal<
  State extends JsonObject,
  Outcome extends JsonObject,
  Payload extends JsonObject,
  Kind extends AggregateKind,
  Terminal extends ExecutionRecord["terminal"],
> = RecordedExecution<State, Outcome, Payload, Kind> & {
  readonly record: ExecutionRecord<State, Outcome, Payload, Kind> & {
    readonly terminal: Terminal;
  };
};

export function assertAccepted<
  State extends JsonObject,
  Outcome extends JsonObject,
  Payload extends JsonObject,
  Kind extends AggregateKind,
>(
  result: ExecutionResult<State, Outcome, Payload, Kind>,
): asserts result is RecordedWithTerminal<State, Outcome, Payload, Kind, "accepted"> {
  if (result.kind !== "recorded" || result.record.terminal !== "accepted") {
    const actual = result.kind === "recorded" ? result.record.terminal : result.kind;
    throw new PlotpointAssertionError(`expected-accepted:${actual}`);
  }
}

export function assertRejected<
  State extends JsonObject,
  Outcome extends JsonObject,
  Payload extends JsonObject,
  Kind extends AggregateKind,
>(
  result: ExecutionResult<State, Outcome, Payload, Kind>,
): asserts result is RecordedWithTerminal<State, Outcome, Payload, Kind, "rejected"> {
  if (result.kind !== "recorded" || result.record.terminal !== "rejected") {
    const actual = result.kind === "recorded" ? result.record.terminal : result.kind;
    throw new PlotpointAssertionError(`expected-rejected:${actual}`);
  }
}

export function assertNoOp<
  State extends JsonObject,
  Outcome extends JsonObject,
  Payload extends JsonObject,
  Kind extends AggregateKind,
>(
  result: ExecutionResult<State, Outcome, Payload, Kind>,
): asserts result is RecordedWithTerminal<State, Outcome, Payload, Kind, "no-op"> {
  if (result.kind !== "recorded" || result.record.terminal !== "no-op") {
    const actual = result.kind === "recorded" ? result.record.terminal : result.kind;
    throw new PlotpointAssertionError(`expected-no-op:${actual}`);
  }
}

export function assertInvalid<
  State extends JsonObject,
  Outcome extends JsonObject,
  Payload extends JsonObject,
  Kind extends AggregateKind,
>(
  result: ExecutionResult<State, Outcome, Payload, Kind>,
  code?: DiagnosticCode,
): asserts result is
  | PreflightInvalidExecution
  | RecordedWithTerminal<State, Outcome, Payload, Kind, "invalid"> {
  if (result.kind === "preflight-invalid") {
    if (code !== undefined && !result.diagnostics.some((diagnostic) => diagnostic.code === code)) {
      throw new PlotpointAssertionError(`missing-diagnostic:${code}`);
    }
    return;
  }
  if (result.record.terminal !== "invalid") {
    throw new PlotpointAssertionError(`expected-invalid:${result.record.terminal}`);
  }
  if (
    code !== undefined &&
    !result.record.diagnostics.some((diagnostic) => diagnostic.code === code)
  ) {
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

export function assertObservationConsumption(record: ExecutionRecord, expectedCount: number): void {
  if (record.observationTrace.length !== expectedCount) {
    throw new PlotpointAssertionError(
      `observation-consumption-mismatch:${record.observationTrace.length}:${expectedCount}`,
    );
  }
}

export function assertDiagnostic(
  result: ExecutionResult<JsonObject, JsonObject, JsonObject, AggregateKind>,
  code: DiagnosticCode,
): void {
  assertInvalid(result, code);
}
