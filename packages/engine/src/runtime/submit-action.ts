import type { z } from 'zod';
import { getBlockDefinition, hasBlockType } from '../blocks/index.js';
import type { BlockRegistryEntry } from '../blocks/types.js';
import { BlockUpdateError } from '../blocks/types.js';
import { EngineRuntimeError } from './errors.js';
import {
  createRuntimeSnapshot,
  formatIssuePath,
  mapAvailableEdges,
  parseRuntimeInputOrThrow,
  resolveRuntimeSnapshotContextOrThrow,
} from './snapshot.js';
import { submitActionInputSchema } from './schema.js';
import type { EnginePorts, RuntimeSnapshot, SubmitActionInput } from './types.js';

type RuntimeStateScopeKey = 'playerState' | 'sharedState';

const resolveStateScopeKey = (scope: 'game' | 'user'): RuntimeStateScopeKey =>
  scope === 'game' ? 'sharedState' : 'playerState';

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

  const definition = getBlockDefinition(targetBlock.type) as unknown as BlockRegistryEntry;
  const actionType = resolveActionType(action);

  const parsedConfig = definition.configSchema.safeParse(targetBlock.config);
  if (!parsedConfig.success) {
    const firstIssue = parsedConfig.error.issues[0];
    throw new EngineRuntimeError(
      'runtime_block_config_invalid',
      `Runtime block "${blockId}" has invalid config for type "${targetBlock.type}".`,
      {
        details: {
          actionType,
          blockId,
          blockType: targetBlock.type,
          nodeId: currentNode.id,
          ...(firstIssue === undefined ? {} : toValidationDetails(firstIssue)),
        },
      },
    );
  }

  const scopeKey = resolveStateScopeKey(definition.scope);
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
      `Runtime block "${blockId}" has invalid persisted state for type "${targetBlock.type}".`,
      {
        details: {
          actionType,
          blockId,
          blockType: targetBlock.type,
          nodeId: currentNode.id,
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
          blockType: targetBlock.type,
          nodeId: currentNode.id,
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
          blockType: targetBlock.type,
          nodeId: currentNode.id,
        },
      },
    );
  }

  if (definition.isActionable !== undefined && !definition.isActionable(parsedState)) {
    throw new EngineRuntimeError(
      'runtime_block_not_actionable',
      `Runtime block "${blockId}" is no longer actionable in its current state.`,
      {
        details: {
          actionType,
          blockId,
          blockType: targetBlock.type,
          nodeId: currentNode.id,
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
      `Runtime block "${blockId}" received an invalid submit action for type "${targetBlock.type}".`,
      {
        details: {
          actionType,
          blockId,
          blockType: targetBlock.type,
          nodeId: currentNode.id,
          ...(firstIssue === undefined ? {} : toValidationDetails(firstIssue)),
        },
      },
    );
  }

  let playerLocation: { lat: number; lng: number } | null | undefined;
  if (targetBlock.type === 'location') {
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
              blockType: targetBlock.type,
              nodeId: currentNode.id,
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
    updatedState = definition.update(parsedState, parsedAction.data, {
      nowIso,
      playerLocation,
    });
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
            blockType: targetBlock.type,
            nodeId: currentNode.id,
            ...error.details,
          },
        },
      );
    }

    if (error instanceof BlockUpdateError && error.code === 'action_invalid_for_config') {
      throw new EngineRuntimeError(
        'runtime_block_action_invalid',
        `Runtime block "${blockId}" rejected the submit action for type "${targetBlock.type}".`,
        {
          cause: error,
          details: {
            actionType,
            blockId,
            blockType: targetBlock.type,
            nodeId: currentNode.id,
            ...error.details,
          },
        },
      );
    }

    throw new EngineRuntimeError(
      'runtime_block_execution_failed',
      `Runtime block "${blockId}" reducer execution failed for type "${targetBlock.type}".`,
      {
        cause: error,
        details: {
          actionType,
          blockId,
          blockType: targetBlock.type,
          nodeId: currentNode.id,
        },
      },
    );
  }

  const parsedUpdatedState = definition.stateSchema.safeParse(updatedState);
  if (!parsedUpdatedState.success) {
    const firstIssue = parsedUpdatedState.error.issues[0];
    throw new EngineRuntimeError(
      'runtime_block_state_invalid',
      `Runtime block "${blockId}" reducer returned invalid state for type "${targetBlock.type}".`,
      {
        details: {
          actionType,
          blockId,
          blockType: targetBlock.type,
          nodeId: currentNode.id,
          ...(firstIssue === undefined ? {} : toValidationDetails(firstIssue)),
        },
      },
    );
  }

  const nextScopedBucket = {
    ...scopedBucket,
    [blockId]: parsedUpdatedState.data,
  };
  const nextState =
    scopeKey === 'playerState'
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
