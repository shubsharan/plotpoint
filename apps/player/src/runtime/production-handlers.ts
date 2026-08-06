import {
  FOREGROUND_LOCATION_CAPABILITY,
  type CanonicalJsonObject,
  type GameComposition,
  type ProgressionInstance,
  type RuntimeBootstrap,
  type TransitionCandidate,
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
  validateSchema(schemaId: string, value: CanonicalJsonObject): boolean;
  validateProgression(progressionId: string, value: ProgressionInstance): boolean;
}

function validateCandidateContracts(
  runtime: ProductionRuntimeContext,
  candidate: TransitionCandidate,
): string | null {
  const localModel = runtime.composition.aggregateModels.find(
    (model) => model.authority === "local" && model.id === runtime.bootstrap.aggregate.modelId,
  );
  if (
    candidate.modelId !== runtime.bootstrap.aggregate.modelId ||
    candidate.target.aggregateId !== runtime.bootstrap.aggregate.aggregateId ||
    candidate.target.aggregateKind !== runtime.bootstrap.aggregate.aggregateKind ||
    candidate.target.schemaId !== runtime.aggregateSchemaId ||
    candidate.target.schemaId !== runtime.bootstrap.aggregate.schemaId ||
    localModel?.authority !== "local" ||
    localModel.stateSchema.id !== candidate.target.schemaId
  ) {
    return "transition-aggregate-mismatch";
  }

  const command = runtime.composition.commands.find(
    (descriptor) =>
      descriptor.execution === "local" &&
      descriptor.aggregateModel === localModel.id &&
      descriptor.type === candidate.commandType,
  );
  if (command === undefined) return "transition-command-mismatch";
  if (!runtime.validateSchema(command.payloadSchema.id, candidate.payload)) {
    return "transition-payload-schema-invalid";
  }
  if (candidate.terminal === "invalid") return null;
  if (!runtime.validateSchema(command.outcomeSchema.id, candidate.outcome)) {
    return "transition-outcome-schema-invalid";
  }
  if (candidate.terminal !== "accepted") return null;
  if (
    candidate.nextState !== undefined &&
    !runtime.validateSchema(localModel.stateSchema.id, candidate.nextState)
  ) {
    return "transition-state-schema-invalid";
  }
  for (const event of candidate.domainEvents) {
    const descriptor = localModel.events.find(({ type }) => type === event.type);
    if (descriptor === undefined || !runtime.validateSchema(descriptor.schema.id, event)) {
      return "transition-event-schema-invalid";
    }
  }
  for (const effect of candidate.effectIntents) {
    const descriptor = localModel.effects.find(({ type }) => type === effect.type);
    if (descriptor === undefined || !runtime.validateSchema(descriptor.schema.id, effect)) {
      return "transition-effect-schema-invalid";
    }
  }

  const progression = runtime.composition.progressions.find(
    ({ aggregateModel }) => aggregateModel === localModel.id,
  );
  if (candidate.nextProgression !== undefined) {
    if (
      progression === undefined ||
      candidate.nextProgression.graphId !== progression.id ||
      !runtime.validateProgression(progression.id, candidate.nextProgression) ||
      candidate.progressionTrace.length === 0
    ) {
      return "transition-progression-invalid";
    }
  } else if (candidate.progressionTrace.length > 0) {
    return "transition-progression-invalid";
  }
  if (
    candidate.nextState === undefined &&
    candidate.nextProgression === undefined &&
    candidate.domainEvents.length === 0 &&
    candidate.effectIntents.length === 0
  ) {
    return "transition-accepted-fact-missing";
  }
  return null;
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
      const contractError = validateCandidateContracts(input.runtime, candidate);
      if (contractError !== null) throw new Error(contractError);
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
