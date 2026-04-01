export type RuntimeStateScopeKey = 'playerState' | 'sharedState';

export const resolveRuntimeStateScopeKey = (scope: 'game' | 'user'): RuntimeStateScopeKey =>
  scope === 'game' ? 'sharedState' : 'playerState';
