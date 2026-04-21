import { describe, expectTypeOf, it } from 'vitest';
import type { StoryPackageBlock, StoryPackageRepo } from '../index.js';
import { getBlockSpec } from '../blocks/registry.js';
import { executeBlockActionOrThrow } from '../runtime/actions/execute-block-action.js';
import { resolveEffectiveBlockStateOrThrow } from '../runtime/context/block-resolution.js';

const storyPackageRepo: StoryPackageRepo = {
  getCurrentPublishedPackage: async () => {
    throw new Error('not used');
  },
  getPublishedPackage: async () => {
    throw new Error('not used');
  },
};

describe('@plotpoint/engine runtime type surface', () => {
  it('preserves concrete block spec types across registry lookup and runtime helpers', async () => {
    const blockSpec = getBlockSpec('single-choice');

    const block = {
      config: {
        correctOptionId: 'suspect-a',
        options: [
          {
            id: 'suspect-a',
            label: 'Suspect A',
          },
          {
            id: 'suspect-b',
            label: 'Suspect B',
          },
        ],
        prompt: 'Pick a suspect',
      },
      id: 'suspect-picker',
      type: 'single-choice',
    } as const satisfies StoryPackageBlock;

    const resolved = resolveEffectiveBlockStateOrThrow(
      {
        currentNodeId: 'foyer',
        playerId: 'player-1',
        playerState: {
          blockStates: {},
        },
        roleId: 'detective',
        sessionId: 'session-1',
        sharedState: {
          blockStates: {},
        },
        storyId: 'story-1',
        storyPackageVersionId: 'version-1',
      },
      'foyer',
      block,
    );

    expectTypeOf(resolved.parsedConfig.correctOptionId).toEqualTypeOf<string>();
    expectTypeOf(resolved.parsedState.selectedOptionId).toEqualTypeOf<string | null>();
    expectTypeOf(resolved.currentNodeBlock.config).toEqualTypeOf<StoryPackageBlock['config']>();
    expectTypeOf(resolved.currentNodeBlock.state.selectedOptionId).toEqualTypeOf<string | null>();

    const actionResult = await executeBlockActionOrThrow({
      action: {
        optionId: 'suspect-a',
        type: 'submit',
      },
      blockId: block.id,
      blockSpec,
      blockType: block.type,
      nodeId: 'foyer',
      parsedConfig: resolved.parsedConfig,
      parsedState: resolved.parsedState,
      playerId: 'player-1',
      ports: {
        storyPackageRepo,
      },
    });

    expectTypeOf(actionResult.updatedBlockState.selectedOptionId).toEqualTypeOf<string | null>();
  });
});
