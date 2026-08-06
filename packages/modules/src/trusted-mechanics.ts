import type {
  Aggregate,
  ExecutableAggregateModel,
  JsonObject,
  RuntimeSchema,
} from "@plotpoint/runtime";
import type {
  GameComposition,
  LocationObservation,
  SharedProjection,
  SyncCommand,
  SyncCommandResult,
  TrustedMechanicBinding,
} from "@plotpoint/protocol";

import { createTargetDiscoveryAdapter } from "./mechanics/target-discovery.js";

export type MechanicDiagnosticCode =
  | "invalid-binding"
  | "invalid-configuration"
  | "model-contract-mismatch"
  | "command-contract-mismatch"
  | "schema-contract-mismatch"
  | "projection-invalid";

export interface MechanicDiagnostic {
  readonly code: MechanicDiagnosticCode;
  readonly logicalIds: readonly string[];
}

export interface ValidatedMechanicBinding {
  readonly binding: TrustedMechanicBinding;
  readonly configuration: JsonObject;
  readonly initializationInput: JsonObject;
}

export type MechanicBindingValidation =
  | { readonly kind: "valid"; readonly value: ValidatedMechanicBinding }
  | { readonly kind: "invalid"; readonly diagnostic: MechanicDiagnostic };

export interface AuthorizedParticipant {
  readonly sessionId: string;
  readonly participantId: string;
  readonly teamId: string;
}

export type PersistedObservation = LocationObservation;

export type MechanicProjection =
  | { readonly kind: "projected"; readonly projection: SharedProjection }
  | { readonly kind: "invalid"; readonly diagnostic: MechanicDiagnostic };

export interface MechanicExecution<Kind extends "team" | "session"> {
  readonly terminal: "accepted" | "no-op" | "rejected" | "invalid";
  readonly outcomeCode: string;
  readonly aggregateBefore: Aggregate<JsonObject, Kind>;
  readonly aggregateAfter: Aggregate<JsonObject, Kind>;
  readonly domainEvents: readonly JsonObject[];
  readonly capabilityEvidence: NonNullable<SyncCommandResult["capabilityEvidence"]>;
}

export interface TrustedMechanicAdapter<Kind extends "team" | "session"> {
  readonly id: string;
  readonly model: ExecutableAggregateModel<Kind>;
  readonly configurationSchema: RuntimeSchema<JsonObject>;
  readonly projectionSchema: RuntimeSchema<JsonObject>;
  validateBinding(input: {
    readonly binding: TrustedMechanicBinding;
    readonly composition: GameComposition;
    readonly configuration: unknown;
  }): MechanicBindingValidation;
  execute(input: {
    readonly participant: AuthorizedParticipant;
    readonly aggregate: Aggregate<JsonObject, Kind>;
    readonly command: SyncCommand;
    readonly observations: readonly PersistedObservation[];
  }): MechanicExecution<Kind>;
  project(input: {
    readonly participant: AuthorizedParticipant;
    readonly aggregate: Aggregate<JsonObject, Kind>;
  }): MechanicProjection;
}

export type TrustedMechanicResolution =
  | {
      readonly kind: "resolved";
      readonly aggregateKind: "team";
      readonly adapter: TrustedMechanicAdapter<"team">;
    }
  | {
      readonly kind: "resolved";
      readonly aggregateKind: "session";
      readonly adapter: TrustedMechanicAdapter<"session">;
    }
  | { readonly kind: "invalid"; readonly diagnostic: MechanicDiagnostic };

interface ErasedTrustedMechanicFactory {
  readonly id: string;
  resolve(input: {
    readonly aggregateKind: "team" | "session";
    readonly configuration: unknown;
  }): TrustedMechanicResolution;
}

function diagnostic(code: MechanicDiagnosticCode, logicalIds: readonly string[]) {
  return Object.freeze({
    kind: "invalid" as const,
    diagnostic: Object.freeze({ code, logicalIds: Object.freeze([...logicalIds]) }),
  });
}

function eraseTeamFactory(input: {
  readonly id: string;
  create(configuration: unknown): TrustedMechanicAdapter<"team">;
}): ErasedTrustedMechanicFactory {
  return Object.freeze({
    id: input.id,
    resolve({
      aggregateKind,
      configuration,
    }: {
      readonly aggregateKind: "team" | "session";
      readonly configuration: unknown;
    }): TrustedMechanicResolution {
      if (aggregateKind !== "team") {
        return diagnostic("model-contract-mismatch", [input.id]);
      }
      return Object.freeze({
        kind: "resolved",
        aggregateKind: "team",
        adapter: input.create(configuration),
      });
    },
  });
}

const targetDiscoveryFactory = eraseTeamFactory({
  id: "plotpoint.location.target-discovery",
  create: createTargetDiscoveryAdapter,
});

const registry: ReadonlyMap<string, ErasedTrustedMechanicFactory> = new Map([
  [targetDiscoveryFactory.id, targetDiscoveryFactory],
]);

export function hasTrustedMechanic(id: string): boolean {
  return registry.has(id);
}

export function resolveTrustedMechanic(input: {
  readonly binding: TrustedMechanicBinding;
  readonly composition: GameComposition;
  readonly configuration: unknown;
}): TrustedMechanicResolution {
  const factory = registry.get(input.binding.id);
  if (factory === undefined) return diagnostic("invalid-binding", [input.binding.id]);
  const selectedModel = input.composition.aggregateModels.find(
    ({ id }) => id === input.binding.aggregateModel,
  );
  if (
    selectedModel === undefined ||
    selectedModel.authority !== "server" ||
    selectedModel.effects.length !== 0
  ) {
    return diagnostic("model-contract-mismatch", [input.binding.aggregateModel]);
  }
  const resolved = factory.resolve({
    aggregateKind: selectedModel.kind,
    configuration: input.configuration,
  });
  if (resolved.kind === "invalid") {
    return selectedModel.kind === "team" || selectedModel.kind === "session"
      ? diagnostic("model-contract-mismatch", [input.binding.aggregateModel])
      : resolved;
  }
  const validation = resolved.adapter.validateBinding(input);
  return validation.kind === "invalid" ? validation : resolved;
}
