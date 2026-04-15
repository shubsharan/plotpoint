import type { z } from 'zod';
import { getBlockDefinition, hasBlockType } from '../../blocks/registry.js';
import {
  type BlockAction,
  type BlockConfig,
  type BlockState,
  BlockUpdateError,
  type BlockActionContext,
  type BlockContextKey,
  type InteractiveBlockBehavior,
} from '../../blocks/contracts.js';
import {
  type SessionStateType,
  writeBlockStateByType,
} from '../state/block-state-bucket.js';
import { EngineRuntimeError } from '../errors.js';
import {
  formatIssuePath,
  parseRuntimeInputOrThrow,
  resolveSessionContextOrThrow,
} from '../context/story-context.js';
import { resolveEffectiveBlockStateOrThrow } from '../context/block-resolution.js';
import { submitActionInputSchema } from '../contracts/command-inputs.js';
import { createRuntimeFrame } from '../projection/frame-builder.js';
import { createCurrentNodeViewOrThrow, createRuntimeView } from '../projection/view-projection.js';
import { deriveTraversableEdgesOrThrow } from '../traversal/condition-evaluator.js';
import type { EnginePorts, RuntimeFrame, SubmitActionInput } from '../types.js';

type ActionExecutionResult = {
  stateType: SessionStateType;
  updatedBlockState: unknown;
};

type RuntimeInteractiveBehavior = InteractiveBlockBehavior<BlockConfig, BlockState, BlockAction>;

type ActionBehaviorParams = {
  action: unknown;
  actionType?: string | undefined;
  behavior: RuntimeInteractiveBehavior;
  blockId: string;
  nodeId: string;
  parsedConfig: BlockConfig;
  parsedState: BlockState;
  playerId: string;
  ports: EnginePorts;
  requiredContext: ReadonlyArray<BlockContextKey>;
  stateType: SessionStateType;
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

const resolveExecutionContextOrThrow = async (
  params: {
    actionType?: string | undefined;
    blockId: string;
    blockType: string;
    nodeId: string;
    playerId: string;
    ports: EnginePorts;
    requiredContext: ReadonlyArray<BlockContextKey>;
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
    parsedConfig,
    parsedState,
    playerId,
    ports,
    requiredContext,
    stateType,
    targetBlockType,
  } = params;

  if (parsedState.unlocked) {
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
    !behavior.isActionable(parsedState, parsedConfig)
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
    playerId,
    ports,
    requiredContext,
  });

  let updatedState: unknown;
  try {
    updatedState = behavior.onAction(
      parsedState,
      parsedAction.data,
      actionContext,
      parsedConfig,
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

export const submitAction = async (
  ports: EnginePorts,
  input: SubmitActionInput,
): Promise<RuntimeFrame> => {
  const { action, state, blockId } = parseRuntimeInputOrThrow(submitActionInputSchema, input);
  const { currentNode, story, targetBlock } = await resolveSessionContextOrThrow(ports, state, {
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
  const { parsedConfig, parsedState } = resolveEffectiveBlockStateOrThrow(state, currentNode.id, targetBlock);
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

  const interactiveBehavior = behavior as unknown as RuntimeInteractiveBehavior;
  const actionResult = await executeActionForBehavior({
    action,
    actionType,
    behavior: interactiveBehavior,
    blockId,
    nodeId: currentNode.id,
    parsedConfig,
    parsedState,
    playerId: state.playerId,
    ports,
    requiredContext: policy.requiredContext,
    stateType: policy.stateType,
    targetBlockType: targetBlock.type,
  });

  const nextState = writeBlockStateByType(
    state,
    actionResult.stateType,
    blockId,
    actionResult.updatedBlockState,
  );
  const hydratedCurrentNode = createCurrentNodeViewOrThrow(nextState, currentNode);

  return createRuntimeFrame(
    nextState,
    createRuntimeView(
      hydratedCurrentNode,
      deriveTraversableEdgesOrThrow(story, nextState, currentNode),
    ),
    {
      normalizeState: false,
    },
  );
};
