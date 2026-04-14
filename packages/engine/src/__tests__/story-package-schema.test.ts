import { describe, expect, it } from 'vitest';
import {
  storyPackageBlockSchema,
  storyPackageConditionSchema,
  storyPackageSchema,
} from '../index.js';
import {
  createValidStoryPackageFixture,
  invalidStoryPackageFixtures,
  validStoryPackageFixture,
} from './fixtures/story-packages.js';

describe('@plotpoint/engine story package schema', () => {
  it('parses a valid story package', () => {
    const parsed = storyPackageSchema.parse(validStoryPackageFixture);

    expect(parsed.metadata.storyId).toBe('story-the-stolen-ledger');
    expect(parsed.graph.nodes).toHaveLength(3);
    expect(parsed.graph.nodes[1]?.edges[0]?.condition).toMatchObject({
      type: 'fact',
      fact: 'unlocked',
    });
  });

  it('rejects malformed shapes deterministically', () => {
    const result = storyPackageSchema.safeParse(invalidStoryPackageFixtures.malformedShape);

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(
      result.error.issues.map((issue) => ({
        code: issue.code,
        path: issue.path,
      })),
    ).toEqual([
      {
        code: 'invalid_type',
        path: ['graph', 'nodes', 0, 'blocks', 0, 'config'],
      },
    ]);
  });

  it('rejects empty condition combinators', () => {
    const result = storyPackageSchema.safeParse(invalidStoryPackageFixtures.emptyConditionChildren);

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(
      result.error.issues.map((issue) => ({
        code: issue.code,
        path: issue.path,
      })),
    ).toEqual([
      {
        code: 'too_small',
        path: ['graph', 'nodes', 0, 'edges', 0, 'condition', 'children'],
      },
    ]);
  });

  it('keeps unknown block types as compatibility-layer concerns', () => {
    const storyPackage = createValidStoryPackageFixture();
    const firstNode = storyPackage.graph.nodes[0];

    if (!firstNode) {
      throw new Error('Expected valid fixture to include a first node.');
    }

    firstNode.blocks.push({
      id: 'mystery-device',
      type: 'mystery-device',
      config: {},
    });

    expect(storyPackageSchema.safeParse(storyPackage).success).toBe(true);
    expect(
      storyPackageBlockSchema.safeParse({
        id: 'mystery-device',
        type: 'mystery-device',
        config: {},
      }).success,
    ).toBe(true);
  });

  it('keeps unknown fact references as compatibility-layer concerns', () => {
    const storyPackage = createValidStoryPackageFixture();
    const edge = storyPackage.graph.nodes[1]?.edges[0];

    if (!edge?.condition || edge.condition.type !== 'fact') {
      throw new Error('Expected valid fixture to include a fact condition.');
    }

    edge.condition.fact = 'mystery-fact';

    expect(storyPackageSchema.safeParse(storyPackage).success).toBe(true);
    expect(
      storyPackageConditionSchema.safeParse({
        type: 'fact',
        blockId: 'vault-code',
        fact: 'mystery-fact',
      }).success,
    ).toBe(true);
  });
});
