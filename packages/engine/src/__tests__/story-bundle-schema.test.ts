import { describe, expect, it } from 'vitest';
import { storyBundleSchema } from '../index.js';
import { invalidStoryBundleFixtures, validStoryBundleFixture } from './fixtures/story-bundles.js';

describe('@plotpoint/engine story bundle schema', () => {
  it('parses a valid story bundle', () => {
    const parsed = storyBundleSchema.parse(validStoryBundleFixture);

    expect(parsed.metadata.storyId).toBe('story-the-stolen-ledger');
    expect(parsed.graph.nodes).toHaveLength(3);
    expect(parsed.graph.nodes[1]?.edges[0]?.condition).toMatchObject({
      type: 'check',
      condition: 'field-equals',
    });
  });

  it('rejects malformed shapes deterministically', () => {
    const result = storyBundleSchema.safeParse(invalidStoryBundleFixtures.malformedShape);

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
    const result = storyBundleSchema.safeParse(invalidStoryBundleFixtures.emptyConditionChildren);

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
});
