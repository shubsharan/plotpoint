import { canonicalizeValue, type JsonObject } from "./canonical-json.js";

export const DIAGNOSTIC_CODES = [
  "canonical-value-invalid",
  "canonical-limit-exceeded",
  "runtime-policy-invalid",
  "aggregate-invalid",
  "command-invalid",
  "command-target-mismatch",
  "stale-aggregate-version",
  "state-version-overflow",
  "observation-exhausted",
  "observation-order-mismatch",
  "observation-unused",
  "handler-threw",
  "handler-result-invalid",
  "command-binding-missing",
  "command-payload-invalid",
  "aggregate-model-mismatch",
  "aggregate-state-invalid",
  "initialization-input-invalid",
  "initializer-threw",
  "initialized-state-invalid",
  "initial-progression-invalid",
  "no-op-output-invalid",
  "progression-graph-invalid",
  "progression-state-invalid",
  "progression-intent-invalid",
  "progression-rule-failed",
  "progression-conflict",
  "progression-cycle",
  "progression-limit-overrun",
] as const;

export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly details: JsonObject;
}

const diagnosticCodeSet: ReadonlySet<string> = new Set(DIAGNOSTIC_CODES);

export function isDiagnosticCode(value: string): value is DiagnosticCode {
  return diagnosticCodeSet.has(value);
}

export function createDiagnostic(code: DiagnosticCode, details: JsonObject): Diagnostic {
  const result = canonicalizeValue(details);
  if (
    result.kind === "invalid" ||
    Array.isArray(result.canonical.value) ||
    result.canonical.value === null
  ) {
    throw new TypeError("Diagnostic details must be a canonical object");
  }
  return Object.freeze({ code, details: result.canonical.value as JsonObject });
}
