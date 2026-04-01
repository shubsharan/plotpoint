import { EngineRuntimeError } from './errors.js';
import { materializeNodeEntryStateOrThrow } from './node-entry.js';
import {
  createRuntimeSnapshot,
  getNodeOrThrow,
  mapTraversableEdges,
  parseRuntimeInputOrThrow,
  resolveRuntimeSnapshotContextOrThrow,
} from './snapshot.js';
import { traverseEdgeInputSchema } from './schema.js';
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
  const traversableEdges = mapTraversableEdges(currentNode);
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
          reason: 'conditioned_edge_deferred',
          storyId: state.storyId,
        },
      },
    );
  }

  const nextNode = getNodeOrThrow(story, edge.targetNodeId);
  const nextState = materializeNodeEntryStateOrThrow(
    {
      ...state,
      currentNodeId: nextNode.id,
    },
    nextNode,
  );

  return createRuntimeSnapshot(nextState, mapTraversableEdges(nextNode));
};
