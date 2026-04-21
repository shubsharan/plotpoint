import type { z } from 'zod';
import type {
  BlockSpecConfig,
  BlockSpecState,
  InteractiveBlockSpecAction,
} from '../../blocks/contracts.js';
import { BlockUpdateError, type BlockActionContext, type BlockContextKey } from '../../blocks/contracts.js';
import type { InteractiveKnownBlockSpec } from '../../blocks/registry.js';
import { EngineRuntimeError } from '../errors.js';
import { formatIssuePath } from '../context/story-context.js';
import type { EnginePorts } from '../types.js';

type ActionExecutionResult<TBlockSpec extends InteractiveKnownBlockSpec> = {
  updatedBlockState: BlockSpecState<TBlockSpec> & { unlocked: boolean };
};

type ExecuteBlockActionParams<TBlockSpec extends InteractiveKnownBlockSpec> = {
  action: unknown;
  blockId: string;
  blockSpec: TBlockSpec;
  blockType: string;
  nodeId: string;
  parsedConfig: BlockSpecConfig<TBlockSpec>;
  parsedState: BlockSpecState<TBlockSpec> & { unlocked: boolean };
  playerId: string;
  ports: EnginePorts;
};

const resolveActionType = (action: unknown): string | undefined => {
  if (typeof action !== 'object' || action === null || !('type' in action)) {
    return undefined;
  }

  const { type: actionType } = action;
  return typeof actionType === 'string' ? actionType : undefined;
};

const toValidationDetails = (issue: z.core.$ZodIssue): Record<string, unknown> => ({
  validationCode: issue.code,
  validationPath: formatIssuePath(issue.path),
});

const isActionable = <TState, TConfig>(
  canAct: ((state: TState, config: TConfig) => boolean) | undefined,
  parsedState: TState,
  parsedConfig: TConfig,
): boolean =>
  (canAct as unknown as ((state: TState, config: TConfig) => boolean) | undefined)?.(
    parsedState,
    parsedConfig,
  ) ?? true;

const runBlockAction = <TState, TAction, TConfig>(
  onAction: (
    state: TState,
    action: TAction,
    context: BlockActionContext,
    config: TConfig,
  ) => TState,
  parsedState: TState,
  parsedAction: TAction,
  actionContext: BlockActionContext,
  parsedConfig: TConfig,
): TState =>
  (onAction as unknown as (
    state: TState,
    action: TAction,
    context: BlockActionContext,
    config: TConfig,
  ) => TState)(parsedState, parsedAction, actionContext, parsedConfig);

const isActionableOrThrow = <TBlockSpec extends InteractiveKnownBlockSpec>(
  blockSpec: TBlockSpec,
  parsedState: BlockSpecState<TBlockSpec> & { unlocked: boolean },
  parsedConfig: BlockSpecConfig<TBlockSpec>,
  details: {
    actionType?: string | undefined;
    blockId: string;
    blockType: string;
    nodeId: string;
  },
): void => {
  if (
    isActionable(
      blockSpec.isActionable as unknown as
        | ((state: BlockSpecState<TBlockSpec>, config: BlockSpecConfig<TBlockSpec>) => boolean)
        | undefined,
      parsedState,
      parsedConfig,
    )
  ) {
    return;
  }

  throw new EngineRuntimeError(
    'runtime_block_not_actionable',
    `Runtime block "${details.blockId}" is no longer actionable in its current state.`,
    {
      details: {
        actionType: details.actionType,
        blockId: details.blockId,
        blockType: details.blockType,
        nodeId: details.nodeId,
        reason: 'state_not_actionable',
      },
    },
  );
};

