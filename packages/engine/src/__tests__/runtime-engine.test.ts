import { describe, expect, it } from 'vitest';
import type {
  Engine,
  EngineRuntimeErrorCode,
  RuntimeSnapshot,
  StartGameInput,
  StoryPackage,
  StoryPackageRepo,
} from '../index.js';
import { EngineRuntimeError, createEngine, currentEngineMajor } from '../index.js';
import {
  createCompatibilityInvalidStoryPackageFixture,
  createStructurallyInvalidStoryPackageFixture,
  createValidStoryPackageFixture,
} from './fixtures/story-packages.js';

const createStoryPackageRepo = (
  reader: (storyId: string) => Promise<StoryPackage>,
): StoryPackageRepo => ({
  getPublishedPackage: async (storyId: string): Promise<StoryPackage> => reader(storyId),
});

const createRuntimeEngine = (storyPackage: StoryPackage) =>
  createEngine({
    storyPackageRepo: createStoryPackageRepo(async (storyId) => {
      if (storyId !== storyPackage.metadata.storyId) {
        throw new Error(`Unexpected story id "${storyId}".`);
      }

      return storyPackage;
    }),
  });

type RuntimeTestContext = {
  engine: Engine;
  storyId: string;
};

const createRuntimeContext = (): RuntimeTestContext => {
  const storyPackage = createValidStoryPackageFixture();
  storyPackage.version.engineMajor = currentEngineMajor;

  return {
    engine: createRuntimeEngine(storyPackage),
    storyId: storyPackage.metadata.storyId,
  };
};

const createStartInput = (
  storyId: string,
  overrides?: Partial<StartGameInput>,
): StartGameInput => ({
  gameId: 'game-1',
  playerId: 'player-1',
  roleId: 'detective',
  storyId,
  ...overrides,
});

const startRuntime = async (
  engine: Engine,
  storyId: string,
  overrides?: Partial<StartGameInput>,
): Promise<RuntimeSnapshot> => engine.startGame(createStartInput(storyId, overrides));

const withStaleAvailableEdges = (snapshot: RuntimeSnapshot): RuntimeSnapshot => ({
  ...snapshot,
  availableEdges: [
    {
      edgeId: 'stale-edge',
      label: 'Stale Edge',
      targetNodeId: 'stale-node',
    },
  ],
});

const expectRuntimeSnapshotShape = (snapshot: RuntimeSnapshot): void => {
  expect(snapshot).toMatchObject({
    currentNodeId: expect.any(String),
    gameId: expect.any(String),
    playerId: expect.any(String),
    playerState: {
      blockStates: expect.any(Object),
    },
    roleId: expect.any(String),
    sharedState: {
      blockStates: expect.any(Object),
    },
    storyId: expect.any(String),
  });
  expect(Array.isArray(snapshot.availableEdges)).toBe(true);
};

const expectRuntimeError = async (
  promise: Promise<unknown>,
  code: EngineRuntimeErrorCode,
): Promise<void> => {
  await expect(promise).rejects.toBeInstanceOf(EngineRuntimeError);
  await expect(promise).rejects.toMatchObject({ code });
};

