import {
  assertRoleExistsOrThrow,
  getNodeOrThrow,
  loadStoryOrThrow,
  mapAvailableEdges,
  parseRuntimeInputOrThrow,
} from './snapshot.js';
import { startGameInputSchema } from './schema.js';
import type { EnginePorts, RuntimeSnapshot, StartGameInput } from './types.js';

export const startGame = async (
  ports: EnginePorts,
  input: StartGameInput,
): Promise<RuntimeSnapshot> => {
  const parsedInput = parseRuntimeInputOrThrow(startGameInputSchema, input);
  const story = await loadStoryOrThrow(ports, parsedInput.storyId);

  assertRoleExistsOrThrow(story, parsedInput.roleId);

  const entryNode = getNodeOrThrow(story, story.graph.entryNodeId);

  return {
    currentNodeId: entryNode.id,
    gameId: parsedInput.gameId,
    playerId: parsedInput.playerId,
    playerState: {
      blockStates: {},
    },
    roleId: parsedInput.roleId,
    sharedState: {
      blockStates: {},
    },
    storyId: parsedInput.storyId,
    availableEdges: mapAvailableEdges(entryNode),
  };
};
