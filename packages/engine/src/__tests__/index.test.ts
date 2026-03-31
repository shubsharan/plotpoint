import { describe, expect, it } from 'vitest';
import * as engine from '../index.js';
import { validStoryPackageFixture } from './fixtures/story-packages.js';

describe('@plotpoint/engine', () => {
  it('exports the story package boundary and compatibility registries', () => {
    expect(engine.blockRegistry.location).toBeDefined();
    expect(engine.blockRegistry.code).toBeDefined();
    expect(engine.blockRegistry['single-choice']).toBeDefined();
    expect(engine.blockRegistry['multi-choice']).toBeDefined();
    expect(engine.blockRegistry.text).toBeDefined();
    expect(engine.conditionRegistry['field-equals']).toBe(true);
    expect(engine.storyPackageSchema.safeParse(validStoryPackageFixture).success).toBe(true);
    expect(engine.getBlockDefinition('code').scope).toBe('user');
    expect(typeof engine.validateStoryPackageStructure).toBe('function');
    expect(typeof engine.validateStoryPackageCompatibility).toBe('function');
    expect(typeof engine.currentEngineMajor).toBe('number');
  });

  it('exports the StoryPackageRepo port type support surface', () => {
    expect('currentEngineMajor' in engine).toBe(true);
  });

  it('does not export testing fixtures from the root entrypoint', () => {
    expect('createValidStoryPackageFixture' in engine).toBe(false);
    expect('invalidStoryPackageFixtures' in engine).toBe(false);
    expect('validStoryPackageFixture' in engine).toBe(false);
  });
});
