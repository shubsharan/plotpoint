import { describe, expect, it } from 'vitest';
import * as engine from '../index.js';
import { validStoryPackageFixture } from './fixtures/story-packages.js';

describe('@plotpoint/engine', () => {
  it('exports the stable story package boundary and compatibility helpers', () => {
    expect(engine.storyPackageSchema.safeParse(validStoryPackageFixture).success).toBe(true);
    expect(typeof engine.validateStoryPackageStructure).toBe('function');
    expect(typeof engine.validateStoryPackageCompatibility).toBe('function');
    expect(typeof engine.currentEngineMajor).toBe('number');
    expect(typeof engine.createEngine).toBe('function');
    expect(typeof engine.EngineRuntimeError).toBe('function');
  });

  it('supports runtime surface creation from the root entrypoint', async () => {
    const runtimeStoryPackage = JSON.parse(JSON.stringify(validStoryPackageFixture));
    runtimeStoryPackage.version.engineMajor = engine.currentEngineMajor;

    const runtimeEngine = engine.createEngine({
      storyPackageRepo: {
        getCurrentPublishedPackage: async () => ({
          storyPackage: runtimeStoryPackage,
          storyPackageVersionId: 'snapshot-v1',
        }),
        getPublishedPackage: async () => runtimeStoryPackage,
      },
    });

    const runtime = await runtimeEngine.startSession({
      gameId: 'game-1',
      playerId: 'player-1',
      roleId: 'detective',
      storyId: runtimeStoryPackage.metadata.storyId,
    });

    expect(runtime.state.currentNodeId).toBe('foyer');
    expect(runtime.view.currentNode.id).toBe('foyer');
    expect(runtime.state.storyId).toBe(runtimeStoryPackage.metadata.storyId);
    expect(runtime.state.storyPackageVersionId).toBe('snapshot-v1');
  });

  it('keeps exported session lifecycle commands mapped after runtime module moves', async () => {
    const runtimeStoryPackage = JSON.parse(JSON.stringify(validStoryPackageFixture));
    runtimeStoryPackage.version.engineMajor = engine.currentEngineMajor;

    const runtimeEngine = engine.createEngine({
      storyPackageRepo: {
        getCurrentPublishedPackage: async () => ({
          storyPackage: runtimeStoryPackage,
          storyPackageVersionId: 'snapshot-v1',
        }),
        getPublishedPackage: async () => runtimeStoryPackage,
      },
    });

    const started = await runtimeEngine.startSession({
      gameId: 'game-1',
      playerId: 'player-1',
      roleId: 'detective',
      storyId: runtimeStoryPackage.metadata.storyId,
    });
    const loaded = await runtimeEngine.loadSession({
      state: started.state,
    });
    const traversed = await runtimeEngine.traverse({
      edgeId: 'foyer-to-archive',
      state: loaded.state,
    });
    const submitted = await runtimeEngine.submitAction({
      action: {
        type: 'submit',
        value: '1847',
      },
      blockId: 'vault-code',
      state: traversed.state,
    });

    expect(started.view.currentNode.id).toBe('foyer');
    expect(loaded.view.currentNode.id).toBe('foyer');
    expect(traversed.view.currentNode.id).toBe('archive-door');
    expect(
      submitted.view.currentNode.blocks.find((candidate) => candidate.id === 'vault-code')?.state,
    ).toMatchObject({
      unlocked: true,
    });
  });

  it('does not export testing fixtures from the root entrypoint', () => {
    expect('createValidStoryPackageFixture' in engine).toBe(false);
    expect('invalidStoryPackageFixtures' in engine).toBe(false);
    expect('validStoryPackageFixture' in engine).toBe(false);
  });

  it('does not export mutable block registry internals from the root entrypoint', () => {
    expect('blockRegistry' in engine).toBe(false);
    expect('getBlockSpec' in engine).toBe(false);
    expect('hasBlockType' in engine).toBe(false);
  });
});