describe('@plotpoint/engine runtime surface', () => {
  it('constructs createEngine with runtime entrypoints', () => {
    const { engine } = createRuntimeContext();

    expect(typeof engine.startGame).toBe('function');
    expect(typeof engine.loadRuntime).toBe('function');
    expect(typeof engine.submitAction).toBe('function');
  });

  it('returns the RuntimeSnapshot contract and preserves roleId across runtime transitions', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);
    const loaded = await engine.loadRuntime({
      snapshot: withStaleAvailableEdges(started),
    });
    const submitted = await engine.submitAction({
      action: {
        type: 'noop',
      },
      blockId: 'briefing',
      runtime: withStaleAvailableEdges(loaded),
    });

    for (const snapshot of [started, loaded, submitted]) {
      expectRuntimeSnapshotShape(snapshot);
      expect(snapshot.roleId).toBe('detective');
    }
  });

  it('recomputes availableEdges on loadRuntime and submitAction, ignoring caller-provided edges', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);
    const loaded = await engine.loadRuntime({
      snapshot: withStaleAvailableEdges(started),
    });
    const submitted = await engine.submitAction({
      action: {
        type: 'noop',
      },
      blockId: 'briefing',
      runtime: withStaleAvailableEdges(loaded),
    });

    expect(started.availableEdges).toEqual([
      {
        edgeId: 'foyer-to-archive',
        label: 'Head to the archive',
        targetNodeId: 'archive-door',
      },
    ]);
    expect(loaded.availableEdges).toEqual(started.availableEdges);
    expect(submitted.availableEdges).toEqual(started.availableEdges);
  });

  it('clones block-state maps when normalizing snapshots', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);

    const snapshotWithState: RuntimeSnapshot = {
      ...started,
      playerState: {
        blockStates: {
          briefing: {
            seen: true,
          },
        },
      },
      sharedState: {
        blockStates: {
          archive: {
            unlocked: false,
          },
        },
      },
    };

    const loaded = await engine.loadRuntime({ snapshot: snapshotWithState });

    expect(loaded).not.toBe(snapshotWithState);
    expect(loaded.playerState.blockStates).not.toBe(snapshotWithState.playerState.blockStates);
    expect(loaded.sharedState.blockStates).not.toBe(snapshotWithState.sharedState.blockStates);
  });

  const runtimeErrorCases: Array<{
    code: EngineRuntimeErrorCode;
    name: string;
    run: (context: RuntimeTestContext) => Promise<unknown>;
  }> = [
    {
      code: 'runtime_role_not_found',
      name: 'startup role is unknown',
      run: ({ engine, storyId }) => startRuntime(engine, storyId, { roleId: 'ghost-role' }),
    },
    {
      code: 'runtime_node_not_found',
      name: 'runtime node is unknown during load',
      run: async ({ engine, storyId }) => {
        const started = await startRuntime(engine, storyId);

        return engine.loadRuntime({
          snapshot: {
            ...started,
            currentNodeId: 'missing-node',
          },
        });
      },
    },
    {
      code: 'runtime_block_not_found',
      name: 'block target is unknown during submit',
      run: async ({ engine, storyId }) => {
        const started = await startRuntime(engine, storyId);

        return engine.submitAction({
          action: {
            type: 'noop',
          },
          blockId: 'missing-block',
          runtime: started,
        });
      },
    },
  ];

  for (const runtimeErrorCase of runtimeErrorCases) {
    it(`throws ${runtimeErrorCase.code} when ${runtimeErrorCase.name}`, async () => {
      const context = createRuntimeContext();

      await expectRuntimeError(runtimeErrorCase.run(context), runtimeErrorCase.code);
    });
  }

  it('throws runtime_story_id_mismatch when published package story id differs from runtime id', async () => {
    const storyPackage = createValidStoryPackageFixture();
    storyPackage.metadata.storyId = 'story-from-published-package';

    const engine = createEngine({
      storyPackageRepo: createStoryPackageRepo(async () => storyPackage),
    });

    await expectRuntimeError(
      engine.startGame(createStartInput('story-requested-by-runtime')),
      'runtime_story_id_mismatch',
    );
  });

  it('throws runtime_story_package_unavailable when the story package repo read fails', async () => {
    const engine = createEngine({
      storyPackageRepo: createStoryPackageRepo(async () => {
        throw new Error('storage offline');
      }),
    });

    const startPromise = engine.startGame(createStartInput('story-the-stolen-ledger'));

    await expectRuntimeError(startPromise, 'runtime_story_package_unavailable');
    await expect(startPromise).rejects.toThrow('storage offline');
  });

  it('throws runtime_story_package_invalid for structurally invalid published packages', async () => {
    const storyPackage = createStructurallyInvalidStoryPackageFixture();
    const engine = createRuntimeEngine(storyPackage);

    const startPromise = startRuntime(engine, storyPackage.metadata.storyId);

    await expectRuntimeError(startPromise, 'runtime_story_package_invalid');
    await expect(startPromise).rejects.toThrow('duplicate-node-id');
  });

  it('throws runtime_story_package_invalid for compatibility-invalid published packages', async () => {
    const storyPackage = createCompatibilityInvalidStoryPackageFixture();
    const engine = createRuntimeEngine(storyPackage);

    const startPromise = startRuntime(engine, storyPackage.metadata.storyId);

    await expectRuntimeError(startPromise, 'runtime_story_package_invalid');
    await expect(startPromise).rejects.toThrow(/unknown-block-type|incompatible-engine-major/);
  });

  it('throws runtime_snapshot_invalid for malformed startGame payloads', async () => {
    const { engine, storyId } = createRuntimeContext();
    const startPromise = startRuntime(engine, storyId, {
      gameId: '',
    });

    await expectRuntimeError(startPromise, 'runtime_snapshot_invalid');
    await expect(startPromise).rejects.toThrow('too_small at gameId');
  });

  it('throws runtime_snapshot_invalid for malformed loadRuntime snapshot payloads', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);

    const loadPromise = engine.loadRuntime({
      snapshot: {
        ...started,
        roleId: '',
      } as unknown as RuntimeSnapshot,
    });

    await expectRuntimeError(loadPromise, 'runtime_snapshot_invalid');
    await expect(loadPromise).rejects.toThrow('too_small at snapshot.roleId');
  });

  it('throws runtime_snapshot_invalid for malformed submitAction payloads', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);

    const submitPromise = engine.submitAction({
      action: {
        type: 'noop',
      },
      blockId: '',
      runtime: started,
    });

    await expectRuntimeError(submitPromise, 'runtime_snapshot_invalid');
    await expect(submitPromise).rejects.toThrow('too_small at blockId');
  });

  it('throws runtime_snapshot_invalid when submitAction action is missing', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);

    const submitPromise = engine.submitAction({
      blockId: 'briefing',
      runtime: started,
    } as unknown as Parameters<Engine['submitAction']>[0]);

    await expectRuntimeError(submitPromise, 'runtime_snapshot_invalid');
    await expect(submitPromise).rejects.toThrow(/at action/);
  });

  it('uses runtime_snapshot_invalid across all runtime entrypoints for malformed input', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);

    await Promise.all([
      expectRuntimeError(
        startRuntime(engine, storyId, {
          playerId: '',
        }),
        'runtime_snapshot_invalid',
      ),
      expectRuntimeError(
        engine.loadRuntime({
          snapshot: {
            ...started,
            roleId: '',
          } as unknown as RuntimeSnapshot,
        }),
        'runtime_snapshot_invalid',
      ),
      expectRuntimeError(
        engine.submitAction({
          action: {
            type: 'noop',
          },
          blockId: '',
          runtime: started,
        }),
        'runtime_snapshot_invalid',
      ),
    ]);
  });
});
