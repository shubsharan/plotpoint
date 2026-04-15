import { getBlockSpec, hasBlockType } from '../../blocks/registry.js';
import type { BlockAction, BlockConfig, BlockSpec, BlockState } from '../../blocks/contracts.js';
import type { StoryPackage } from '../../story-packages/schema.js';
import { EngineRuntimeError } from '../errors.js';
import { readScopedBlockState } from '../state/scoped-block-state.js';
import type { CurrentNodeBlockView, SessionState } from '../types.js';
import { formatIssuePath } from './story-context.js';

type StoryNode = StoryPackage['graph']['nodes'][number];
type StoryBlock = StoryNode['blocks'][number];
type RuntimeBlockSpec = ReturnType<typeof getBlockSpec>;
type RuntimeTypedBlockSpec = BlockSpec<BlockConfig, BlockState, BlockAction>;

type ValidationIssuePath = ReadonlyArray<number | string | symbol>;

const toValidationDetails = (path: ValidationIssuePath, code: string) => ({
  validationCode: code,
  validationPath: formatIssuePath(path),
});

const resolveBlockSpecOrThrow = (
  nodeId: string,
  block: StoryBlock,
): RuntimeBlockSpec => {
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

  return getBlockSpec(block.type);
};

export type ResolvedEffectiveBlockState = {
  blockSpec: RuntimeBlockSpec;
  currentNodeBlock: CurrentNodeBlockView;
  parsedConfig: BlockConfig;
  parsedState: BlockState;
  stateScope: RuntimeBlockSpec['stateScope'];
};

export const resolveEffectiveBlockStateOrThrow = (
  state: SessionState,
  nodeId: string,
  block: StoryBlock,
): ResolvedEffectiveBlockState => {
  const blockSpec = resolveBlockSpecOrThrow(nodeId, block);
  const typedBlockSpec = blockSpec as unknown as RuntimeTypedBlockSpec;
  const parsedConfig = typedBlockSpec.configSchema.safeParse(block.config);
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

  const persistedState = readScopedBlockState(state, typedBlockSpec.stateScope, block.id);
  let candidateState: unknown;
  if (persistedState.found) {
    candidateState = persistedState.value;
  } else {
    try {
      candidateState = typedBlockSpec.initialState(parsedConfig.data);
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

  const parsedState = typedBlockSpec.stateSchema.safeParse(candidateState);
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
    blockSpec: typedBlockSpec,
    currentNodeBlock: {
      config: block.config,
      id: block.id,
      interactive: typedBlockSpec.interactive,
      state: parsedState.data,
      type: block.type,
    },
    parsedConfig: parsedConfig.data,
    parsedState: parsedState.data,
    stateScope: typedBlockSpec.stateScope,
  };
};
