import type {
  BlockSpecConfig,
  BlockSpecState,
} from '../../blocks/contracts.js';
import {
  getBlockSpec,
  hasBlockType,
  type InteractiveKnownBlockSpec,
  type KnownBlockType,
  type KnownBlockSpec,
} from '../../blocks/registry.js';
import type { StoryPackageBlock } from '../../story-packages/schema.js';
import { EngineRuntimeError } from '../errors.js';
import { readScopedBlockState } from '../state/scoped-block-state.js';
import type { CurrentNodeBlockView, SessionState } from '../types.js';
import { formatIssuePath } from './story-context.js';

type ValidationIssuePath = ReadonlyArray<number | string | symbol>;

const toValidationDetails = (path: ValidationIssuePath, code: string) => ({
  validationCode: code,
  validationPath: formatIssuePath(path),
});

const parseBlockConfigOrThrow = <TBlockSpec extends KnownBlockSpec>(
  blockSpec: TBlockSpec,
  block: StoryPackageBlock,
  nodeId: string,
): BlockSpecConfig<TBlockSpec> => {
  const parsedConfig = blockSpec.configSchema.safeParse(block.config);
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

  return parsedConfig.data as BlockSpecConfig<TBlockSpec>;
};

const resolveInitialStateOrThrow = <TBlockSpec extends KnownBlockSpec>(
  blockSpec: TBlockSpec,
  block: StoryPackageBlock,
  nodeId: string,
  parsedConfig: BlockSpecConfig<TBlockSpec>,
): BlockSpecState<TBlockSpec> => {
  try {
    const initialState = blockSpec.initialState as unknown as (
      config: BlockSpecConfig<TBlockSpec>,
    ) => BlockSpecState<TBlockSpec>;
    return initialState(parsedConfig);
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
};

const parseBlockStateOrThrow = <TBlockSpec extends KnownBlockSpec>(
  blockSpec: TBlockSpec,
  block: StoryPackageBlock,
  nodeId: string,
  candidateState: unknown,
  persistedStateFound: boolean,
): BlockSpecState<TBlockSpec> => {
  const parsedState = blockSpec.stateSchema.safeParse(candidateState);
  if (!parsedState.success) {
    const firstIssue = parsedState.error.issues[0];
    throw new EngineRuntimeError(
      'runtime_block_state_invalid',
      persistedStateFound
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

  return parsedState.data as BlockSpecState<TBlockSpec>;
};

function resolveBlockSpecOrThrow<TBlockType extends KnownBlockType>(
  nodeId: string,
  block: StoryPackageBlock & { type: TBlockType },
): KnownBlockSpec<TBlockType>;
function resolveBlockSpecOrThrow(
  nodeId: string,
  block: StoryPackageBlock,
): KnownBlockSpec;
function resolveBlockSpecOrThrow(
  nodeId: string,
  block: StoryPackageBlock,
): KnownBlockSpec {
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
}

export type ResolvedEffectiveBlockState<TBlockSpec extends KnownBlockSpec = KnownBlockSpec> = {
  blockSpec: TBlockSpec;
  currentNodeBlock: CurrentNodeBlockView<StoryPackageBlock['config'], BlockSpecState<TBlockSpec>>;
  parsedConfig: BlockSpecConfig<TBlockSpec>;
  parsedState: BlockSpecState<TBlockSpec>;
  stateScope: TBlockSpec['stateScope'];
};

export type InteractiveResolvedEffectiveBlockState<
  TBlockSpec extends InteractiveKnownBlockSpec = InteractiveKnownBlockSpec,
> = ResolvedEffectiveBlockState<TBlockSpec>;

export const isInteractiveResolvedEffectiveBlockState = <
  TBlockSpec extends KnownBlockSpec,
>(
  resolvedBlockState: ResolvedEffectiveBlockState<TBlockSpec>,
): resolvedBlockState is InteractiveResolvedEffectiveBlockState<
  Extract<TBlockSpec, InteractiveKnownBlockSpec>
> => resolvedBlockState.blockSpec.interactive;

export function resolveEffectiveBlockStateOrThrow<TBlockType extends KnownBlockType>(
  state: SessionState,
  nodeId: string,
  block: StoryPackageBlock & { type: TBlockType },
): ResolvedEffectiveBlockState<KnownBlockSpec<TBlockType>>;
export function resolveEffectiveBlockStateOrThrow(
  state: SessionState,
  nodeId: string,
  block: StoryPackageBlock,
): ResolvedEffectiveBlockState;
export function resolveEffectiveBlockStateOrThrow(
  state: SessionState,
  nodeId: string,
  block: StoryPackageBlock,
): ResolvedEffectiveBlockState {
  const blockSpec = resolveBlockSpecOrThrow(nodeId, block);
  const parsedConfig = parseBlockConfigOrThrow(blockSpec, block, nodeId);

  const persistedState = readScopedBlockState<BlockSpecState<typeof blockSpec>>(
    state,
    blockSpec.stateScope,
    block.id,
  );
  let candidateState: unknown;
  if (persistedState.found) {
    candidateState = persistedState.value;
  } else {
    candidateState = resolveInitialStateOrThrow(blockSpec, block, nodeId, parsedConfig);
  }

  const parsedState = parseBlockStateOrThrow(
    blockSpec,
    block,
    nodeId,
    candidateState,
    persistedState.found,
  );

  return {
    blockSpec,
    currentNodeBlock: {
      config: block.config,
      id: block.id,
      interactive: blockSpec.interactive,
      state: parsedState,
      type: block.type,
    },
    parsedConfig,
    parsedState,
    stateScope: blockSpec.stateScope,
  };
}
