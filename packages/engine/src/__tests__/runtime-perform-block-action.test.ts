import { describe, expect, it } from 'vitest';
import type {
  Clock,
  Engine,
  EngineRuntimeErrorCode,
  LocationReader,
  RuntimeSnapshot,
  RuntimeState,
  StoryPackage,
  StoryPackageRepo,
} from '../index.js';
import {
  EngineRuntimeError,
  createEngine,
  currentEngineMajor,
  getBlockDefinition,
} from '../index.js';
import { createValidStoryPackageFixture } from './fixtures/story-packages.js';

type StoryPackageRepoReaders = {
  getCurrentPublishedPackage: (storyId: string) => Promise<{
    storyPackage: StoryPackage;
    storyPackageVersionId: string;
  }>;
  getPublishedPackage: (storyId: string, storyPackageVersionId: string) => Promise<StoryPackage>;
};

type RuntimeTestContextOptions = {
  clock?: Clock | undefined;
  locationReader?: LocationReader | undefined;
  storyPackage?: StoryPackage | undefined;
};

const createStoryPackageRepo = (readers: StoryPackageRepoReaders): StoryPackageRepo => ({
  getCurrentPublishedPackage: async (storyId) => readers.getCurrentPublishedPackage(storyId),
  getPublishedPackage: async (storyId, storyPackageVersionId) =>
    readers.getPublishedPackage(storyId, storyPackageVersionId),
});

const createRuntimePackage = (): StoryPackage => {
  const storyPackage = createValidStoryPackageFixture();
  storyPackage.version.engineMajor = currentEngineMajor;
  return storyPackage;
};

const createRuntimeContext = (options?: RuntimeTestContextOptions): {
  engine: Engine;
  storyId: string;
  storyPackageVersionId: string;
} => {
  const storyPackage = options?.storyPackage ?? createRuntimePackage();
  const storyPackageVersionId = 'snapshot-v1';

  return {
    engine: createEngine({
      clock: options?.clock,
      locationReader: options?.locationReader,
      storyPackageRepo: createStoryPackageRepo({
        getCurrentPublishedPackage: async (storyId) => {
          if (storyId !== storyPackage.metadata.storyId) {
            throw new Error(`Unexpected story id "${storyId}".`);
          }

          return {
            storyPackage,
            storyPackageVersionId,
          };
        },
        getPublishedPackage: async (storyId, requestedStoryPackageVersionId) => {
          if (storyId !== storyPackage.metadata.storyId) {
            throw new Error(`Unexpected story id "${storyId}".`);
          }

          if (requestedStoryPackageVersionId !== storyPackageVersionId) {
            throw new Error(`Unexpected story package version id "${requestedStoryPackageVersionId}".`);
          }

          return storyPackage;
        },
      }),
    }),
    storyId: storyPackage.metadata.storyId,
    storyPackageVersionId,
  };
};

const startRuntime = async (
  engine: Engine,
  storyId: string,
): Promise<RuntimeSnapshot> =>
  engine.startGame({
    gameId: 'game-1',
    playerId: 'player-1',
    roleId: 'detective',
    storyId,
  });

const toRuntimeState = (snapshot: RuntimeSnapshot): RuntimeState => {
  const { traversableEdges: _traversableEdges, ...state } = snapshot;
  return state;
};

const toRuntimeStateAtNode = (snapshot: RuntimeSnapshot, nodeId: string): RuntimeState => ({
  ...toRuntimeState(snapshot),
  currentNodeId: nodeId,
});

const expectRuntimeError = async (
  promise: Promise<unknown>,
  code: EngineRuntimeErrorCode,
): Promise<EngineRuntimeError> => {
  const error = await promise.catch((resolvedError) => resolvedError as unknown);

  expect(error).toBeInstanceOf(EngineRuntimeError);
  const runtimeError = error as EngineRuntimeError;
  expect(runtimeError.code).toBe(code);
  return runtimeError;
};

