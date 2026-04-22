import { StoryRunPersistenceError } from './errors.js';
import type { RunResumeEnvelope } from './types.js';

export type RunSessionState = {
  currentNodeId: string;
  sessionId: string;
  playerId: string;
  playerState: {
    blockStates: Record<string, unknown>;
  };
  roleId: string;
  sharedState: {
    blockStates: Record<string, unknown>;
  };
  storyId: string;
  storyPackageVersionId: string;
};

export const assembleSessionStateFromRunResumeEnvelope = (
  envelope: RunResumeEnvelope,
): RunSessionState => {
  if (!envelope.run.storyPackageVersionId) {
    throw new StoryRunPersistenceError(
      'story_run_pinned_package_missing',
      `Run "${envelope.run.runId}" has no pinned storyPackageVersionId.`,
    );
  }

  return {
    currentNodeId: envelope.roleState.currentNodeId,
    sessionId: envelope.run.runId,
    playerId: envelope.binding.participantId,
    playerState: {
      blockStates: envelope.roleState.blockStates,
    },
    roleId: envelope.binding.roleId,
    sharedState: {
      blockStates: envelope.sharedState.blockStates,
    },
    storyId: envelope.run.storyId,
    storyPackageVersionId: envelope.run.storyPackageVersionId,
  };
};
