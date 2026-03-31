import {
  createRuntimeSnapshotInvalidError,
  mapAvailableEdges,
  normalizeRuntimeSnapshot,
  resolveRuntimeSnapshotContextOrThrow,
} from './snapshot.js';
import { loadRuntimeInputSchema } from './schema.js';
import type { EnginePorts, LoadRuntimeInput, RuntimeSnapshot } from './types.js';

export const loadRuntime = async (
  ports: EnginePorts,
  input: LoadRuntimeInput,
): Promise<RuntimeSnapshot> => {
  const parsed = loadRuntimeInputSchema.safeParse(input);
  if (!parsed.success) {
    throw createRuntimeSnapshotInvalidError(parsed.error);
  }

  const { snapshot } = parsed.data;
  const { currentNode } = await resolveRuntimeSnapshotContextOrThrow(ports, snapshot);

  return normalizeRuntimeSnapshot(snapshot, mapAvailableEdges(currentNode));
};
