import {
  assertRoleExistsOrThrow,
  createRuntimeSnapshot,
  getNodeOrThrow,
  loadStoryOrThrow,
  mapTraversableEdges,
  parseRuntimeInputOrThrow,
} from './snapshot.js';
import { materializeNodeEntryStateOrThrow } from './node-entry.js';
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
  const initialState: RuntimeState = {
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
  const state = materializeNodeEntryStateOrThrow(initialState, entryNode);

  return createRuntimeSnapshot(state, mapTraversableEdges(entryNode));
};
