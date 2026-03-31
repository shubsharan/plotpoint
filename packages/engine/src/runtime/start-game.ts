import {
  assertRoleExistsOrThrow,
  getNodeOrThrow,
  loadStoryOrThrow,
  mapAvailableEdges,
} from './snapshot.js';
import type { EnginePorts, RuntimeSnapshot, StartGameInput } from './types.js';

export const startGame = async (
  ports: EnginePorts,
  input: StartGameInput,
): Promise<RuntimeSnapshot> => {
  const story = await loadStoryOrThrow(ports, input.storyId);

  assertRoleExistsOrThrow(story, input.roleId);

  const entryNode = getNodeOrThrow(story, story.graph.entryNodeId);

  return {
    currentNodeId: entryNode.id,
    gameId: input.gameId,
    playerId: input.playerId,
    playerState: {
      blockStates: {},
    },
    roleId: input.roleId,
    sharedState: {
      blockStates: {},
    },
    storyId: input.storyId,
    availableEdges: mapAvailableEdges(entryNode),
  };
};
