import {
  parseRuntimeInputOrThrow,
  resolveSessionContextOrThrow,
} from '../context/story-context.js';
import { loadSessionInputSchema } from '../contracts/command-inputs.js';
import { createRuntimeFrame } from '../projection/frame-builder.js';
import {
  createCurrentNodeViewOrThrow,
  createRuntimeView,
} from '../projection/view-projection.js';
import { deriveTraversableEdgesOrThrow } from '../traversal/condition-evaluator.js';
import type { EnginePorts, LoadSessionInput, RuntimeFrame } from '../types.js';

export const loadSession = async (
  ports: EnginePorts,
  input: LoadSessionInput,
): Promise<RuntimeFrame> => {
  const { state } = parseRuntimeInputOrThrow(loadSessionInputSchema, input);
  const { currentNode, story } = await resolveSessionContextOrThrow(ports, state);
  const hydratedCurrentNode = createCurrentNodeViewOrThrow(state, currentNode);

  return createRuntimeFrame(
    state,
    createRuntimeView(
      hydratedCurrentNode,
      deriveTraversableEdgesOrThrow(story, state, currentNode),
    ),
  );
};
