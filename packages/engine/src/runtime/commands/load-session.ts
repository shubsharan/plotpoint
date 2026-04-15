import {
  loadSessionStoryContextOrThrow,
  parseSessionCommandInputOrThrow,
} from '../context/story-context.js';
import { loadSessionInputSchema } from '../contracts/command-inputs.js';
import { projectRuntimeFrame } from '../projection/runtime-frame.js';
import {
  projectCurrentNodeViewOrThrow,
  projectRuntimeView,
} from '../projection/runtime-view.js';
import { deriveTraversableEdgesOrThrow } from '../traversal/condition-evaluator.js';
import type { EnginePorts, LoadSessionInput, RuntimeFrame } from '../types.js';

export const loadSession = async (
  ports: EnginePorts,
  input: LoadSessionInput,
): Promise<RuntimeFrame> => {
  const { state } = parseSessionCommandInputOrThrow(loadSessionInputSchema, input);
  const { currentNode, story } = await loadSessionStoryContextOrThrow(ports, state);
  const currentNodeView = projectCurrentNodeViewOrThrow(state, currentNode);

  return projectRuntimeFrame(
    state,
    projectRuntimeView(
      currentNodeView,
      deriveTraversableEdgesOrThrow(story, state, currentNode),
    ),
  );
};
