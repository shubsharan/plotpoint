import type { z } from 'zod';
import { getBlockDefinition, hasBlockType } from '../blocks/index.js';
import {
  BlockUpdateError,
  type BlockContextKey,
  type BlockActionContext,
  type InteractiveBlockBehavior,
} from '../blocks/types.js';
import {
  readOwnBlockState,
  type RuntimeStateType,
  writeBlockStateByType,
} from './block-state-bucket.js';
import { EngineRuntimeError } from './errors.js';
import {
  createRuntimeSnapshot,
  formatIssuePath,
  mapTraversableEdges,
  parseRuntimeInputOrThrow,
  resolveRuntimeSnapshotContextOrThrow,
} from './snapshot.js';
import { performBlockActionInputSchema } from './schema.js';
import type { EnginePorts, RuntimeSnapshot, RuntimeState, PerformBlockActionInput } from './types.js';

type ActionExecutionResult = {
  stateType: RuntimeStateType;
  updatedBlockState: unknown;
};

type ActionBehaviorParams = {
  action: unknown;
  actionType?: string | undefined;
  behavior: InteractiveBlockBehavior<any, any, any>;
  blockId: string;
  nodeId: string;
  ports: EnginePorts;
  requiredContext: BlockContextKey[];
  state: RuntimeState;
  stateType: RuntimeStateType;
  targetBlockConfig: unknown;
  targetBlockType: string;
};

const resolveActionType = (action: unknown): string | undefined => {
  if (typeof action !== 'object' || action === null) {
    return undefined;
  }

  if (!Object.hasOwn(action, 'type')) {
    return undefined;
  }

  const actionType = (action as { type: unknown }).type;
  return typeof actionType === 'string' ? actionType : undefined;
};

const toValidationDetails = (issue: z.core.$ZodIssue): Record<string, unknown> => ({
  validationCode: issue.code,
  validationPath: formatIssuePath(issue.path),
});

const toBlockStateRecord = (value: unknown): Record<string, unknown> =>
  (value ?? {}) as Record<string, unknown>;

const resolveExecutionContextOrThrow = async (
  params: {
    actionType?: string | undefined;
    blockId: string;
    blockType: string;
    nodeId: string;
    playerId: string;
    ports: EnginePorts;
    requiredContext: BlockContextKey[];
  },
): Promise<BlockActionContext> => {
  const context: BlockActionContext = {};
  const requiredContext = new Set(params.requiredContext);

  if (requiredContext.has('nowIso')) {
    if (params.ports.clock === undefined) {
      context.nowIso = undefined;
    } else {
      try {
        context.nowIso = params.ports.clock.now().toISOString();
      } catch (error) {
        throw new EngineRuntimeError(
          'runtime_block_execution_failed',
          `Runtime clock resolution failed for block "${params.blockId}".`,
          {
            cause: error,
            details: {
              actionType: params.actionType,
              blockId: params.blockId,
              blockType: params.blockType,
              nodeId: params.nodeId,
              playerId: params.playerId,
            },
          },
        );
      }
    }
  }

  if (requiredContext.has('playerLocation')) {
    if (params.ports.locationReader === undefined) {
      context.playerLocation = null;
    } else {
      try {
        context.playerLocation = await params.ports.locationReader.getCurrent(params.playerId);
      } catch (error) {
        throw new EngineRuntimeError(
          'runtime_block_location_read_failed',
          `Runtime location lookup failed for block "${params.blockId}".`,
          {
            cause: error,
            details: {
              actionType: params.actionType,
              blockId: params.blockId,
              blockType: params.blockType,
              nodeId: params.nodeId,
              playerId: params.playerId,
            },
          },
        );
      }
    }
  }

  return context;
};

