import { getBlockDefinition, hasBlockType } from '../../blocks/registry.js';
import type { BlockAction, BlockBehavior, BlockConfig, BlockState } from '../../blocks/contracts.js';
import type { StoryPackage } from '../../story-packages/schema.js';
import { EngineRuntimeError } from '../errors.js';
import { readOwnBlockState } from '../state/block-state-bucket.js';
import type { CurrentNodeBlockView, SessionState } from '../types.js';
import { formatIssuePath } from './story-context.js';

type StoryNode = StoryPackage['graph']['nodes'][number];
type StoryBlock = StoryNode['blocks'][number];
type RuntimeBlockDefinition = ReturnType<typeof getBlockDefinition>;
type RuntimeBlockBehavior = BlockBehavior<BlockConfig, BlockState, BlockAction>;

type ValidationIssuePath = ReadonlyArray<number | string | symbol>;

const toValidationDetails = (path: ValidationIssuePath, code: string) => ({
  validationCode: code,
  validationPath: formatIssuePath(path),
});

const resolveBlockDefinitionOrThrow = (
  nodeId: string,
  block: StoryBlock,
): RuntimeBlockDefinition => {
  if (!hasBlockType(block.type)) {
    throw new EngineRuntimeError(
      'runtime_block_type_unregistered',
      `Runtime block type "${block.type}" is not registered in the block registry.`,
      {
        details: {
          blockId: block.id,
          blockType: block.type,
          nodeId,
        },
      },
    );
  }

  return getBlockDefinition(block.type);
};

export type ResolvedEffectiveBlockState = {
  currentNodeBlock: CurrentNodeBlockView;
  definition: RuntimeBlockDefinition;
  parsedConfig: BlockConfig;
  parsedState: BlockState;
  policy: RuntimeBlockDefinition['policy'];
};

export const resolveEffectiveBlockStateOrThrow = (
  state: SessionState,
  nodeId: string,
  block: StoryBlock,
): ResolvedEffectiveBlockState => {
  const definition = resolveBlockDefinitionOrThrow(nodeId, block);
  const behavior = definition.behavior as unknown as RuntimeBlockBehavior;
  const { policy } = definition;
  const parsedConfig = behavior.configSchema.safeParse(block.config);
  if (!parsedConfig.success) {
    const firstIssue = parsedConfig.error.issues[0];
    throw new EngineRuntimeError(
      'runtime_block_config_invalid',
      `Runtime block "${block.id}" has invalid config for type "${block.type}".`,
      {
        details: {
          blockId: block.id,
          blockType: block.type,
          nodeId,
          ...(firstIssue === undefined
            ? {}
            : toValidationDetails(firstIssue.path, firstIssue.code)),
        },
      },
    );
  }

  const persistedState = readOwnBlockState(state[policy.stateType].blockStates, block.id);
  let candidateState: unknown;
  if (persistedState.found) {
    candidateState = persistedState.value;
  } else {
    try {
      candidateState = behavior.initialState(parsedConfig.data);
    } catch (error) {
      throw new EngineRuntimeError(
        'runtime_block_execution_failed',
        `Runtime block "${block.id}" initial state resolution failed for type "${block.type}".`,
        {
          cause: error,
          details: {
            blockId: block.id,
            blockType: block.type,
            nodeId,
            phase: 'initial_state',
          },
        },
      );
    }
  }

  const parsedState = behavior.stateSchema.safeParse(candidateState);
  if (!parsedState.success) {
    const firstIssue = parsedState.error.issues[0];
    throw new EngineRuntimeError(
      'runtime_block_state_invalid',
      persistedState.found
        ? `Runtime block "${block.id}" has invalid persisted state for type "${block.type}".`
        : `Runtime block "${block.id}" produced invalid initial state for type "${block.type}".`,
      {
        details: {
          blockId: block.id,
          blockType: block.type,
          nodeId,
          ...(firstIssue === undefined
            ? {}
            : toValidationDetails(firstIssue.path, firstIssue.code)),
        },
      },
    );
  }

  return {
    currentNodeBlock: {
      config: block.config,
      id: block.id,
      interactive: behavior.interactive,
      state: parsedState.data,
      type: block.type,
    },
    definition,
    parsedConfig: parsedConfig.data,
    parsedState: parsedState.data,
    policy,
  };
};
