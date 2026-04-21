import type { BlockStateScope } from '../../blocks/contracts.js';
import type { SessionState } from '../types.js';
import type { SessionStateBucket } from '../contracts/session-state.js';

export type BlockStateReadResult = {
  found: false;
  value: undefined;
} | {
  found: true;
  value: unknown;
};

export type TypedBlockStateReadResult<TBlockState> = {
  found: false;
  value: undefined;
} | {
  found: true;
  value: TBlockState;
};

const getSessionStateBucket = (
  state: SessionState,
  stateScope: BlockStateScope,
): SessionStateBucket => (stateScope === 'player' ? state.playerState : state.sharedState);

export const readScopedBlockState = <TBlockState = unknown>(
  state: SessionState,
  stateScope: BlockStateScope,
  blockId: string,
): TypedBlockStateReadResult<TBlockState> => {
  const blockStates = getSessionStateBucket(state, stateScope).blockStates;
  return Object.hasOwn(blockStates, blockId)
    ? {
        found: true,
        value: blockStates[blockId] as TBlockState,
      }
    : {
        found: false,
        value: undefined,
      };
};

export const writeScopedBlockState = <TBlockState>(
  state: SessionState,
  stateScope: BlockStateScope,
  blockId: string,
  blockState: TBlockState,
): SessionState => {
  const blockStates = getSessionStateBucket(state, stateScope).blockStates;
  const nextStateMap: SessionStateBucket['blockStates'] = {
    ...blockStates,
    [blockId]: blockState,
  };

  if (stateScope === 'player') {
    return {
      ...state,
      playerState: {
        ...state.playerState,
        blockStates: nextStateMap,
      },
    };
  }

  return {
    ...state,
    sharedState: {
      ...state.sharedState,
      blockStates: nextStateMap,
    },
  };
};
