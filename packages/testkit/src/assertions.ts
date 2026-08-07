import {
  canonicalizeValue,
  type DiagnosticCode,
  type ExecutionRecord,
  type ExecutionResult,
  type Aggregate,
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

export function canonicalRecordDifference(
  expected: ExecutionRecord,
  actual: ExecutionRecord,
): string | null {
  return firstDifference(canonicalValue(expected), canonicalValue(actual));
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

type AcceptedRecorded<
  State extends JsonObject,
  Outcome extends JsonObject,
  Payload extends JsonObject,
  Kind extends AggregateKind,
> = RecordedWithTerminal<State, Outcome, Payload, Kind, "accepted"> & {
  readonly record: { readonly aggregateAfter: Aggregate<State, Kind> };
};

function assertPriorVersion(record: ExecutionRecord, terminal: ExecutionRecord["terminal"]): void {
  const beforeVersion = record.aggregateBefore.stateVersion;
  if (record.priorStateVersion !== beforeVersion) {
    throw new PlotpointAssertionError(
      `expected-${terminal}:prior-version-mismatch:${record.priorStateVersion}:${beforeVersion}`,
    );
  }
}

function assertUncommittedRecord(
  result: RecordedExecution<JsonObject, JsonObject, JsonObject, AggregateKind>,
  terminal: "invalid" | "no-op" | "rejected",
): void {
  if (result.record.aggregateAfter !== undefined) {
    throw new PlotpointAssertionError(`expected-${terminal}:unexpected-aggregate-after`);
  }
  assertPriorVersion(result.record, terminal);
  if (result.record.resultingStateVersion !== result.record.priorStateVersion) {
    throw new PlotpointAssertionError(
      `expected-${terminal}:version-changed:${result.record.priorStateVersion}:${result.record.resultingStateVersion}`,
    );
  }
  const difference = firstDifference(
    canonicalValue(result.record.aggregateBefore),
    canonicalValue(result.aggregate),
  );
  if (difference !== null) {
    throw new PlotpointAssertionError(`expected-${terminal}:aggregate-mismatch:${difference}`);
  }
}

export function assertAccepted<
  State extends JsonObject,
  Outcome extends JsonObject,
  Payload extends JsonObject,
  Kind extends AggregateKind,
>(
  result: ExecutionResult<State, Outcome, Payload, Kind>,
): asserts result is AcceptedRecorded<State, Outcome, Payload, Kind> {
  if (result.kind !== "recorded" || result.record.terminal !== "accepted") {
    const actual = result.kind === "recorded" ? result.record.terminal : result.kind;
    throw new PlotpointAssertionError(`expected-accepted:${actual}`);
  }
  if (result.record.aggregateAfter === undefined) {
    throw new PlotpointAssertionError("expected-accepted:record-incomplete");
  }
  assertPriorVersion(result.record, "accepted");
  const afterVersion = result.record.aggregateAfter.stateVersion;
  if (result.record.resultingStateVersion !== afterVersion) {
    throw new PlotpointAssertionError(
      `expected-accepted:resulting-version-mismatch:${result.record.resultingStateVersion}:${afterVersion}`,
    );
  }
  if (result.record.resultingStateVersion !== result.record.priorStateVersion + 1) {
    throw new PlotpointAssertionError(
      `expected-accepted:version-not-incremented:${result.record.priorStateVersion}:${result.record.resultingStateVersion}`,
    );
  }
  const difference = firstDifference(
    canonicalValue(result.record.aggregateAfter),
    canonicalValue(result.aggregate),
  );
  if (difference !== null) {
    throw new PlotpointAssertionError(`expected-accepted:aggregate-mismatch:${difference}`);
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
  assertUncommittedRecord(result, "rejected");
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
  assertUncommittedRecord(result, "no-op");
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
  assertUncommittedRecord(result, "invalid");
  if (
    code !== undefined &&
    !result.record.diagnostics.some((diagnostic) => diagnostic.code === code)
  ) {
    throw new PlotpointAssertionError(`missing-diagnostic:${code}`);
  }
}

export function assertCanonicalRecordEqual(left: ExecutionRecord, right: ExecutionRecord): void {
  const difference = canonicalRecordDifference(left, right);
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
