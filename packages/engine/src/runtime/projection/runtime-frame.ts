import type { RuntimeFrame, RuntimeView, SessionState } from '../types.js';

export const cloneSessionState = (state: SessionState): SessionState => ({
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

export const projectRuntimeFrame = (
  state: SessionState,
  view: RuntimeView,
): RuntimeFrame => ({
  state: cloneSessionState(state),
  view,
});
