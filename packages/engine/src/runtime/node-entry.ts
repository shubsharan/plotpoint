import type { z } from 'zod';
import { getBlockDefinition, hasBlockType, type KnownBlockType } from '../blocks/index.js';
import type { StoryPackage } from '../story-packages/schema.js';
import { readOwnBlockState, writeBlockStateByType } from './block-state-bucket.js';
import { EngineRuntimeError } from './errors.js';
import type { RuntimeState } from './types.js';
import { formatIssuePath } from './snapshot.js';

type StoryNode = StoryPackage['graph']['nodes'][number];

const toValidationDetails = (issue: z.core.$ZodIssue): Record<string, unknown> => ({
  validationCode: issue.code,
  validationPath: formatIssuePath(issue.path),
});

const getDefinitionForType = <TBlockType extends KnownBlockType>(blockType: TBlockType) =>
  getBlockDefinition(blockType);

export const materializeNodeEntryStateOrThrow = (
  state: RuntimeState,
  node: StoryNode,
): RuntimeState => {
  let nextState = state;

  for (const block of node.blocks) {
    if (!hasBlockType(block.type)) {
      throw new EngineRuntimeError(
        'runtime_block_type_unregistered',
        `Runtime block type "${block.type}" is not registered in the block registry.`,
        {
          details: {
            blockId: block.id,
            blockType: block.type,
            nodeId: node.id,
          },
        },
      );
    }

    const definition = getDefinitionForType(block.type);
    const { behavior, policy } = definition;
    if (behavior.interactive) {
      continue;
    }

    const scopedBucket = nextState[policy.stateType].blockStates;

    const parsedConfig = behavior.configSchema.safeParse(block.config);
    if (!parsedConfig.success) {
      const firstIssue = parsedConfig.error.issues[0];
      throw new EngineRuntimeError(
        'runtime_block_config_invalid',
        `Runtime block "${block.id}" has invalid config for type "${block.type}".`,
        {
          details: {
            blockId: block.id,
            blockType: block.type,
            nodeId: node.id,
            ...(firstIssue === undefined ? {} : toValidationDetails(firstIssue)),
          },
        },
      );
    }

    const existingState = readOwnBlockState(scopedBucket, block.id);
    if (existingState.found) {
      const parsedState = behavior.stateSchema.safeParse(existingState.value);
      if (!parsedState.success) {
        const firstIssue = parsedState.error.issues[0];
        throw new EngineRuntimeError(
          'runtime_block_state_invalid',
          `Runtime block "${block.id}" has invalid persisted state.`,
          {
            details: {
              blockId: block.id,
              blockType: block.type,
              nodeId: node.id,
              ...(firstIssue === undefined ? {} : toValidationDetails(firstIssue)),
            },
          },
        );
      }

      continue;
    }

    const initializedState = behavior.initialState(parsedConfig.data);
    const parsedInitializedState = behavior.stateSchema.safeParse(initializedState);
    if (!parsedInitializedState.success) {
      const firstIssue = parsedInitializedState.error.issues[0];
      throw new EngineRuntimeError(
        'runtime_block_state_invalid',
        `Runtime block "${block.id}" produced invalid initial state.`,
        {
          details: {
            blockId: block.id,
            blockType: block.type,
            nodeId: node.id,
            ...(firstIssue === undefined ? {} : toValidationDetails(firstIssue)),
          },
        },
      );
    }

    nextState = writeBlockStateByType(
      nextState,
      policy.stateType,
      block.id,
      parsedInitializedState.data,
    );
  }

  return nextState;
};
