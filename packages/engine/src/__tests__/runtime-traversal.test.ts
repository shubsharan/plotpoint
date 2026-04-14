import { describe, expect, it } from 'vitest';
import { EngineRuntimeError } from '../runtime/errors.js';
import {
  createTraversalFactCache,
  deriveTraversalFactOrThrow,
} from '../runtime/traversal.js';

describe('@plotpoint/engine traversal internals', () => {
  it('keeps traversal fact cache entries distinct when block ids and fact names contain colons', () => {
    const cache = createTraversalFactCache();
    const firstFact = {
      kind: 'boolean' as const,
      value: true,
    };
    const secondFact = {
      kind: 'boolean' as const,
      value: false,
    };

    cache.set('archive:door', 'unlock', firstFact);
    cache.set('archive', 'door:unlock', secondFact);

    expect(cache.get('archive:door', 'unlock')).toEqual(firstFact);
    expect(cache.get('archive', 'door:unlock')).toEqual(secondFact);
  });

  it('maps traversal fact projector failures to runtime_condition_evaluation_failed', () => {
    const blockRuntime: Parameters<typeof deriveTraversalFactOrThrow>[0] = {
      currentNodeBlock: {
        config: {},
        id: 'vault-code',
        interactive: true,
        state: {},
        type: 'code',
      },
      definition: {
        behavior: {
          configSchema: {} as never,
          initialState: () => ({}),
          interactive: true,
          onAction: () => ({}),
          actionSchema: {} as never,
          stateSchema: {} as never,
        },
        policy: {
          requiredContext: [],
          stateType: 'playerState',
        },
        traversal: {
          facts: {
            unlocked: {
              derive: () => {
                throw new Error('boom');
              },
              kind: 'boolean',
            },
          },
        },
      },
      parsedConfig: {},
      parsedState: {},
    };

    let thrownError: unknown;

    try {
      deriveTraversalFactOrThrow(blockRuntime, 'unlocked', {
        edgeId: 'archive-to-vault',
        nodeId: 'archive-door',
        path: ['graph', 'nodes', 1, 'edges', 0, 'condition'],
        storyId: 'story-123',
      });
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeInstanceOf(EngineRuntimeError);
    expect((thrownError as EngineRuntimeError).code).toBe('runtime_condition_evaluation_failed');
    expect((thrownError as EngineRuntimeError).details).toMatchObject({
      blockId: 'vault-code',
      edgeId: 'archive-to-vault',
      fact: 'unlocked',
      nodeId: 'archive-door',
      storyId: 'story-123',
    });
  });
});
