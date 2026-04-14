import { EngineRuntimeError } from './errors.js';
import {
  createCurrentNodeSnapshotOrThrow,
  createRuntimeSnapshot,
  getNodeOrThrow,
  parseRuntimeInputOrThrow,
  resolveRuntimeSnapshotContextOrThrow,
} from './snapshot.js';
import { traverseEdgeInputSchema } from './schema.js';
import { deriveTraversableEdgesOrThrow } from './traversal.js';
import type { EnginePorts, RuntimeSnapshot, TraverseEdgeInput } from './types.js';

export const traverseEdge = async (
  ports: EnginePorts,
  input: TraverseEdgeInput,
): Promise<RuntimeSnapshot> => {
  const { edgeId, state } = parseRuntimeInputOrThrow(traverseEdgeInputSchema, input);
  const { currentNode, story, targetEdge } = await resolveRuntimeSnapshotContextOrThrow(ports, state, {
    edgeId,
  });

  const edge = targetEdge;
  if (!edge) {
    throw new Error('Expected resolveRuntimeSnapshotContextOrThrow to return targetEdge.');
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
  const hydratedCurrentNode = createCurrentNodeSnapshotOrThrow(nextState, nextNode);

  return createRuntimeSnapshot(
    nextState,
    hydratedCurrentNode,
    deriveTraversableEdgesOrThrow(story, nextState, nextNode),
  );
};
