import type { z } from 'zod';
import { getBlockDefinition, hasBlockType } from '../blocks/index.js';
import {
  BlockUpdateError,
  type BlockAction,
  type BlockConfig,
  type BlockRegistryEntry,
  type BlockState,
} from '../blocks/types.js';
import { EngineRuntimeError } from './errors.js';
import { resolveRuntimeStateScopeKey, type RuntimeStateScopeKey } from './block-state-bucket.js';
import {
  createRuntimeSnapshot,
  formatIssuePath,
  mapAvailableEdges,
  parseRuntimeInputOrThrow,
  resolveRuntimeSnapshotContextOrThrow,
} from './snapshot.js';
import { submitActionInputSchema } from './schema.js';
import type { EnginePorts, RuntimeSnapshot, RuntimeState, SubmitActionInput } from './types.js';

type SubmitExecutionResult = {
  scopeKey: RuntimeStateScopeKey;
  updatedBlockState: unknown;
};

type SubmitDefinitionParams<
  TConfig extends BlockConfig,
  TState extends BlockState,
  TAction extends BlockAction,
> = {
  action: unknown;
  actionType?: string | undefined;
  blockId: string;
  definition: BlockRegistryEntry<TConfig, TState, TAction>;
  nodeId: string;
  ports: EnginePorts;
  readLocation: boolean;
  state: RuntimeState;
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

const executeSubmitForDefinition = async <
  TConfig extends BlockConfig,
  TState extends BlockState,
  TAction extends BlockAction,
>(
  params: SubmitDefinitionParams<TConfig, TState, TAction>,
): Promise<SubmitExecutionResult> => {
  const {
    action,
    actionType,
    blockId,
    definition,
    nodeId,
    ports,
    readLocation,
    state,
    targetBlockConfig,
    targetBlockType,
  } = params;

  const parsedConfig = definition.configSchema.safeParse(targetBlockConfig);
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

  const scopeKey = resolveRuntimeStateScopeKey(definition.scope);
  const scopedBucket = state[scopeKey].blockStates;
  const existingState = scopedBucket[blockId];
  const parsedStateResult =
    existingState === undefined
      ? definition.stateSchema.safeParse(definition.initialState(parsedConfig.data))
      : definition.stateSchema.safeParse(existingState);
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

  if (!definition.interactive) {
    throw new EngineRuntimeError(
      'runtime_block_not_actionable',
      `Runtime block "${blockId}" is non-interactive and cannot accept submissions.`,
      {
        details: {
          actionType,
          blockId,
          blockType: targetBlockType,
          nodeId,
          reason: 'non_interactive',
        },
      },
    );
  }

  if (toBlockStateRecord(parsedState).unlocked === true) {
    throw new EngineRuntimeError(
      'runtime_block_already_unlocked',
      `Runtime block "${blockId}" is already unlocked and cannot accept further submissions.`,
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
    definition.isActionable !== undefined &&
    !definition.isActionable(parsedState, parsedConfig.data)
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

  const parsedAction = definition.actionSchema.safeParse(action);
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

  let playerLocation: { lat: number; lng: number } | null | undefined;
  if (readLocation) {
    if (ports.locationReader === undefined) {
      playerLocation = null;
    } else {
      try {
        playerLocation = await ports.locationReader.getCurrent(state.playerId);
      } catch (error) {
        throw new EngineRuntimeError(
          'runtime_block_location_read_failed',
          `Runtime location lookup failed for block "${blockId}".`,
          {
            cause: error,
            details: {
              actionType,
              blockId,
              blockType: targetBlockType,
              nodeId,
              playerId: state.playerId,
            },
          },
        );
      }
    }
  }

  const nowIso = ports.clock?.now().toISOString();
  let updatedState: unknown;
  try {
    updatedState = definition.update(
      parsedState,
      parsedAction.data,
      {
        nowIso,
        playerLocation,
      },
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
        `Runtime block "${blockId}" rejected the submit action for type "${targetBlockType}".`,
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

  const parsedUpdatedState = definition.stateSchema.safeParse(updatedState);
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
    scopeKey,
    updatedBlockState: parsedUpdatedState.data,
  };
};

export const submitAction = async (
  ports: EnginePorts,
  input: SubmitActionInput,
): Promise<RuntimeSnapshot> => {
  const { action, state, blockId } = parseRuntimeInputOrThrow(submitActionInputSchema, input);
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
  let submitResult: SubmitExecutionResult;
  switch (targetBlock.type) {
    case 'code':
      submitResult = await executeSubmitForDefinition({
        action,
        actionType,
        blockId,
        definition: getBlockDefinition('code'),
        nodeId: currentNode.id,
        ports,
        readLocation: false,
        state,
        targetBlockConfig: targetBlock.config,
        targetBlockType: 'code',
      });
      break;
    case 'single-choice':
      submitResult = await executeSubmitForDefinition({
        action,
        actionType,
        blockId,
        definition: getBlockDefinition('single-choice'),
        nodeId: currentNode.id,
        ports,
        readLocation: false,
        state,
        targetBlockConfig: targetBlock.config,
        targetBlockType: 'single-choice',
      });
      break;
    case 'multi-choice':
      submitResult = await executeSubmitForDefinition({
        action,
        actionType,
        blockId,
        definition: getBlockDefinition('multi-choice'),
        nodeId: currentNode.id,
        ports,
        readLocation: false,
        state,
        targetBlockConfig: targetBlock.config,
        targetBlockType: 'multi-choice',
      });
      break;
    case 'location':
      submitResult = await executeSubmitForDefinition({
        action,
        actionType,
        blockId,
        definition: getBlockDefinition('location'),
        nodeId: currentNode.id,
        ports,
        readLocation: true,
        state,
        targetBlockConfig: targetBlock.config,
        targetBlockType: 'location',
      });
      break;
    case 'text':
      submitResult = await executeSubmitForDefinition({
        action,
        actionType,
        blockId,
        definition: getBlockDefinition('text'),
        nodeId: currentNode.id,
        ports,
        readLocation: false,
        state,
        targetBlockConfig: targetBlock.config,
        targetBlockType: 'text',
      });
      break;
  }

  const scopedBucket = state[submitResult.scopeKey].blockStates;
  const nextScopedBucket = {
    ...scopedBucket,
    [blockId]: submitResult.updatedBlockState,
  };
  const nextState =
    submitResult.scopeKey === 'playerState'
      ? {
          ...state,
          playerState: {
            ...state.playerState,
            blockStates: nextScopedBucket,
          },
        }
      : {
          ...state,
          sharedState: {
            ...state.sharedState,
            blockStates: nextScopedBucket,
          },
        };

  return createRuntimeSnapshot(nextState, mapAvailableEdges(currentNode), {
    normalizeState: false,
  });
};
