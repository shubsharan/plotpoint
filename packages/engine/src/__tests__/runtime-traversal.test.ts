import { describe, expect, it } from 'vitest';
import { getBlockSpec } from '../blocks/registry.js';
import { EngineRuntimeError } from '../runtime/errors.js';
import {
  createTraversalFactCache,
  deriveTraversalFactOrThrow,
  evaluateConditionOrThrow,
} from '../runtime/traversal/condition-evaluator.js';
import type { StoryPackageCondition } from '../story-packages/schema.js';

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
    const projectorError = new Error('boom');
    const codeBlockSpec = getBlockSpec('code');
    const blockRuntime = {
      currentNodeBlock: {
        config: {
          expected: '1847',
          mode: 'passcode' as const,
        },
        id: 'vault-code',
        interactive: true,
        state: {
          attempts: [],
          unlocked: false,
        },
        type: 'code',
      },
      blockSpec: {
        ...codeBlockSpec,
        traversalFacts: {
          unlocked: {
            derive: () => {
              throw projectorError;
            },
            kind: 'boolean',
          },
        },
      },
      parsedConfig: {
        expected: '1847',
        mode: 'passcode' as const,
      },
      parsedState: {
        attempts: [],
        unlocked: false,
      },
    } as Parameters<typeof deriveTraversalFactOrThrow>[0];

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
    expect((thrownError as EngineRuntimeError).cause).toBe(projectorError);
  });

  it('maps unsupported fact operators to runtime_condition_evaluation_failed', () => {
    const condition = {
      type: 'fact',
      blockId: 'vault-code',
      fact: 'unlocked',
      operator: 'contains',
      value: true,
    } as unknown as StoryPackageCondition;

    let thrownError: unknown;

    try {
      evaluateConditionOrThrow(
        condition,
        {
          resolveFactOrThrow: () => ({
            kind: 'boolean',
            value: true,
          }),
        },
        {
          edgeId: 'archive-to-vault',
          nodeId: 'archive-door',
          path: ['graph', 'nodes', 1, 'edges', 0, 'condition'],
          storyId: 'story-123',
        },
      );
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeInstanceOf(EngineRuntimeError);
    expect((thrownError as EngineRuntimeError).code).toBe('runtime_condition_evaluation_failed');
    expect((thrownError as EngineRuntimeError).details).toMatchObject({
      blockId: 'vault-code',
      conditionPath: 'graph.nodes[1].edges[0].condition',
      edgeId: 'archive-to-vault',
      fact: 'unlocked',
      operator: 'contains',
      storyId: 'story-123',
    });
  });

  it('maps malformed condition child holes to runtime_condition_evaluation_failed', () => {
    const condition = {
      children: new Array(1),
      type: 'and',
    } as unknown as StoryPackageCondition;

    let thrownError: unknown;

    try {
      evaluateConditionOrThrow(
        condition,
        {
          resolveFactOrThrow: () => ({
            kind: 'boolean',
            value: true,
          }),
        },
        {
          edgeId: 'archive-to-vault',
          nodeId: 'archive-door',
          path: ['graph', 'nodes', 1, 'edges', 0, 'condition'],
          storyId: 'story-123',
        },
      );
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeInstanceOf(EngineRuntimeError);
    expect((thrownError as EngineRuntimeError).code).toBe('runtime_condition_evaluation_failed');
    expect((thrownError as EngineRuntimeError).details).toMatchObject({
      childIndex: 0,
      conditionPath: 'graph.nodes[1].edges[0].condition.children[0]',
      conditionType: 'and',
      edgeId: 'archive-to-vault',
      nodeId: 'archive-door',
      storyId: 'story-123',
    });
  });
});
