import { canonicalizeValue } from "@plotpoint/runtime";

import type { CandidateTransition } from "../model";

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function stringArray(value: unknown, unique = false): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every(nonEmpty) &&
    (!unique || new Set(value).size === value.length)
  );
}

function canonicalObject(value: unknown): boolean {
  return isObject(value) && canonicalizeValue(value).kind !== "invalid";
}

export type CandidateValidation =
  | { readonly kind: "valid"; readonly candidate: CandidateTransition }
  | { readonly kind: "invalid"; readonly code: string };

export function validateCandidateTransition(value: unknown): CandidateValidation {
  if (!isObject(value)) return { kind: "invalid", code: "transition-candidate-invalid" };
  if (
    !nonEmpty(value.commandId) ||
    !nonEmpty(value.aggregateId) ||
    value.aggregateKind !== "player" ||
    !nonEmpty(value.schemaId) ||
    !Number.isSafeInteger(value.schemaVersion) ||
    (value.schemaVersion as number) < 1 ||
    !Number.isSafeInteger(value.expectedVersion) ||
    (value.expectedVersion as number) < 0
  ) {
    return { kind: "invalid", code: "transition-identity-invalid" };
  }
  if (!stringArray(value.observationIds)) {
    return { kind: "invalid", code: "transition-observation-invalid" };
  }
  if (new Set(value.observationIds).size !== value.observationIds.length) {
    return { kind: "invalid", code: "transition-observation-duplicate" };
  }

  const base = [
    "aggregateId",
    "aggregateKind",
    "commandId",
    "commandOutcome",
    "expectedVersion",
    "observationIds",
    "schemaId",
    "schemaVersion",
  ];
  if (value.commandOutcome === "accepted") {
    if (
      !hasExactKeys(value, [...base, "nextState", "outcome", "progressionChanges"]) ||
      !canonicalObject(value.nextState) ||
      !canonicalObject(value.outcome) ||
      !stringArray(value.progressionChanges)
    ) {
      return { kind: "invalid", code: "transition-terminal-shape-invalid" };
    }
  } else if (value.commandOutcome === "no-op" || value.commandOutcome === "rejected") {
    if (!hasExactKeys(value, [...base, "outcome"]) || !canonicalObject(value.outcome)) {
      return { kind: "invalid", code: "transition-terminal-shape-invalid" };
    }
  } else if (value.commandOutcome === "invalid") {
    if (!hasExactKeys(value, [...base, "diagnosticCodes"]) || !stringArray(value.diagnosticCodes)) {
      return { kind: "invalid", code: "transition-terminal-shape-invalid" };
    }
  } else {
    return { kind: "invalid", code: "transition-terminal-invalid" };
  }
  return { kind: "valid", candidate: value as unknown as CandidateTransition };
}
