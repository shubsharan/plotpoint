import { getBlockSpec, hasBlockType } from '../../blocks/registry.js';
import type { BlockAction, BlockConfig, BlockSpec, BlockState } from '../../blocks/contracts.js';
import { executeBlockActionOrThrow } from '../actions/execute-block-action.js';
import {
  getTargetBlockOrThrow,
  loadSessionStoryContextOrThrow,
  parseSessionCommandInputOrThrow,
} from '../context/story-context.js';
import { resolveEffectiveBlockStateOrThrow } from '../context/block-resolution.js';
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

type RuntimeInteractiveBlockSpec = Extract<
  BlockSpec<BlockConfig, BlockState, BlockAction>,
  { interactive: true }
>;

export const submitAction = async (
  ports: EnginePorts,
  input: SubmitActionInput,
): Promise<RuntimeFrame> => {
  const { action, state, blockId } = parseSessionCommandInputOrThrow(submitActionInputSchema, input);
  const { currentNode, story } = await loadSessionStoryContextOrThrow(ports, state);
  const targetBlock = getTargetBlockOrThrow(story, currentNode, blockId);

  if (!hasBlockType(targetBlock.type)) {
    throw new EngineRuntimeError(
      'runtime_block_type_unregistered',
      `Runtime block type "${targetBlock.type}" is not registered in the block registry.`,
      {
        details: {
          blockId,
          blockType: targetBlock.type,
          nodeId: currentNode.id,
        },
      },
    );
  }

  const resolvedBlockState = resolveEffectiveBlockStateOrThrow(state, currentNode.id, targetBlock);
  const blockSpec = getBlockSpec(targetBlock.type);
  if (!blockSpec.interactive) {
    throw new EngineRuntimeError(
      'runtime_block_not_actionable',
      `Runtime block "${blockId}" is non-interactive and cannot accept actions.`,
      {
        details: {
          actionType:
            typeof action === 'object' &&
            action !== null &&
            Object.hasOwn(action, 'type') &&
            typeof (action as { type: unknown }).type === 'string'
              ? (action as { type: string }).type
              : undefined,
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
    blockSpec: blockSpec as RuntimeInteractiveBlockSpec,
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
