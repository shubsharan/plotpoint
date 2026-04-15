import {
  assertRoleExistsOrThrow,
  getNodeOrThrow,
  loadStoryOrThrow,
  parseRuntimeInputOrThrow,
} from '../context/story-context.js';
import { createRuntimeFrame } from '../projection/frame-builder.js';
import {
  createCurrentNodeViewOrThrow,
  createRuntimeView,
} from '../projection/view-projection.js';
import { startSessionInputSchema } from '../contracts/command-inputs.js';
import { deriveTraversableEdgesOrThrow } from '../traversal/condition-evaluator.js';
import type { EnginePorts, RuntimeFrame, SessionState, StartSessionInput } from '../types.js';

export const startSession = async (
  ports: EnginePorts,
  input: StartSessionInput,
): Promise<RuntimeFrame> => {
  const parsedInput = parseRuntimeInputOrThrow(startSessionInputSchema, input);
  const { storyPackage, storyPackageVersionId } = await loadStoryOrThrow(
    ports,
    parsedInput.storyId,
  );

  assertRoleExistsOrThrow(storyPackage, parsedInput.roleId);

  const entryNode = getNodeOrThrow(storyPackage, storyPackage.graph.entryNodeId);
  const initialState: SessionState = {
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
  const currentNode = createCurrentNodeViewOrThrow(initialState, entryNode);

  return createRuntimeFrame(
    initialState,
    createRuntimeView(
      currentNode,
      deriveTraversableEdgesOrThrow(storyPackage, initialState, entryNode),
    ),
  );
};
