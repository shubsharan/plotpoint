import { executeBlockActionOrThrow } from '../actions/execute-block-action.js';
import {
  getTargetBlockOrThrow,
  loadSessionStoryContextOrThrow,
  parseSessionCommandInputOrThrow,
} from '../context/story-context.js';
import {
  isInteractiveResolvedEffectiveBlockState,
  resolveEffectiveBlockStateOrThrow,
} from '../context/block-resolution.js';
import { submitActionInputSchema } from '../contracts/command-inputs.js';
import { EngineRuntimeError } from '../errors.js';
import { projectRuntimeFrame } from '../projection/runtime-frame.js';
import {
  projectCurrentNodeViewOrThrow,
  projectRuntimeView,
} from '../projection/runtime-view.js';
import { writeScopedBlockState } from '../state/scoped-block-state.js';
import { deriveTraversableEdgesOrThrow } from '../traversal/condition-evaluator.js';
import type { EnginePorts, RuntimeFrame, SubmitActionInput } from '../types.js';

const resolveActionType = (action: unknown): string | undefined => {
  if (typeof action !== 'object' || action === null || !('type' in action)) {
    return undefined;
  }

  return typeof action.type === 'string' ? action.type : undefined;
};

export const submitAction = async (
  ports: EnginePorts,
  input: SubmitActionInput,
): Promise<RuntimeFrame> => {
  const { action, state, blockId } = parseSessionCommandInputOrThrow(submitActionInputSchema, input);
  const { currentNode, story } = await loadSessionStoryContextOrThrow(ports, state);
  const targetBlock = getTargetBlockOrThrow(story, currentNode, blockId);
  const resolvedBlockState = resolveEffectiveBlockStateOrThrow(state, currentNode.id, targetBlock);
  if (!isInteractiveResolvedEffectiveBlockState(resolvedBlockState)) {
    throw new EngineRuntimeError(
      'runtime_block_not_actionable',
      `Runtime block "${blockId}" is non-interactive and cannot accept actions.`,
      {
        details: {
          actionType: resolveActionType(action),
          blockId,
          blockType: targetBlock.type,
          nodeId: currentNode.id,
          reason: 'non_interactive',
        },
      },
    );
  }

  const actionResult = await executeBlockActionOrThrow({
    action,
    blockId,
    blockSpec: resolvedBlockState.blockSpec,
    blockType: targetBlock.type,
    nodeId: currentNode.id,
    parsedConfig: resolvedBlockState.parsedConfig,
    parsedState: resolvedBlockState.parsedState,
    playerId: state.playerId,
    ports,
  });

  const nextState = writeScopedBlockState(
    state,
    resolvedBlockState.stateScope,
    blockId,
    actionResult.updatedBlockState,
  );
  const currentNodeView = projectCurrentNodeViewOrThrow(nextState, currentNode);

  return projectRuntimeFrame(
    nextState,
    projectRuntimeView(
      currentNodeView,
      deriveTraversableEdgesOrThrow(story, nextState, currentNode),
    ),
  );
};
