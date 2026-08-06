import type { RuntimeBootstrap, TransitionResult } from "@plotpoint/protocol";

import { createCapabilityDispatcher, type HostBridgeHandlers } from "../bridge/host-bridge";
import {
  foregroundLocationCapabilityRegistration,
  type CaptureForegroundLocationInput,
} from "../location/foreground-location";
import { commitCandidateTransition, type TransitionStore } from "../persistence/commit-transition";
import { transitionResultFromDurable } from "./transition-result";

export interface ProductionRuntimeContext {
  readonly bootstrap: RuntimeBootstrap;
  readonly aggregateSchemaId: string;
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
    commitTransition: async ({ candidate }): Promise<TransitionResult> => {
      if (
        candidate.modelId !== input.runtime.bootstrap.aggregate.modelId ||
        candidate.target.aggregateId !== input.runtime.bootstrap.aggregate.aggregateId ||
        candidate.target.aggregateKind !== input.runtime.bootstrap.aggregate.aggregateKind ||
        candidate.target.schemaId !== input.runtime.aggregateSchemaId ||
        candidate.target.schemaId !== input.runtime.bootstrap.aggregate.schemaId
      ) {
        throw new Error("transition-aggregate-mismatch");
      }
      if (
        candidate.terminal === "accepted" &&
        candidate.nextState !== undefined &&
        !input.runtime.validateAggregate(candidate.nextState)
      ) {
        throw new Error("transition-state-schema-invalid");
      }
      const result = await commitCandidateTransition({
        store: input.store,
        runId: input.runtime.bootstrap.runId,
        candidate,
      });
      if ("kind" in result) throw new Error(result.code);
      await input.onDurableResult?.();
      return transitionResultFromDurable(result);
    },
    requestCapability: dispatchCapability,
  };
}
