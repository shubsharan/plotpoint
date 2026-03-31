import {
  mapAvailableEdges,
  normalizeRuntimeSnapshot,
  parseRuntimeInputOrThrow,
  resolveRuntimeSnapshotContextOrThrow,
} from './snapshot.js';
import { submitActionInputSchema } from './schema.js';
import type { EnginePorts, RuntimeSnapshot, SubmitActionInput } from './types.js';

export const submitAction = async (
  ports: EnginePorts,
  input: SubmitActionInput,
): Promise<RuntimeSnapshot> => {
  const { runtime, blockId } = parseRuntimeInputOrThrow(submitActionInputSchema, input);
  const { currentNode } = await resolveRuntimeSnapshotContextOrThrow(ports, runtime, {
    blockId,
  });

  return normalizeRuntimeSnapshot(runtime, mapAvailableEdges(currentNode));
};
