import {
  FOREGROUND_LOCATION_CAPABILITY,
  type GameComposition,
  type RuntimeBootstrap,
  type TransitionResult,
} from "@plotpoint/protocol";

import { createCapabilityDispatcher, type HostBridgeHandlers } from "../bridge/host-bridge";
import {
  foregroundLocationCapabilityRegistration,
  type CaptureForegroundLocationInput,
} from "../location/foreground-location";
import { commitCandidateTransition, type TransitionStore } from "../persistence/commit-transition";
import { transitionResultFromDurable } from "./transition-result";

export interface ProductionRuntimeContext {
  readonly bootstrap: RuntimeBootstrap;
  readonly composition: GameComposition;
  readonly aggregateSchemaId: string;
  validateAggregate(value: object): boolean;
}

export function createProductionHostBridgeHandlers(input: {
  readonly store: TransitionStore;
  readonly runtime: ProductionRuntimeContext;
  readonly location: CaptureForegroundLocationInput;
  readonly onDurableResult?: () => Promise<void>;
}): HostBridgeHandlers {
  const locationDeclared = input.runtime.composition.components.some((component) =>
    component.capabilities.some(
      (capability) =>
        capability.id === FOREGROUND_LOCATION_CAPABILITY.id &&
        capability.major === FOREGROUND_LOCATION_CAPABILITY.major &&
        capability.minimumMinor <= FOREGROUND_LOCATION_CAPABILITY.minor,
    ),
  );
  const dispatchCapability = createCapabilityDispatcher(
    locationDeclared ? [foregroundLocationCapabilityRegistration(input.location)] : [],
  );
  return {
    runtimeReady: async () => input.runtime.bootstrap,
    commitTransition: async ({ candidate }): Promise<TransitionResult> => {
      const localModel = input.runtime.composition.aggregateModels.find(
        (model) =>
          model.authority === "local" && model.id === input.runtime.bootstrap.aggregate.modelId,
      );
      if (
        candidate.modelId !== input.runtime.bootstrap.aggregate.modelId ||
        candidate.target.aggregateId !== input.runtime.bootstrap.aggregate.aggregateId ||
        candidate.target.aggregateKind !== input.runtime.bootstrap.aggregate.aggregateKind ||
        candidate.target.schemaId !== input.runtime.aggregateSchemaId ||
        candidate.target.schemaId !== input.runtime.bootstrap.aggregate.schemaId ||
        localModel?.authority !== "local" ||
        localModel.stateSchema.id !== candidate.target.schemaId
      ) {
        throw new Error("transition-aggregate-mismatch");
      }
      if (
        !input.runtime.composition.commands.some(
          (command) =>
            command.execution === "local" &&
            command.aggregateModel === localModel?.id &&
            command.type === candidate.commandType,
        )
      ) {
        throw new Error("transition-command-mismatch");
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
