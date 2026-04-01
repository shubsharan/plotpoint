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
  const { story, targetEdge } = await resolveRuntimeSnapshotContextOrThrow(ports, state, {
    edgeId,
  });

  const edge = targetEdge;
  if (!edge) {
    throw new Error('Expected resolveRuntimeSnapshotContextOrThrow to return targetEdge.');
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
