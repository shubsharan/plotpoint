import type {
  RuntimeBootstrapV1,
  TransitionCandidateV1,
  TransitionResultV1,
} from "@plotpoint/protocol";

import { createCapabilityDispatcher, type HostBridgeHandlers } from "../bridge/host-bridge";
import {
  foregroundLocationCapabilityRegistration,
  type CaptureForegroundLocationInput,
} from "../location/foreground-location";
import type { CandidateTransition } from "../model";
import { commitCandidateTransition, type TransitionStore } from "../persistence/commit-transition";
import { transitionResultFromDurable } from "./transition-result";

function durableCandidate(candidate: TransitionCandidateV1): CandidateTransition {
  const base = {
    commandId: candidate.commandId,
    aggregateId: candidate.target.aggregateId,
    aggregateKind: candidate.target.aggregateKind,
    schemaId: candidate.target.schemaId,
    schemaVersion: candidate.target.schemaVersion,
    expectedVersion: candidate.expectedVersion,
    observationIds: candidate.observationIds,
  };
  if (candidate.terminal === "accepted") {
    return {
      ...base,
      commandOutcome: "accepted",
      nextState: candidate.nextState,
      outcome: candidate.outcome,
      progressionChanges: candidate.progressionChanges,
    };
  }
  if (candidate.terminal === "invalid") {
    return { ...base, commandOutcome: "invalid", diagnosticCodes: candidate.diagnosticCodes };
  }
  return { ...base, commandOutcome: candidate.terminal, outcome: candidate.outcome };
}

export interface ProductionRuntimeContext {
  readonly bootstrap: RuntimeBootstrapV1;
  readonly aggregateSchemaId: string;
  readonly aggregateSchemaVersion: number;
  validateAggregate(value: object): boolean;
}

export function createProductionHostBridgeHandlers(input: {
  readonly store: TransitionStore;
  readonly runtime: ProductionRuntimeContext;
  readonly location: CaptureForegroundLocationInput;
  readonly onDurableResult?: () => Promise<void>;
}): HostBridgeHandlers {
  const dispatchCapability = createCapabilityDispatcher([
    foregroundLocationCapabilityRegistration(input.location),
  ]);
  return {
    runtimeReady: async () => input.runtime.bootstrap,
    commitTransition: async ({ candidate }): Promise<TransitionResultV1> => {
      if (
        candidate.target.schemaId !== input.runtime.aggregateSchemaId ||
        candidate.target.schemaVersion !== input.runtime.aggregateSchemaVersion
      ) {
        throw new Error("transition-aggregate-mismatch");
      }
      if (
        candidate.terminal === "accepted" &&
        !input.runtime.validateAggregate(candidate.nextState)
      ) {
        throw new Error("transition-state-schema-invalid");
      }
      const result = await commitCandidateTransition({
        store: input.store,
        runId: input.runtime.bootstrap.runId,
        candidate: durableCandidate(candidate),
      });
      if (result.kind === "stale") throw new Error(result.code ?? "transition-stale");
      if (result.kind === "invalid") throw new Error(result.code ?? "transition-invalid");
      await input.onDurableResult?.();
      return transitionResultFromDurable(result);
    },
    requestCapability: dispatchCapability,
  };
}
