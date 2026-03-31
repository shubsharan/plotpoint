import {
  createRuntimeSnapshotInvalidError,
  mapAvailableEdges,
  normalizeRuntimeSnapshot,
  resolveRuntimeSnapshotContextOrThrow,
} from './snapshot.js';
import { submitActionInputSchema } from './schema.js';
import type { EnginePorts, RuntimeSnapshot, SubmitActionInput } from './types.js';

export const submitAction = async (
  ports: EnginePorts,
  input: SubmitActionInput,
): Promise<RuntimeSnapshot> => {
  const parsed = submitActionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw createRuntimeSnapshotInvalidError(parsed.error);
  }

  const { runtime, blockId } = parsed.data;
  const { currentNode } = await resolveRuntimeSnapshotContextOrThrow(ports, runtime, {
    blockId,
  });

  return normalizeRuntimeSnapshot(runtime, mapAvailableEdges(currentNode));
};
