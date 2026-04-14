import {
  createCurrentNodeSnapshotOrThrow,
  createRuntimeSnapshot,
  parseRuntimeInputOrThrow,
  resolveRuntimeSnapshotContextOrThrow,
} from './snapshot.js';
import { loadRuntimeInputSchema } from './schema.js';
import { deriveTraversableEdgesOrThrow } from './traversal.js';
import type { EnginePorts, LoadRuntimeInput, RuntimeSnapshot } from './types.js';

export const loadRuntime = async (
  ports: EnginePorts,
  input: LoadRuntimeInput,
): Promise<RuntimeSnapshot> => {
  const { state } = parseRuntimeInputOrThrow(loadRuntimeInputSchema, input);
  const { currentNode, story } = await resolveRuntimeSnapshotContextOrThrow(ports, state);
  const hydratedCurrentNode = createCurrentNodeSnapshotOrThrow(state, currentNode);

  return createRuntimeSnapshot(
    state,
    hydratedCurrentNode,
    deriveTraversableEdgesOrThrow(story, state, currentNode),
  );
};
