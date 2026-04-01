import type { z } from 'zod';
import { getBlockDefinition, hasBlockType, type KnownBlockType } from '../blocks/index.js';
import { resolveRuntimeStateScopeKey } from './block-state-bucket.js';
import { EngineRuntimeError } from './errors.js';
import {
  assertRoleExistsOrThrow,
  createRuntimeSnapshot,
  formatIssuePath,
  getNodeOrThrow,
  loadStoryOrThrow,
  mapAvailableEdges,
  parseRuntimeInputOrThrow,
} from './snapshot.js';
import { startGameInputSchema } from './schema.js';
import type { EnginePorts, RuntimeSnapshot, RuntimeState, StartGameInput } from './types.js';

const toValidationDetails = (issue: z.core.$ZodIssue): Record<string, unknown> => ({
  validationCode: issue.code,
  validationPath: formatIssuePath(issue.path),
});

const getDefinitionForType = <TBlockType extends KnownBlockType>(blockType: TBlockType) =>
  getBlockDefinition(blockType);

const materializeNodeEntryStateOrThrow = (
  state: RuntimeState,
  node: ReturnType<typeof getNodeOrThrow>,
): void => {
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
    if (definition.interactive) {
      continue;
    }

    const scopeKey = resolveRuntimeStateScopeKey(definition.scope);
    const scopedBucket = state[scopeKey].blockStates;

    const parsedConfig = definition.configSchema.safeParse(block.config);
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

    const existingState = scopedBucket[block.id];
    if (existingState !== undefined) {
      const parsedState = definition.stateSchema.safeParse(existingState);
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

    const initializedState = definition.initialState(parsedConfig.data);
    const parsedInitializedState = definition.stateSchema.safeParse(initializedState);
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

    scopedBucket[block.id] = parsedInitializedState.data;
  }
};

export const startGame = async (
  ports: EnginePorts,
  input: StartGameInput,
): Promise<RuntimeSnapshot> => {
  const parsedInput = parseRuntimeInputOrThrow(startGameInputSchema, input);
  const { storyPackage, storyPackageVersionId } = await loadStoryOrThrow(
    ports,
    parsedInput.storyId,
  );

  assertRoleExistsOrThrow(storyPackage, parsedInput.roleId);

  const entryNode = getNodeOrThrow(storyPackage, storyPackage.graph.entryNodeId);
  const state: RuntimeState = {
    currentNodeId: entryNode.id,
    gameId: parsedInput.gameId,
    playerId: parsedInput.playerId,
    playerState: {
      blockStates: {},
    },
    roleId: parsedInput.roleId,
    sharedState: {
      blockStates: {},
    },
    storyId: parsedInput.storyId,
    storyPackageVersionId,
  };
  materializeNodeEntryStateOrThrow(state, entryNode);

  return createRuntimeSnapshot(state, mapAvailableEdges(entryNode));
};
