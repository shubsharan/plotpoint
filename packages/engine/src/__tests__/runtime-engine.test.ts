import { describe, expect, it } from 'vitest';
import type {
  Engine,
  EngineRuntimeErrorCode,
  RuntimeState,
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

type StoryPackageRepoReaders = {
  getCurrentPublishedPackage: (storyId: string) => Promise<{
    storyPackage: StoryPackage;
    storyPackageVersionId: string;
  }>;
  getPublishedPackage: (storyId: string, storyPackageVersionId: string) => Promise<StoryPackage>;
};

const createStoryPackageRepo = (readers: StoryPackageRepoReaders): StoryPackageRepo => ({
  getCurrentPublishedPackage: async (storyId: string) => readers.getCurrentPublishedPackage(storyId),
  getPublishedPackage: async (storyId: string, storyPackageVersionId: string) =>
    readers.getPublishedPackage(storyId, storyPackageVersionId),
});

const createRuntimeEngine = (
  storyPackage: StoryPackage,
  storyPackageVersionId = 'snapshot-v1',
) =>
  createEngine({
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
  });

type RuntimeTestContext = {
  engine: Engine;
  storyId: string;
  storyPackageVersionId: string;
};

const createRuntimeContext = (): RuntimeTestContext => {
  const storyPackage = createValidStoryPackageFixture();
  storyPackage.version.engineMajor = currentEngineMajor;

  return {
    engine: createRuntimeEngine(storyPackage, 'snapshot-v1'),
    storyId: storyPackage.metadata.storyId,
    storyPackageVersionId: 'snapshot-v1',
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

const toRuntimeState = (snapshot: RuntimeSnapshot): RuntimeState => {
  const {
    currentNode: _currentNode,
    traversableEdges: _traversableEdges,
    ...state
  } = snapshot;

  return state;
};

const toRuntimeStateAtNode = (snapshot: RuntimeSnapshot, nodeId: string): RuntimeState => ({
  ...toRuntimeState(snapshot),
  currentNodeId: nodeId,
});

const expectRuntimeSnapshotShape = (snapshot: RuntimeSnapshot): void => {
  expect(snapshot).toMatchObject({
    currentNodeId: expect.any(String),
    currentNode: {
      blocks: expect.any(Array),
      id: expect.any(String),
      title: expect.any(String),
    },
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
    storyPackageVersionId: expect.any(String),
  });
  expect(Array.isArray(snapshot.traversableEdges)).toBe(true);
};

const getCurrentNodeBlock = (snapshot: RuntimeSnapshot, blockId: string) => {
  const block = snapshot.currentNode.blocks.find((candidate) => candidate.id === blockId);
  expect(block).toBeDefined();
  return block!;
};

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

describe('@plotpoint/engine runtime surface', () => {
  it('constructs createEngine with runtime entrypoints', () => {
    const { engine } = createRuntimeContext();

    expect(typeof engine.startGame).toBe('function');
    expect(typeof engine.loadRuntime).toBe('function');
    expect(typeof engine.performBlockAction).toBe('function');
    expect(typeof engine.traverseEdge).toBe('function');
  });

  it('returns the RuntimeSnapshot contract and preserves roleId across runtime transitions', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);
    const loaded = await engine.loadRuntime({
      state: toRuntimeState(started),
    });
    const traversed = await engine.traverseEdge({
      edgeId: 'foyer-to-archive',
      state: toRuntimeState(loaded),
    });
    const submitted = await engine.performBlockAction({
      action: {
        type: 'submit',
        value: '1847',
      },
      blockId: 'vault-code',
      state: toRuntimeState(traversed),
    });

    for (const snapshot of [started, loaded, traversed, submitted]) {
      expectRuntimeSnapshotShape(snapshot);
      expect(snapshot.roleId).toBe('detective');
    }
  });

  it('pins runtime resume to the started story package version even after newer publishes', async () => {
    const storyPackageV1 = createValidStoryPackageFixture();
    storyPackageV1.version.engineMajor = currentEngineMajor;

    const storyPackageV2 = createValidStoryPackageFixture();
    storyPackageV2.metadata.storyId = storyPackageV1.metadata.storyId;
    storyPackageV2.version.engineMajor = currentEngineMajor;
    storyPackageV2.graph.entryNodeId = 'atrium';
    storyPackageV2.graph.nodes = [
      {
        id: 'atrium',
        title: 'Atrium',
        blocks: [
          {
            id: 'new-briefing',
            type: 'text',
            config: {
              document: {
                children: [
                  {
                    children: [
                      {
                        text: 'New opening',
                        type: 'text',
                      },
                    ],
                    type: 'paragraph',
                  },
                ],
                type: 'doc',
              },
            },
          },
        ],
        edges: [],
      },
    ];

    const storyPackagesByVersion = new Map<string, StoryPackage>([
      ['snapshot-v1', storyPackageV1],
      ['snapshot-v2', storyPackageV2],
    ]);
    let currentStoryPackageVersionId = 'snapshot-v1';

    const engine = createEngine({
      storyPackageRepo: createStoryPackageRepo({
        getCurrentPublishedPackage: async (storyId) => {
          if (storyId !== storyPackageV1.metadata.storyId) {
            throw new Error(`Unexpected story id "${storyId}".`);
          }

          const storyPackage = storyPackagesByVersion.get(currentStoryPackageVersionId);
          if (!storyPackage) {
            throw new Error(`Missing package version "${currentStoryPackageVersionId}".`);
          }

          return {
            storyPackage,
            storyPackageVersionId: currentStoryPackageVersionId,
          };
        },
        getPublishedPackage: async (storyId, storyPackageVersionId) => {
          if (storyId !== storyPackageV1.metadata.storyId) {
            throw new Error(`Unexpected story id "${storyId}".`);
          }

          const storyPackage = storyPackagesByVersion.get(storyPackageVersionId);
          if (!storyPackage) {
            throw new Error(`Missing package version "${storyPackageVersionId}".`);
          }

          return storyPackage;
        },
      }),
    });

    const started = await startRuntime(engine, storyPackageV1.metadata.storyId);
    currentStoryPackageVersionId = 'snapshot-v2';

    const loaded = await engine.loadRuntime({
      state: toRuntimeState(started),
    });

    expect(loaded.storyPackageVersionId).toBe('snapshot-v1');
    expect(loaded.currentNodeId).toBe('foyer');

    const submitted = await engine.performBlockAction({
      action: {
        type: 'submit',
        value: '1847',
      },
      blockId: 'vault-code',
      state: toRuntimeStateAtNode(loaded, 'archive-door'),
    });

    expect(submitted.storyPackageVersionId).toBe('snapshot-v1');
    expect(submitted.currentNodeId).toBe('archive-door');
  });

  it('rehydrates and submits from RuntimeState inputs without persisting derived fields', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);
    const loaded = await engine.loadRuntime({
      state: toRuntimeState(started),
    });
    const traversed = await engine.traverseEdge({
      edgeId: 'foyer-to-archive',
      state: toRuntimeState(loaded),
    });
    const submitted = await engine.performBlockAction({
      action: {
        type: 'submit',
        value: '1847',
      },
      blockId: 'vault-code',
      state: toRuntimeState(traversed),
    });

    expect(started.traversableEdges).toEqual([
      {
        edgeId: 'foyer-to-archive',
        label: 'Head to the archive',
        targetNodeId: 'archive-door',
      },
    ]);
    expect(loaded.traversableEdges).toEqual(started.traversableEdges);
    expect(traversed.traversableEdges).toEqual([]);
    expect(submitted.traversableEdges).toEqual([]);
  });

  it('traverses to the selected edge target and updates current node state', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);

    const traversed = await engine.traverseEdge({
      edgeId: 'foyer-to-archive',
      state: toRuntimeState(started),
    });

    expect(traversed.currentNodeId).toBe('archive-door');
    expect(traversed.traversableEdges).toEqual([]);
  });

  it('hydrates non-interactive current-node block state when traversing into a node', async () => {
    const storyPackage = createValidStoryPackageFixture();
    storyPackage.version.engineMajor = currentEngineMajor;
    const archiveNode = storyPackage.graph.nodes.find((node) => node.id === 'archive-door');
    if (!archiveNode) {
      throw new Error('Expected archive-door node in runtime fixture.');
    }

    archiveNode.blocks.unshift({
      id: 'archive-briefing',
      type: 'text',
      config: {
        document: {
          type: 'doc',
          children: [
            {
              type: 'paragraph',
              children: [
                {
                  type: 'text',
                  text: 'Archive entry note.',
                },
              ],
            },
          ],
        },
      },
    });

    const engine = createRuntimeEngine(storyPackage);
    const started = await startRuntime(engine, storyPackage.metadata.storyId);

    const traversed = await engine.traverseEdge({
      edgeId: 'foyer-to-archive',
      state: toRuntimeState(started),
    });

    expect(getCurrentNodeBlock(traversed, 'archive-briefing').state).toEqual({
      unlocked: true,
    });
    expect(Object.hasOwn(traversed.playerState.blockStates, 'archive-briefing')).toBe(false);
  });

  it('rehydrates the same hydrated current-node view from sparse runtime state', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);
    const traversed = await engine.traverseEdge({
      edgeId: 'foyer-to-archive',
      state: toRuntimeState(started),
    });

    const loaded = await engine.loadRuntime({
      state: toRuntimeStateAtNode(started, 'archive-door'),
    });

    expect(loaded.currentNode).toEqual(traversed.currentNode);
    expect(loaded.traversableEdges).toEqual(traversed.traversableEdges);
    expect(loaded.playerState.blockStates).toEqual(traversed.playerState.blockStates);
  });

  it('omits conditioned edges from traversableEdges until FEAT-0008 defines traversal semantics', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);
    const traversed = await engine.traverseEdge({
      edgeId: 'foyer-to-archive',
      state: toRuntimeState(started),
    });
    const submitted = await engine.performBlockAction({
      action: {
        type: 'submit',
        value: '1847',
      },
      blockId: 'vault-code',
      state: toRuntimeState(traversed),
    });

    expect(traversed.traversableEdges).toEqual([]);
    expect(submitted.traversableEdges).toEqual([]);
  });

  it('rejects conditioned authored edges as not traversable', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);
    const traversed = await engine.traverseEdge({
      edgeId: 'foyer-to-archive',
      state: toRuntimeState(started),
    });

    const error = await expectRuntimeError(
      engine.traverseEdge({
        edgeId: 'archive-to-vault',
        state: toRuntimeState(traversed),
      }),
      'runtime_edge_not_traversable',
    );

    expect(error.details).toMatchObject({
      edgeId: 'archive-to-vault',
      nodeId: 'archive-door',
      reason: 'conditioned_edge_deferred',
      storyId,
    });
  });

  it('accepts snapshot-shaped state inputs and strips derived fields before rehydration', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);
    const staleSnapshot: RuntimeSnapshot = {
      ...started,
      currentNode: {
        ...started.currentNode,
        title: 'Stale Node',
      },
      traversableEdges: [
        {
          edgeId: 'stale-edge',
          label: 'Stale Edge',
          targetNodeId: 'stale-node',
        },
      ],
    };

    const loaded = await engine.loadRuntime({
      state: staleSnapshot,
    });

    expect(loaded.traversableEdges).toEqual(started.traversableEdges);
    expect(loaded.currentNode).toEqual(started.currentNode);
  });

  it('clones block-state maps when normalizing runtime state into a snapshot', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);

    const stateWithBlockState: RuntimeState = {
      ...toRuntimeState(started),
      playerState: {
        blockStates: {
          briefing: {
            unlocked: true,
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

    const loaded = await engine.loadRuntime({ state: stateWithBlockState });

    expect(loaded).not.toBe(stateWithBlockState);
    expect(loaded.playerState.blockStates).not.toBe(stateWithBlockState.playerState.blockStates);
    expect(loaded.sharedState.blockStates).not.toBe(stateWithBlockState.sharedState.blockStates);
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
          state: {
            ...toRuntimeState(started),
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

        return engine.performBlockAction({
          action: {
            type: 'submit',
            value: '1847',
          },
          blockId: 'missing-block',
          state: toRuntimeState(started),
        });
      },
    },
    {
      code: 'runtime_edge_not_found',
      name: 'edge target is unknown during traversal',
      run: async ({ engine, storyId }) => {
        const started = await startRuntime(engine, storyId);

        return engine.traverseEdge({
          edgeId: 'missing-edge',
          state: toRuntimeState(started),
        });
      },
    },
    {
      code: 'runtime_edge_not_traversable',
      name: 'edge target is conditioned during traversal',
      run: async ({ engine, storyId }) => {
        const started = await startRuntime(engine, storyId);
        const traversed = await engine.traverseEdge({
          edgeId: 'foyer-to-archive',
          state: toRuntimeState(started),
        });

        return engine.traverseEdge({
          edgeId: 'archive-to-vault',
          state: toRuntimeState(traversed),
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
      storyPackageRepo: createStoryPackageRepo({
        getCurrentPublishedPackage: async () => ({
          storyPackage,
          storyPackageVersionId: 'snapshot-v1',
        }),
        getPublishedPackage: async () => storyPackage,
      }),
    });

    await expectRuntimeError(
      engine.startGame(createStartInput('story-requested-by-runtime')),
      'runtime_story_id_mismatch',
    );
  });

  it('throws runtime_story_package_unavailable when the story package repo read fails', async () => {
    const engine = createEngine({
      storyPackageRepo: createStoryPackageRepo({
        getCurrentPublishedPackage: async () => {
          throw new Error('storage offline');
        },
        getPublishedPackage: async () => {
          throw new Error('storage offline');
        },
      }),
    });

    const startPromise = engine.startGame(createStartInput('story-the-stolen-ledger'));

    await expectRuntimeError(startPromise, 'runtime_story_package_unavailable');
    await expect(startPromise).rejects.toThrow('storage offline');
  });

  it('throws runtime_story_package_version_unavailable when pinned version cannot be loaded', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);

    const loadPromise = engine.loadRuntime({
      state: {
        ...toRuntimeState(started),
        storyPackageVersionId: 'snapshot-missing',
      },
    });

    await expectRuntimeError(loadPromise, 'runtime_story_package_version_unavailable');
    await expect(loadPromise).rejects.toThrow('snapshot-missing');
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

  it('throws runtime_snapshot_invalid for malformed loadRuntime state payloads', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);

    const loadPromise = engine.loadRuntime({
      state: {
        ...toRuntimeState(started),
        roleId: '',
      } as unknown as RuntimeState,
    });

    await expectRuntimeError(loadPromise, 'runtime_snapshot_invalid');
    await expect(loadPromise).rejects.toThrow('too_small at state.roleId');
  });

  it('throws runtime_snapshot_invalid when pinned story package version is missing from loadRuntime state', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);

    const runtimeState = toRuntimeState(started) as Record<string, unknown>;
    delete runtimeState.storyPackageVersionId;

    const loadPromise = engine.loadRuntime({
      state: runtimeState as unknown as RuntimeState,
    });

    await expectRuntimeError(loadPromise, 'runtime_snapshot_invalid');
    await expect(loadPromise).rejects.toThrow('at state.storyPackageVersionId');
  });

  it('throws runtime_snapshot_invalid for malformed performBlockAction payloads', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);

    const submitPromise = engine.performBlockAction({
      action: {
        type: 'submit',
        value: '1847',
      },
      blockId: '',
      state: toRuntimeState(started),
    });

    await expectRuntimeError(submitPromise, 'runtime_snapshot_invalid');
    await expect(submitPromise).rejects.toThrow('too_small at blockId');
  });

  it('throws runtime_snapshot_invalid when performBlockAction action is missing', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);

    const submitPromise = engine.performBlockAction({
      blockId: 'briefing',
      state: toRuntimeState(started),
    } as unknown as Parameters<Engine['performBlockAction']>[0]);

    await expectRuntimeError(submitPromise, 'runtime_snapshot_invalid');
    await expect(submitPromise).rejects.toThrow(/at action/);
  });

  it('throws runtime_snapshot_invalid for malformed traverseEdge payloads', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);

    const traversePromise = engine.traverseEdge({
      edgeId: '',
      state: toRuntimeState(started),
    });

    await expectRuntimeError(traversePromise, 'runtime_snapshot_invalid');
    await expect(traversePromise).rejects.toThrow('too_small at edgeId');
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
          state: {
            ...toRuntimeState(started),
            roleId: '',
          } as unknown as RuntimeState,
        }),
        'runtime_snapshot_invalid',
      ),
      expectRuntimeError(
        engine.performBlockAction({
          action: {
            type: 'submit',
            value: '1847',
          },
          blockId: '',
          state: toRuntimeState(started),
        }),
        'runtime_snapshot_invalid',
      ),
      expectRuntimeError(
        engine.traverseEdge({
          edgeId: '',
          state: toRuntimeState(started),
        }),
        'runtime_snapshot_invalid',
      ),
    ]);
  });
});
