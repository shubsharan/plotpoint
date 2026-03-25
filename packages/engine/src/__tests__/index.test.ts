import { describe, expect, it } from 'vitest';
import * as engine from '../index.js';
import { validStoryBundleFixture } from './fixtures/story-bundles.js';

describe('@plotpoint/engine', () => {
  it('exports the story bundle boundary and compatibility registries', () => {
    expect(engine.blockRegistry.location).toBeDefined();
    expect(engine.blockRegistry.code).toBeDefined();
    expect(engine.blockRegistry['single-choice']).toBeDefined();
    expect(engine.blockRegistry['multi-choice']).toBeDefined();
    expect(engine.blockRegistry.text).toBeDefined();
    expect(engine.conditionRegistry['field-equals']).toBe(true);
    expect(engine.storyBundleSchema.safeParse(validStoryBundleFixture).success).toBe(true);
    expect(engine.getBlockDefinition('code').scope).toBe('user');
    expect(typeof engine.validateStoryBundleStructure).toBe('function');
    expect(typeof engine.validateStoryBundleCompatibility).toBe('function');
  });

  it('does not export testing fixtures from the root entrypoint', () => {
    expect('createValidStoryBundleFixture' in engine).toBe(false);
    expect('invalidStoryBundleFixtures' in engine).toBe(false);
    expect('validStoryBundleFixture' in engine).toBe(false);
  });
});
