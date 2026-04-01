import {
  createCurrentNodeSnapshotOrThrow,
  createRuntimeSnapshot,
  mapTraversableEdges,
  parseRuntimeInputOrThrow,
  resolveRuntimeSnapshotContextOrThrow,
} from './snapshot.js';
import { loadRuntimeInputSchema } from './schema.js';
import type { EnginePorts, LoadRuntimeInput, RuntimeSnapshot } from './types.js';

export const loadRuntime = async (
  ports: EnginePorts,
  input: LoadRuntimeInput,
): Promise<RuntimeSnapshot> => {
  const { state } = parseRuntimeInputOrThrow(loadRuntimeInputSchema, input);
  const { currentNode } = await resolveRuntimeSnapshotContextOrThrow(ports, state);
  const hydratedCurrentNode = createCurrentNodeSnapshotOrThrow(state, currentNode);

  return createRuntimeSnapshot(state, hydratedCurrentNode, mapTraversableEdges(currentNode));
};
