import type { BlockStateScope } from '../../blocks/contracts.js';
import type { SessionState } from '../types.js';
import type { SessionStateBucket } from '../contracts/session-state.js';

export type BlockStateReadResult = {
  found: boolean;
  value: unknown;
};

const getSessionStateBucket = (
  state: SessionState,
  stateScope: BlockStateScope,
): SessionStateBucket => (stateScope === 'player' ? state.playerState : state.sharedState);

export const readScopedBlockState = (
  state: SessionState,
  stateScope: BlockStateScope,
  blockId: string,
): BlockStateReadResult => {
  const blockStates = getSessionStateBucket(state, stateScope).blockStates;
  return Object.hasOwn(blockStates, blockId)
    ? {
        found: true,
        value: blockStates[blockId],
      }
    : {
        found: false,
        value: undefined,
      };
};

export const writeScopedBlockState = (
  state: SessionState,
  stateScope: BlockStateScope,
  blockId: string,
  blockState: unknown,
): SessionState => {
  const blockStates = getSessionStateBucket(state, stateScope).blockStates;
  const nextStateMap = {
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