const reduceBlockAction = <TBlockSpec extends InteractiveKnownBlockSpec>(
  blockSpec: TBlockSpec,
  parsedState: BlockSpecState<TBlockSpec> & { unlocked: boolean },
  parsedAction: InteractiveBlockSpecAction<TBlockSpec>,
  actionContext: BlockActionContext,
  parsedConfig: BlockSpecConfig<TBlockSpec>,
): BlockSpecState<TBlockSpec> & { unlocked: boolean } =>
  runBlockAction(
    blockSpec.onAction as unknown as (
      state: BlockSpecState<TBlockSpec> & { unlocked: boolean },
      action: InteractiveBlockSpecAction<TBlockSpec>,
      context: BlockActionContext,
      config: BlockSpecConfig<TBlockSpec>,
    ) => BlockSpecState<TBlockSpec> & { unlocked: boolean },
    parsedState,
    parsedAction,
    actionContext,
    parsedConfig,
  );

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

export const executeBlockActionOrThrow = async <TBlockSpec extends InteractiveKnownBlockSpec>(
  params: ExecuteBlockActionParams<TBlockSpec>,
): Promise<ActionExecutionResult<TBlockSpec>> => {
  const {
    action,
    blockId,
    blockSpec,
    blockType,
    nodeId,
    parsedConfig,
    parsedState,
    playerId,
    ports,
  } = params;
  const actionType = resolveActionType(action);

  if (parsedState.unlocked) {
    throw new EngineRuntimeError(
      'runtime_block_already_unlocked',
      `Runtime block "${blockId}" is already unlocked and cannot accept further actions.`,
      {
        details: {
          actionType,
          blockId,
          blockType,
          nodeId,
        },
      },
    );
  }

  isActionableOrThrow(blockSpec, parsedState, parsedConfig, {
    actionType,
    blockId,
    blockType,
    nodeId,
  });

  const parsedAction = blockSpec.actionSchema.safeParse(action);
  if (!parsedAction.success) {
    const firstIssue = parsedAction.error.issues[0];
    throw new EngineRuntimeError(
      'runtime_block_action_invalid',
      `Runtime block "${blockId}" received an invalid submit action for type "${blockType}".`,
      {
        details: {
          actionType,
          blockId,
          blockType,
          nodeId,
          ...(firstIssue === undefined ? {} : toValidationDetails(firstIssue)),
        },
      },
    );
  }

  const actionContext = await resolveExecutionContextOrThrow({
    actionType,
    blockId,
    blockType,
    nodeId,
    playerId,
    ports,
    requiredContext: blockSpec.requiredContext,
  });

  let updatedState: BlockSpecState<TBlockSpec> & { unlocked: boolean };
  try {
    updatedState = reduceBlockAction(
      blockSpec,
      parsedState,
      parsedAction.data as InteractiveBlockSpecAction<TBlockSpec>,
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
            blockType,
            nodeId,
            ...error.details,
          },
        },
      );
    }

    if (error instanceof BlockUpdateError && error.code === 'action_invalid_for_config') {
      throw new EngineRuntimeError(
        'runtime_block_action_invalid',
        `Runtime block "${blockId}" rejected the action for type "${blockType}".`,
        {
          cause: error,
          details: {
            actionType,
            blockId,
            blockType,
            nodeId,
            ...error.details,
          },
        },
      );
    }

    throw new EngineRuntimeError(
      'runtime_block_execution_failed',
      `Runtime block "${blockId}" reducer execution failed for type "${blockType}".`,
      {
        cause: error,
        details: {
          actionType,
          blockId,
          blockType,
          nodeId,
        },
      },
    );
  }

  const parsedUpdatedState = blockSpec.stateSchema.safeParse(updatedState);
  if (!parsedUpdatedState.success) {
    const firstIssue = parsedUpdatedState.error.issues[0];
    throw new EngineRuntimeError(
      'runtime_block_state_invalid',
      `Runtime block "${blockId}" reducer returned invalid state for type "${blockType}".`,
      {
        details: {
          actionType,
          blockId,
          blockType,
          nodeId,
          ...(firstIssue === undefined ? {} : toValidationDetails(firstIssue)),
        },
      },
    );
  }

  return {
    updatedBlockState: parsedUpdatedState.data as BlockSpecState<TBlockSpec> & {
      unlocked: boolean;
    },
  };
};
