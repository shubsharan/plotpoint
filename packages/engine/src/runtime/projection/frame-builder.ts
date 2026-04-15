import type { RuntimeFrame, RuntimeView, SessionState } from '../types.js';

export const normalizeSessionState = (state: SessionState): SessionState => ({
  ...state,
  playerState: {
    ...state.playerState,
    blockStates: { ...state.playerState.blockStates },
  },
  sharedState: {
    ...state.sharedState,
    blockStates: { ...state.sharedState.blockStates },
  },
});

export const createRuntimeFrame = (
  state: SessionState,
  view: RuntimeView,
  options?: {
    normalizeState?: boolean | undefined;
  },
): RuntimeFrame => ({
  state: options?.normalizeState === false ? state : normalizeSessionState(state),
  view,
});
