import { EngineRuntimeError } from '../errors.js';
import {
  getNodeOrThrow,
  getTargetEdgeOrThrow,
  loadSessionStoryContextOrThrow,
  parseSessionCommandInputOrThrow,
} from '../context/story-context.js';
import { traverseInputSchema } from '../contracts/command-inputs.js';
import { projectRuntimeFrame } from '../projection/runtime-frame.js';
import {
  projectCurrentNodeViewOrThrow,
  projectRuntimeView,
} from '../projection/runtime-view.js';
import { deriveTraversableEdgesOrThrow } from '../traversal/condition-evaluator.js';
import type { EnginePorts, RuntimeFrame, TraverseInput } from '../types.js';

export const traverse = async (
  ports: EnginePorts,
  input: TraverseInput,
): Promise<RuntimeFrame> => {
  const { edgeId, state } = parseSessionCommandInputOrThrow(traverseInputSchema, input);
  const { currentNode, story } = await loadSessionStoryContextOrThrow(ports, state);
  const edge = getTargetEdgeOrThrow(story, currentNode, edgeId);

  const traversableEdges = deriveTraversableEdgesOrThrow(story, state, currentNode);
  const isTraversable = traversableEdges.some(
    (traversableEdge) => traversableEdge.edgeId === edgeId,
  );
  if (!isTraversable) {
    throw new EngineRuntimeError(
      'runtime_edge_not_traversable',
      `Runtime edge "${edgeId}" is not traversable in node "${currentNode.id}" for story "${state.storyId}".`,
      {
        details: {
          edgeId,
          nodeId: currentNode.id,
          reason: 'condition_false',
          storyId: state.storyId,
        },
      },
    );
  }

  const nextNode = getNodeOrThrow(story, edge.targetNodeId);
  const nextState = {
    ...state,
    currentNodeId: nextNode.id,
  };
  const currentNodeView = projectCurrentNodeViewOrThrow(nextState, nextNode);

  return projectRuntimeFrame(
    nextState,
    projectRuntimeView(
      currentNodeView,
      deriveTraversableEdgesOrThrow(story, nextState, nextNode),
    ),
  );
};
