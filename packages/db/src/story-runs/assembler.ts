import type { SessionState as EngineSessionState } from '@plotpoint/engine';
import { StoryRunPersistenceError } from './errors.js';
import type { StoryRunResumeBundle } from './types.js';

type SessionState = EngineSessionState extends { sessionId: string }
  ? EngineSessionState
  : Omit<EngineSessionState, 'gameId'> & { sessionId: string };

export const assembleSessionStateFromStoryRunResumeBundle = (
  bundle: StoryRunResumeBundle,
): SessionState => {
  if (!bundle.run.storyPackageVersionId) {
    throw new StoryRunPersistenceError(
      'story_run_pinned_package_missing',
      `Run "${bundle.run.runId}" has no pinned storyPackageVersionId.`,
    );
  }

  return {
    currentNodeId: bundle.roleState.currentNodeId,
    sessionId: bundle.run.runId,
    playerId: bundle.binding.participantId,
    playerState: {
      blockStates: bundle.roleState.blockStates,
    },
    roleId: bundle.binding.roleId,
    sharedState: {
      blockStates: bundle.sharedState.blockStates,
    },
    storyId: bundle.run.storyId,
    storyPackageVersionId: bundle.run.storyPackageVersionId,
  };
};
