import type { Aggregate, AggregateAuthorityForKind, AggregateKind } from "./aggregates.js";
import type { JsonObject } from "./canonical-json.js";
import type { Command, HandlerDecision } from "./commands.js";
import type { Diagnostic } from "./diagnostics.js";
import type { ExecutionResult } from "./execution-record.js";
import type { Observation } from "./observations.js";
import type { ProgressionDefinition } from "./progression/graph.js";

export type SchemaValidationResult<Value> =
  | { readonly valid: true; readonly value: Value }
  | { readonly valid: false; readonly diagnostics: readonly Diagnostic[] };

export interface RuntimeSchema<Value> {
  readonly id: string;
  readonly schemaDigest: `sha256:${string}`;
  validate(value: unknown): SchemaValidationResult<Value>;
}

export type CommandBindingEvaluation<State extends JsonObject> =
  | {
      readonly kind: "decision";
      readonly decision: HandlerDecision<State, JsonObject>;
    }
  | {
      readonly kind: "invalid-payload";
      readonly diagnostics: readonly Diagnostic[];
    };

export interface ResolvedCommandBinding<State extends JsonObject, Kind extends AggregateKind> {
  readonly registrationId: string;
  readonly commandType: string;
  readonly payloadSchema: RuntimeSchema<JsonObject>;
  readonly outcomeSchema: RuntimeSchema<JsonObject>;
  evaluate(input: {
    readonly aggregate: Aggregate<State, Kind>;
    readonly command: Command<JsonObject, Kind>;
    readonly observations: readonly Observation[];
  }): CommandBindingEvaluation<State>;
}

export interface ResolvedAggregateModel<Kind extends AggregateKind, State extends JsonObject> {
  readonly modelId: string;
  readonly aggregateKind: Kind;
  readonly authority: AggregateAuthorityForKind<Kind>;
  readonly stateSchema: RuntimeSchema<State>;
  readonly initializationSchema: RuntimeSchema<JsonObject>;
  initializeState(input: JsonObject): State;
  readonly commandsByType: Readonly<Record<string, ResolvedCommandBinding<State, Kind>>>;
  readonly eventSchemas: Readonly<Record<string, RuntimeSchema<JsonObject>>>;
  readonly effectSchemas: Readonly<Record<string, RuntimeSchema<JsonObject>>>;
  readonly progression?: Kind extends "player" ? ProgressionDefinition<State, Kind> : never;
}

export type InitializationResult<Kind extends AggregateKind> =
  | { readonly kind: "initialized"; readonly aggregate: Aggregate<JsonObject, Kind> }
  | { readonly kind: "invalid"; readonly diagnostics: readonly Diagnostic[] };

export interface ExecutableAggregateModel<Kind extends AggregateKind> {
  readonly modelId: string;
  readonly aggregateKind: Kind;
  readonly authority: AggregateAuthorityForKind<Kind>;
  readonly stateSchema: RuntimeSchema<JsonObject>;
  readonly initializationSchema: RuntimeSchema<JsonObject>;
  readonly commandContracts: Readonly<
    Record<
      string,
      {
        readonly registrationId: string;
        readonly payloadSchema: RuntimeSchema<JsonObject>;
        readonly outcomeSchema: RuntimeSchema<JsonObject>;
      }
    >
  >;
  readonly eventSchemas: Readonly<Record<string, RuntimeSchema<JsonObject>>>;
  readonly effectSchemas: Readonly<Record<string, RuntimeSchema<JsonObject>>>;
  readonly progression?: { readonly graphId: string };
  initialize(input: JsonObject): InitializationResult<Kind>;
  execute(input: {
    readonly aggregate: Aggregate<JsonObject, Kind>;
    readonly command: Command<JsonObject, Kind>;
    readonly observations: readonly Observation[];
  }): ExecutionResult<JsonObject, JsonObject, JsonObject, Kind>;
}