describe('@plotpoint/engine performBlockAction execution contracts', () => {
  it('auto-materializes text blocks as unlocked on node entry', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);

    expect(started.playerState.blockStates.briefing).toEqual({
      unlocked: true,
    });
  });

  it('rejects performBlockAction for text blocks as non-actionable', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);

    const error = await expectRuntimeError(
      engine.performBlockAction({
        action: {
          type: 'submit',
        },
        blockId: 'briefing',
        state: toRuntimeState(started),
      }),
      'runtime_block_not_actionable',
    );

    expect(error.details).toMatchObject({
      blockId: 'briefing',
      blockType: 'text',
      reason: 'non_interactive',
    });
  });

  it('lazy-initializes target block state and preserves raw submit payloads in audit history', async () => {
    const clock: Clock = {
      now: () => new Date('2026-03-31T18:00:00.000Z'),
    };
    const { engine, storyId } = createRuntimeContext({
      clock,
    });
    const started = await startRuntime(engine, storyId);

    const submitted = await engine.performBlockAction({
      action: {
        type: 'submit',
        value: '1847',
      },
      blockId: 'vault-code',
      state: toRuntimeStateAtNode(started, 'archive-door'),
    });

    expect(submitted.playerState.blockStates['vault-code']).toMatchObject({
      unlocked: true,
      attempts: [
        {
          isCorrect: true,
          submitted: {
            type: 'submit',
            value: '1847',
          },
          submittedAt: '2026-03-31T18:00:00.000Z',
        },
      ],
    });
  });

  it('applies copy-on-write only for the targeted state bucket and key', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);
    const preservedSharedState = { marker: 'shared' };
    const preservedPlayerState = { marker: 'player' };

    const state: RuntimeState = {
      ...toRuntimeStateAtNode(started, 'archive-door'),
      playerState: {
        blockStates: {
          ...toRuntimeState(started).playerState.blockStates,
          preservedPlayerState,
        },
      },
      sharedState: {
        blockStates: {
          preservedSharedState,
        },
      },
    };

    const submitted = await engine.performBlockAction({
      action: {
        type: 'submit',
        value: '1847',
      },
      blockId: 'vault-code',
      state,
    });

    expect(submitted.playerState.blockStates).not.toBe(state.playerState.blockStates);
    expect(submitted.sharedState.blockStates).toEqual(state.sharedState.blockStates);
    expect(submitted.playerState.blockStates.preservedPlayerState).toBe(preservedPlayerState);
    expect(submitted.sharedState.blockStates.preservedSharedState).toBe(preservedSharedState);
    expect(submitted.playerState.blockStates['vault-code']).toBeDefined();
  });

  it('rejects invalid action payloads with typed runtime_block_action_invalid', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);

    const error = await expectRuntimeError(
      engine.performBlockAction({
        action: {
          type: 'submit',
        },
        blockId: 'vault-code',
        state: toRuntimeStateAtNode(started, 'archive-door'),
      }),
      'runtime_block_action_invalid',
    );

    expect(error.details).toMatchObject({
      actionType: 'submit',
      blockId: 'vault-code',
      blockType: 'code',
    });
  });

  it('rejects already-unlocked blocks before action payload validation', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);
    const unlocked = await engine.performBlockAction({
      action: {
        type: 'submit',
        value: '1847',
      },
      blockId: 'vault-code',
      state: toRuntimeStateAtNode(started, 'archive-door'),
    });

    await expectRuntimeError(
      engine.performBlockAction({
        action: {
          type: 'submit',
        },
        blockId: 'vault-code',
        state: toRuntimeState(unlocked),
      }),
      'runtime_block_already_unlocked',
    );
  });

  it('rejects invalid persisted block state before reducer execution', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);

    const invalidState: RuntimeState = {
      ...toRuntimeStateAtNode(started, 'archive-door'),
      playerState: {
        blockStates: {
          ...toRuntimeState(started).playerState.blockStates,
          'vault-code': {
            unlocked: 'yes',
          },
        },
      },
    };

    await expectRuntimeError(
      engine.performBlockAction({
        action: {
          type: 'submit',
          value: '1847',
        },
        blockId: 'vault-code',
        state: invalidState,
      }),
      'runtime_block_state_invalid',
    );
  });

  it('enforces current-node-only block targeting', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);

    await expectRuntimeError(
      engine.performBlockAction({
        action: {
          type: 'submit',
          value: '1847',
        },
        blockId: 'vault-code',
        state: toRuntimeState(started),
      }),
      'runtime_block_not_found',
    );
  });

  it('locks single-choice blocks after the first valid submission', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);
    const firstSubmit = await engine.performBlockAction({
      action: {
        optionId: 'curator',
        type: 'submit',
      },
      blockId: 'suspect-theory',
      state: toRuntimeStateAtNode(started, 'archive-door'),
    });

    expect(firstSubmit.playerState.blockStates['suspect-theory']).toMatchObject({
      selectedOptionId: 'curator',
      unlocked: false,
    });

    await expectRuntimeError(
      engine.performBlockAction({
        action: {
          optionId: 'archivist',
          type: 'submit',
        },
        blockId: 'suspect-theory',
        state: toRuntimeState(firstSubmit),
      }),
      'runtime_block_not_actionable',
    );
  });

  it('normalizes multi-choice selections before comparison and persistence', async () => {
    const storyPackage = createRuntimePackage();
    const archiveNode = storyPackage.graph.nodes.find((node) => node.id === 'archive-door');
    if (!archiveNode) {
      throw new Error('Expected archive-door node in runtime fixture.');
    }

    archiveNode.blocks.push({
      config: {
        correctOptionIds: ['archivist', 'curator'],
        options: [
          {
            id: 'curator',
            label: 'Curator',
          },
          {
            id: 'archivist',
            label: 'Archivist',
          },
          {
            id: 'docent',
            label: 'Docent',
          },
        ],
        prompt: 'Who handled the key transfer?',
      },
      id: 'team-theory',
      type: 'multi-choice',
    });

    const { engine, storyId } = createRuntimeContext({
      storyPackage,
    });
    const started = await startRuntime(engine, storyId);
    const submitted = await engine.performBlockAction({
      action: {
        optionIds: ['curator', 'archivist', 'curator'],
        type: 'submit',
      },
      blockId: 'team-theory',
      state: toRuntimeStateAtNode(started, 'archive-door'),
    });

    expect(submitted.playerState.blockStates['team-theory']).toMatchObject({
      selectedOptionIds: ['archivist', 'curator'],
      unlocked: true,
      attempts: [
        {
          submitted: {
            optionIds: ['curator', 'archivist', 'curator'],
            type: 'submit',
          },
          normalizedOptionIds: ['archivist', 'curator'],
        },
      ],
    });
  });

  it('declares runtime stateType and requiredContext metadata per block type', () => {
    expect(getBlockDefinition('code').policy).toEqual({
      requiredContext: ['nowIso'],
      stateType: 'playerState',
    });
    expect(getBlockDefinition('location').policy).toEqual({
      requiredContext: ['nowIso', 'playerLocation'],
      stateType: 'playerState',
    });
    expect(getBlockDefinition('text').policy).toEqual({
      requiredContext: [],
      stateType: 'playerState',
    });
  });

  it('accepts performBlockAction for prototype-chain key ids by using own-key block-state lookups', async () => {
    const storyPackage = createRuntimePackage();
    const archiveNode = storyPackage.graph.nodes.find((node) => node.id === 'archive-door');
    if (!archiveNode) {
      throw new Error('Expected archive-door node in runtime fixture.');
    }

    archiveNode.blocks.push({
      config: {
        expected: '1847',
        mode: 'passcode',
      },
      id: 'toString',
      type: 'code',
    });

    const { engine, storyId } = createRuntimeContext({
      storyPackage,
    });
    const started = await startRuntime(engine, storyId);
    const submitted = await engine.performBlockAction({
      action: {
        type: 'submit',
        value: '1847',
      },
      blockId: 'toString',
      state: toRuntimeStateAtNode(started, 'archive-door'),
    });

    expect(Object.hasOwn(submitted.playerState.blockStates, 'toString')).toBe(true);
    expect(submitted.playerState.blockStates.toString).toMatchObject({
      unlocked: true,
    });
  });

  it('materializes non-interactive entry block states for __proto__ ids as own keys', async () => {
    const storyPackage = createRuntimePackage();
    const foyerNode = storyPackage.graph.nodes.find((node) => node.id === 'foyer');
    if (!foyerNode) {
      throw new Error('Expected foyer node in runtime fixture.');
    }

    const briefingBlock = foyerNode.blocks.find((block) => block.id === 'briefing');
    if (!briefingBlock || briefingBlock.type !== 'text') {
      throw new Error('Expected briefing text block in foyer node.');
    }

    foyerNode.blocks.push({
      config: briefingBlock.config,
      id: '__proto__',
      type: 'text',
    });

    const { engine, storyId } = createRuntimeContext({
      storyPackage,
    });
    const started = await startRuntime(engine, storyId);

    expect(Object.hasOwn(started.playerState.blockStates, '__proto__')).toBe(true);
    expect(started.playerState.blockStates.__proto__).toEqual({
      unlocked: true,
    });
  });

  it('maps clock.now failures to typed runtime_block_execution_failed errors', async () => {
    const { engine, storyId } = createRuntimeContext({
      clock: {
        now: () => {
          throw new Error('clock unavailable');
        },
      },
    });
    const started = await startRuntime(engine, storyId);

    const error = await expectRuntimeError(
      engine.performBlockAction({
        action: {
          type: 'submit',
          value: '1847',
        },
        blockId: 'vault-code',
        state: toRuntimeStateAtNode(started, 'archive-door'),
      }),
      'runtime_block_execution_failed',
    );

    expect(error.details).toMatchObject({
      actionType: 'submit',
      blockId: 'vault-code',
      blockType: 'code',
      nodeId: 'archive-door',
      playerId: 'player-1',
    });
  });

  it('maps invalid ISO clock values to typed runtime_block_execution_failed errors', async () => {
    const { engine, storyId } = createRuntimeContext({
      clock: {
        now: () => new Date('invalid-date'),
      },
    });
    const started = await startRuntime(engine, storyId);

    const error = await expectRuntimeError(
      engine.performBlockAction({
        action: {
          type: 'submit',
          value: '1847',
        },
        blockId: 'vault-code',
        state: toRuntimeStateAtNode(started, 'archive-door'),
      }),
      'runtime_block_execution_failed',
    );

    expect(error.details).toMatchObject({
      actionType: 'submit',
      blockId: 'vault-code',
      blockType: 'code',
      nodeId: 'archive-door',
      playerId: 'player-1',
    });
  });

  it('evaluates coordinate location checks for both miss and unlock outcomes', async () => {
    const missContext = createRuntimeContext({
      locationReader: {
        getCurrent: async () => ({
          lat: 0,
          lng: 0,
        }),
      },
    });
    const missStarted = await startRuntime(missContext.engine, missContext.storyId);
    const missResult = await missContext.engine.performBlockAction({
      action: {
        type: 'submit',
      },
      blockId: 'find-ledger',
      state: toRuntimeStateAtNode(missStarted, 'vault'),
    });

    expect(missResult.playerState.blockStates['find-ledger']).toMatchObject({
      checksCount: 1,
      unlocked: false,
      checks: [
        {
          withinRadius: false,
        },
      ],
    });

    const unlockContext = createRuntimeContext({
      locationReader: {
        getCurrent: async () => ({
          lat: 37.7749,
          lng: -122.4194,
        }),
      },
    });
    const unlockStarted = await startRuntime(unlockContext.engine, unlockContext.storyId);
    const unlockResult = await unlockContext.engine.performBlockAction({
      action: {
        type: 'submit',
      },
      blockId: 'find-ledger',
      state: toRuntimeStateAtNode(unlockStarted, 'vault'),
    });

    expect(unlockResult.playerState.blockStates['find-ledger']).toMatchObject({
      checksCount: 1,
      unlocked: true,
      checks: [
        {
          withinRadius: true,
        },
      ],
    });
  });

  it('distinguishes null-location misses from location reader failures', async () => {
    const nullLocationReader: LocationReader = {
      getCurrent: async () => null,
    };
    const throwLocationReader: LocationReader = {
      getCurrent: async () => {
        throw new Error('location unavailable');
      },
    };

    const nullLocationContext = createRuntimeContext({
      locationReader: nullLocationReader,
    });
    const startedWithNullLocation = await startRuntime(
      nullLocationContext.engine,
      nullLocationContext.storyId,
    );
    const nullLocationSubmit = await nullLocationContext.engine.performBlockAction({
      action: {
        type: 'submit',
      },
      blockId: 'find-ledger',
      state: toRuntimeStateAtNode(startedWithNullLocation, 'vault'),
    });

    expect(nullLocationSubmit.playerState.blockStates['find-ledger']).toMatchObject({
      checksCount: 1,
      unlocked: false,
      checks: [
        {
          playerLocation: null,
          withinRadius: false,
        },
      ],
    });

    const throwLocationContext = createRuntimeContext({
      locationReader: throwLocationReader,
    });
    const startedWithThrowingLocation = await startRuntime(
      throwLocationContext.engine,
      throwLocationContext.storyId,
    );
    await expectRuntimeError(
      throwLocationContext.engine.performBlockAction({
        action: {
          type: 'submit',
        },
        blockId: 'find-ledger',
        state: toRuntimeStateAtNode(startedWithThrowingLocation, 'vault'),
      }),
      'runtime_block_location_read_failed',
    );
  });

  it('fails with typed runtime_block_unsupported_location_target for place targets', async () => {
    const storyPackage = createRuntimePackage();
    const vaultNode = storyPackage.graph.nodes.find((node) => node.id === 'vault');
    const locationBlock = vaultNode?.blocks.find((block) => block.id === 'find-ledger');
    if (!locationBlock || locationBlock.type !== 'location') {
      throw new Error('Expected find-ledger location block in vault node.');
    }

    locationBlock.config = {
      ...locationBlock.config,
      target: {
        kind: 'place',
        placeId: 'place-001',
      },
    };

    const { engine, storyId } = createRuntimeContext({
      storyPackage,
    });
    const started = await startRuntime(engine, storyId);

    await expectRuntimeError(
      engine.performBlockAction({
        action: {
          type: 'submit',
        },
        blockId: 'find-ledger',
        state: toRuntimeStateAtNode(started, 'vault'),
      }),
      'runtime_block_unsupported_location_target',
    );
  });

  it('replays deterministic snapshots for the same initial state and action sequence', async () => {
    const clock: Clock = {
      now: () => new Date('2026-03-31T18:00:00.000Z'),
    };
    const { engine, storyId } = createRuntimeContext({
      clock,
    });
    const started = await startRuntime(engine, storyId);

    const runSequence = async (): Promise<RuntimeSnapshot> => {
      const first = await engine.performBlockAction({
        action: {
          type: 'submit',
          value: '0000',
        },
        blockId: 'vault-code',
        state: toRuntimeStateAtNode(started, 'archive-door'),
      });

      return engine.performBlockAction({
        action: {
          type: 'submit',
          value: '1847',
        },
        blockId: 'vault-code',
        state: toRuntimeState(first),
      });
    };

    const firstRun = await runSequence();
    const secondRun = await runSequence();

    expect(firstRun).toEqual(secondRun);
  });
});
