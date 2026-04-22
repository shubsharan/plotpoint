import {
  assertRoleExistsOrThrow,
  loadStoryByVersionOrThrow,
  getNodeOrThrow,
  loadStoryOrThrow,
  parseSessionCommandInputOrThrow,
} from '../context/story-context.js';
import { startSessionInputSchema } from '../contracts/command-inputs.js';
import { projectRuntimeFrame } from '../projection/runtime-frame.js';
import {
  projectCurrentNodeViewOrThrow,
  projectRuntimeView,
} from '../projection/runtime-view.js';
import { deriveTraversableEdgesOrThrow } from '../traversal/condition-evaluator.js';
import type { EnginePorts, RuntimeFrame, SessionState, StartSessionInput } from '../types.js';

export const startSession = async (
  ports: EnginePorts,
  input: StartSessionInput,
): Promise<RuntimeFrame> => {
  const parsedInput = parseSessionCommandInputOrThrow(startSessionInputSchema, input);
  const { storyPackage, storyPackageVersionId } = parsedInput.storyPackageVersionId
    ? {
        storyPackage: await loadStoryByVersionOrThrow(
          ports,
          parsedInput.storyId,
          parsedInput.storyPackageVersionId,
        ),
        storyPackageVersionId: parsedInput.storyPackageVersionId,
      }
    : await loadStoryOrThrow(ports, parsedInput.storyId);

  assertRoleExistsOrThrow(storyPackage, parsedInput.roleId);

  const entryNode = getNodeOrThrow(storyPackage, storyPackage.graph.entryNodeId);
  const initialState: SessionState = {
    currentNodeId: entryNode.id,
    sessionId: parsedInput.sessionId,
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
  const currentNodeView = projectCurrentNodeViewOrThrow(initialState, entryNode);

  return projectRuntimeFrame(
    initialState,
    projectRuntimeView(
      currentNodeView,
      deriveTraversableEdgesOrThrow(storyPackage, initialState, entryNode),
    ),
  );
};
