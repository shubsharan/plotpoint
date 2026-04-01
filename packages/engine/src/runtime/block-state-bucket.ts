import type { BlockStateType } from '../blocks/types.js';
import type { RuntimeState } from './types.js';

export type RuntimeStateType = BlockStateType;

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
  state: RuntimeState,
  stateType: RuntimeStateType,
  blockId: string,
  blockState: unknown,
): RuntimeState => {
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
