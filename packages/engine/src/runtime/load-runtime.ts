import {
  mapAvailableEdges,
  normalizeRuntimeSnapshot,
  parseRuntimeInputOrThrow,
  resolveRuntimeSnapshotContextOrThrow,
} from './snapshot.js';
import { loadRuntimeInputSchema } from './schema.js';
import type { EnginePorts, LoadRuntimeInput, RuntimeSnapshot } from './types.js';

export const loadRuntime = async (
  ports: EnginePorts,
  input: LoadRuntimeInput,
): Promise<RuntimeSnapshot> => {
  const { snapshot } = parseRuntimeInputOrThrow(loadRuntimeInputSchema, input);
  const { currentNode } = await resolveRuntimeSnapshotContextOrThrow(ports, snapshot);

  return normalizeRuntimeSnapshot(snapshot, mapAvailableEdges(currentNode));
};