const executeActionForBehavior = async (
  params: ActionBehaviorParams,
): Promise<ActionExecutionResult> => {
  const {
    action,
    actionType,
    behavior,
    blockId,
    nodeId,
    ports,
    requiredContext,
    state,
    stateType,
    targetBlockConfig,
    targetBlockType,
  } = params;

  const parsedConfig = behavior.configSchema.safeParse(targetBlockConfig);
  if (!parsedConfig.success) {
    const firstIssue = parsedConfig.error.issues[0];
    throw new EngineRuntimeError(
      'runtime_block_config_invalid',
      `Runtime block "${blockId}" has invalid config for type "${targetBlockType}".`,
      {
        details: {
          actionType,
          blockId,
          blockType: targetBlockType,
          nodeId,
          ...(firstIssue === undefined ? {} : toValidationDetails(firstIssue)),
        },
      },
    );
  }

  const scopedBucket = state[stateType].blockStates;
  const existingState = readOwnBlockState(scopedBucket, blockId);
  const parsedStateResult = existingState.found
    ? behavior.stateSchema.safeParse(existingState.value)
    : behavior.stateSchema.safeParse(behavior.initialState(parsedConfig.data));
  if (!parsedStateResult.success) {
    const firstIssue = parsedStateResult.error.issues[0];
    throw new EngineRuntimeError(
      'runtime_block_state_invalid',
      `Runtime block "${blockId}" has invalid persisted state for type "${targetBlockType}".`,
      {
        details: {
          actionType,
          blockId,
          blockType: targetBlockType,
          nodeId,
          ...(firstIssue === undefined ? {} : toValidationDetails(firstIssue)),
        },
      },
    );
  }
  const parsedState = parsedStateResult.data;

  if (toBlockStateRecord(parsedState).unlocked === true) {
    throw new EngineRuntimeError(
      'runtime_block_already_unlocked',
      `Runtime block "${blockId}" is already unlocked and cannot accept further actions.`,
      {
        details: {
          actionType,
          blockId,
          blockType: targetBlockType,
          nodeId,
        },
      },
    );
  }

  if (
    behavior.isActionable !== undefined &&
    !behavior.isActionable(parsedState, parsedConfig.data)
  ) {
    throw new EngineRuntimeError(
      'runtime_block_not_actionable',
      `Runtime block "${blockId}" is no longer actionable in its current state.`,
      {
        details: {
          actionType,
          blockId,
          blockType: targetBlockType,
          nodeId,
          reason: 'state_not_actionable',
        },
      },
    );
  }

  const parsedAction = behavior.actionSchema.safeParse(action);
  if (!parsedAction.success) {
    const firstIssue = parsedAction.error.issues[0];
    throw new EngineRuntimeError(
      'runtime_block_action_invalid',
      `Runtime block "${blockId}" received an invalid submit action for type "${targetBlockType}".`,
      {
        details: {
          actionType,
          blockId,
          blockType: targetBlockType,
          nodeId,
          ...(firstIssue === undefined ? {} : toValidationDetails(firstIssue)),
        },
      },
    );
  }

  const actionContext = await resolveExecutionContextOrThrow({
    actionType,
    blockId,
    blockType: targetBlockType,
    nodeId,
    playerId: state.playerId,
    ports,
    requiredContext,
  });

  let updatedState: unknown;
  try {
    updatedState = behavior.onAction(
      parsedState,
      parsedAction.data,
      actionContext,
      parsedConfig.data,
    );
  } catch (error) {
    if (error instanceof BlockUpdateError && error.code === 'unsupported_location_target') {
      throw new EngineRuntimeError(
        'runtime_block_unsupported_location_target',
        `Runtime block "${blockId}" uses an unsupported location target.`,
        {
          cause: error,
          details: {
            actionType,
            blockId,
            blockType: targetBlockType,
            nodeId,
            ...error.details,
          },
        },
      );
    }

    if (error instanceof BlockUpdateError && error.code === 'action_invalid_for_config') {
      throw new EngineRuntimeError(
        'runtime_block_action_invalid',
        `Runtime block "${blockId}" rejected the action for type "${targetBlockType}".`,
        {
          cause: error,
          details: {
            actionType,
            blockId,
            blockType: targetBlockType,
            nodeId,
            ...error.details,
          },
        },
      );
    }

    throw new EngineRuntimeError(
      'runtime_block_execution_failed',
      `Runtime block "${blockId}" reducer execution failed for type "${targetBlockType}".`,
      {
        cause: error,
        details: {
          actionType,
          blockId,
          blockType: targetBlockType,
          nodeId,
        },
      },
    );
  }

  const parsedUpdatedState = behavior.stateSchema.safeParse(updatedState);
  if (!parsedUpdatedState.success) {
    const firstIssue = parsedUpdatedState.error.issues[0];
    throw new EngineRuntimeError(
      'runtime_block_state_invalid',
      `Runtime block "${blockId}" reducer returned invalid state for type "${targetBlockType}".`,
      {
        details: {
          actionType,
          blockId,
          blockType: targetBlockType,
          nodeId,
          ...(firstIssue === undefined ? {} : toValidationDetails(firstIssue)),
        },
      },
    );
  }

  return {
    stateType,
    updatedBlockState: parsedUpdatedState.data,
  };
};

export const performBlockAction = async (
  ports: EnginePorts,
  input: PerformBlockActionInput,
): Promise<RuntimeSnapshot> => {
  const { action, state, blockId } = parseRuntimeInputOrThrow(performBlockActionInputSchema, input);
  const { currentNode, targetBlock } = await resolveRuntimeSnapshotContextOrThrow(ports, state, {
    blockId,
  });
  if (!targetBlock) {
    throw new EngineRuntimeError(
      'runtime_block_not_found',
      `Runtime block "${blockId}" was not found in node "${currentNode.id}" for story "${state.storyId}".`,
      {
        details: {
          blockId,
          nodeId: currentNode.id,
          storyId: state.storyId,
        },
      },
    );
  }

  if (!hasBlockType(targetBlock.type)) {
    throw new EngineRuntimeError(
      'runtime_block_type_unregistered',
      `Runtime block type "${targetBlock.type}" is not registered in the block registry.`,
      {
        details: {
          blockId,
          blockType: targetBlock.type,
          nodeId: currentNode.id,
        },
      },
    );
  }

  const actionType = resolveActionType(action);
  const definition = getBlockDefinition(targetBlock.type);
  const { behavior, policy } = definition;
  if (!behavior.interactive) {
    throw new EngineRuntimeError(
      'runtime_block_not_actionable',
      `Runtime block "${blockId}" is non-interactive and cannot accept actions.`,
      {
        details: {
          actionType,
          blockId,
          blockType: targetBlock.type,
          nodeId: currentNode.id,
          reason: 'non_interactive',
        },
      },
    );
  }

  const actionResult = await executeActionForBehavior({
    action,
    actionType,
    behavior,
    blockId,
    nodeId: currentNode.id,
    ports,
    requiredContext: policy.requiredContext,
    state,
    stateType: policy.stateType,
    targetBlockConfig: targetBlock.config,
    targetBlockType: targetBlock.type,
  });

  const nextState = writeBlockStateByType(
    state,
    actionResult.stateType,
    blockId,
    actionResult.updatedBlockState,
  );

  return createRuntimeSnapshot(nextState, mapTraversableEdges(currentNode), {
    normalizeState: false,
  });
};
