import type { BlockStateType } from '../../blocks/contracts.js';
import type { SessionState } from '../types.js';

export type SessionStateType = BlockStateType;

export type BlockStateReadResult = {
  found: boolean;
  value: unknown;
};

export const readOwnBlockState = (
  stateMap: Record<string, unknown>,
  blockId: string,
): BlockStateReadResult =>
  Object.hasOwn(stateMap, blockId)
    ? {
        found: true,
        value: stateMap[blockId],
      }
    : {
        found: false,
        value: undefined,
      };

export const writeBlockStateByType = (
  state: SessionState,
  stateType: SessionStateType,
  blockId: string,
  blockState: unknown,
): SessionState => {
  const nextStateMap = {
    ...state[stateType].blockStates,
    [blockId]: blockState,
  };

  if (stateType === 'playerState') {
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
