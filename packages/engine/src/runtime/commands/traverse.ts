import { EngineRuntimeError } from '../errors.js';
import {
  getNodeOrThrow,
  parseRuntimeInputOrThrow,
  resolveSessionContextOrThrow,
} from '../context/story-context.js';
import { traverseInputSchema } from '../contracts/command-inputs.js';
import { createRuntimeFrame } from '../projection/frame-builder.js';
import {
  createCurrentNodeViewOrThrow,
  createRuntimeView,
} from '../projection/view-projection.js';
import { deriveTraversableEdgesOrThrow } from '../traversal/condition-evaluator.js';
import type { EnginePorts, RuntimeFrame, TraverseInput } from '../types.js';

export const traverse = async (
  ports: EnginePorts,
  input: TraverseInput,
): Promise<RuntimeFrame> => {
  const { edgeId, state } = parseRuntimeInputOrThrow(traverseInputSchema, input);
  const { currentNode, story, targetEdge } = await resolveSessionContextOrThrow(ports, state, {
    edgeId,
  });

  const edge = targetEdge;
  if (!edge) {
    throw new Error('Expected resolveSessionContextOrThrow to return targetEdge.');
  }
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
  const hydratedCurrentNode = createCurrentNodeViewOrThrow(nextState, nextNode);

  return createRuntimeFrame(
    nextState,
    createRuntimeView(
      hydratedCurrentNode,
      deriveTraversableEdgesOrThrow(story, nextState, nextNode),
    ),
  );
};
