import {
  createRuntimeSnapshot,
  mapAvailableEdges,
  parseRuntimeInputOrThrow,
  resolveRuntimeSnapshotContextOrThrow,
} from './snapshot.js';
import { submitActionInputSchema } from './schema.js';
import type { EnginePorts, RuntimeSnapshot, SubmitActionInput } from './types.js';

export const submitAction = async (
  ports: EnginePorts,
  input: SubmitActionInput,
): Promise<RuntimeSnapshot> => {
  const { state, blockId } = parseRuntimeInputOrThrow(submitActionInputSchema, input);
  const { currentNode } = await resolveRuntimeSnapshotContextOrThrow(ports, state, {
    blockId,
  });

  return createRuntimeSnapshot(state, mapAvailableEdges(currentNode));
};
