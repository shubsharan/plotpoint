import type { JsonObject } from "./canonical-json.js";
import { createDiagnostic, type Diagnostic } from "./diagnostics.js";
import type { ProgressionInstance } from "./progression/state.js";

export const AGGREGATE_KINDS = ["player", "team", "session"] as const;
export type AggregateKind = (typeof AGGREGATE_KINDS)[number];

export const AGGREGATE_AUTHORITIES = ["local", "server"] as const;
export type AggregateAuthority = (typeof AGGREGATE_AUTHORITIES)[number];
export type AggregateAuthorityForKind<Kind extends AggregateKind> = Kind extends "player"
  ? "local"
  : "server";

export interface Aggregate<
  State extends JsonObject = JsonObject,
  Kind extends AggregateKind = AggregateKind,
> {
  readonly aggregateId: string;
  readonly modelId: string;
  readonly aggregateKind: Kind;
  readonly schemaId: string;
  readonly stateVersion: number;
  readonly state: State;
  readonly progression?: ProgressionInstance;
}

export function isAggregateKind(value: unknown): value is AggregateKind {
  return typeof value === "string" && AGGREGATE_KINDS.includes(value as AggregateKind);
}

export function isAggregateAuthority(value: unknown): value is AggregateAuthority {
  return typeof value === "string" && AGGREGATE_AUTHORITIES.includes(value as AggregateAuthority);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function validateAggregate(value: unknown): Diagnostic | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return createDiagnostic("aggregate-invalid", {
      field: "aggregate",
      reason: "not-object",
    });
  }
  const aggregate = value as Record<string, unknown>;
  for (const field of ["aggregateId", "modelId", "schemaId"] as const) {
    if (!isNonEmptyString(aggregate[field])) {
      return createDiagnostic("aggregate-invalid", {
        field,
        reason: "empty-identity",
      });
    }
  }
  if (!isAggregateKind(aggregate.aggregateKind)) {
    return createDiagnostic("aggregate-invalid", {
      field: "aggregateKind",
      reason: "invalid-kind",
    });
  }
  if (!Number.isSafeInteger(aggregate.stateVersion) || (aggregate.stateVersion as number) < 0) {
    return createDiagnostic("aggregate-invalid", {
      field: "stateVersion",
      reason: "invalid-version",
    });
  }
  if (
    aggregate.state === null ||
    typeof aggregate.state !== "object" ||
    Array.isArray(aggregate.state)
  ) {
    return createDiagnostic("aggregate-invalid", {
      field: "state",
      reason: "not-object",
    });
  }
  const allowed = new Set([
    "aggregateId",
    "modelId",
    "aggregateKind",
    "schemaId",
    "stateVersion",
    "state",
    "progression",
  ]);
  const unexpected = Object.keys(aggregate).find((field) => !allowed.has(field));
  if (unexpected !== undefined) {
    return createDiagnostic("aggregate-invalid", {
      field: unexpected,
      reason: "unexpected-field",
    });
  }
  return null;
}
