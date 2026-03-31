import {
  assertRoleExistsOrThrow,
  createRuntimeSnapshot,
  getNodeOrThrow,
  loadStoryOrThrow,
  mapAvailableEdges,
  parseRuntimeInputOrThrow,
} from './snapshot.js';
import { startGameInputSchema } from './schema.js';
import type { EnginePorts, RuntimeSnapshot, RuntimeState, StartGameInput } from './types.js';

export const startGame = async (
  ports: EnginePorts,
  input: StartGameInput,
): Promise<RuntimeSnapshot> => {
  const parsedInput = parseRuntimeInputOrThrow(startGameInputSchema, input);
  const { storyPackage, storyPackageVersionId } = await loadStoryOrThrow(
    ports,
    parsedInput.storyId,
  );

  assertRoleExistsOrThrow(storyPackage, parsedInput.roleId);

  const entryNode = getNodeOrThrow(storyPackage, storyPackage.graph.entryNodeId);
  const state: RuntimeState = {
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
    storyPackageVersionId,
  };

  return createRuntimeSnapshot(state, mapAvailableEdges(entryNode));
};
