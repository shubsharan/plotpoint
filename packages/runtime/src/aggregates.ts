import type { JsonObject } from "./canonical-json.js";
import { createDiagnostic, type Diagnostic } from "./diagnostics.js";
import type { ProgressionInstance } from "./progression/state.js";

export const AGGREGATE_KINDS = ["player", "team", "session"] as const;
export type AggregateKind = (typeof AGGREGATE_KINDS)[number];

export const AGGREGATE_AUTHORITIES = ["local", "server"] as const;
export type AggregateAuthority = (typeof AGGREGATE_AUTHORITIES)[number];

export interface Aggregate<
  State extends JsonObject = JsonObject,
  Kind extends AggregateKind = AggregateKind,
> {
  readonly kind: Kind;
  readonly id: string;
  readonly schemaVersion: number;
  readonly stateVersion: number;
  readonly authority: AggregateAuthority;
  readonly state: State;
  readonly progression?: ProgressionInstance;
}

export function isAggregateKind(value: unknown): value is AggregateKind {
  return typeof value === "string" && AGGREGATE_KINDS.includes(value as AggregateKind);
}

export function isAggregateAuthority(value: unknown): value is AggregateAuthority {
  return typeof value === "string" && AGGREGATE_AUTHORITIES.includes(value as AggregateAuthority);
}

export function validateAggregate(value: unknown): Diagnostic | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return createDiagnostic("aggregate-invalid", {
      field: "aggregate",
      reason: "not-object",
    });
  }
  const aggregate = value as Record<string, unknown>;
  if (!isAggregateKind(aggregate.kind)) {
    return createDiagnostic("aggregate-invalid", {
      field: "kind",
      reason: "invalid-kind",
    });
  }
  if (typeof aggregate.id !== "string" || aggregate.id.length === 0) {
    return createDiagnostic("aggregate-invalid", {
      field: "id",
      reason: "empty-identity",
    });
  }
  if (!Number.isSafeInteger(aggregate.schemaVersion) || (aggregate.schemaVersion as number) < 1) {
    return createDiagnostic("aggregate-invalid", {
      field: "schemaVersion",
      reason: "invalid-version",
    });
  }
  if (!Number.isSafeInteger(aggregate.stateVersion) || (aggregate.stateVersion as number) < 0) {
    return createDiagnostic("aggregate-invalid", {
      field: "stateVersion",
      reason: "invalid-version",
    });
  }
  if (!isAggregateAuthority(aggregate.authority)) {
    return createDiagnostic("aggregate-invalid", {
      field: "authority",
      reason: "invalid-authority",
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
  return null;
}
