import { describe, expect, it } from 'vitest';
import type {
  Engine,
  EngineRuntimeErrorCode,
  SessionState,
  RuntimeFrame,
  StartSessionInput,
  StoryPackage,
  StoryPackageRepo,
} from '../index.js';
import {
  EngineRuntimeError,
  createEngine,
  currentEngineMajor,
} from '../index.js';
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
  overrides?: Partial<StartSessionInput>,
): StartSessionInput => ({
  sessionId: 'session-1',
  playerId: 'player-1',
  roleId: 'detective',
  storyId,
  ...overrides,
});

const startRuntime = async (
  engine: Engine,
  storyId: string,
  overrides?: Partial<StartSessionInput>,
): Promise<RuntimeFrame> => engine.startSession(createStartInput(storyId, overrides));

const toSessionState = (frame: RuntimeFrame): SessionState => frame.state;

const toSessionStateAtNode = (snapshot: RuntimeFrame, nodeId: string): SessionState => ({
  ...toSessionState(snapshot),
  currentNodeId: nodeId,
});

const expectRuntimeFrameShape = (frame: RuntimeFrame): void => {
  expect(frame).toMatchObject({
    state: {
      currentNodeId: expect.any(String),
      sessionId: expect.any(String),
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
    },
    view: {
      currentNode: {
        blocks: expect.any(Array),
        id: expect.any(String),
        title: expect.any(String),
      },
      traversableEdges: expect.any(Array),
    },
  });
};

const getCurrentNodeBlock = (frame: RuntimeFrame, blockId: string) => {
  const block = frame.view.currentNode.blocks.find((candidate) => candidate.id === blockId);
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

    expect(typeof engine.startSession).toBe('function');
    expect(typeof engine.loadSession).toBe('function');
    expect(typeof engine.submitAction).toBe('function');
    expect(typeof engine.traverse).toBe('function');
  });

  it('returns the RuntimeFrame contract and preserves roleId across runtime transitions', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);
    const loaded = await engine.loadSession({
      state: toSessionState(started),
    });
    const traversed = await engine.traverse({
      edgeId: 'foyer-to-archive',
      state: toSessionState(loaded),
    });
    const submitted = await engine.submitAction({
      action: {
        type: 'submit',
        value: '1847',
      },
      blockId: 'vault-code',
      state: toSessionState(traversed),
    });

    for (const snapshot of [started, loaded, traversed, submitted]) {
      expectRuntimeFrameShape(snapshot);
      expect(snapshot.state.roleId).toBe('detective');
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

    const loaded = await engine.loadSession({
      state: toSessionState(started),
    });

    expect(loaded.state.storyPackageVersionId).toBe('snapshot-v1');
    expect(loaded.state.currentNodeId).toBe('foyer');

    const submitted = await engine.submitAction({
      action: {
        type: 'submit',
        value: '1847',
      },
      blockId: 'vault-code',
      state: toSessionStateAtNode(loaded, 'archive-door'),
    });

    expect(submitted.state.storyPackageVersionId).toBe('snapshot-v1');
    expect(submitted.state.currentNodeId).toBe('archive-door');
  });

  it('rehydrates and submits from SessionState inputs without persisting derived fields', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);
    const loaded = await engine.loadSession({
      state: toSessionState(started),
    });
    const traversed = await engine.traverse({
      edgeId: 'foyer-to-archive',
      state: toSessionState(loaded),
    });
    const submitted = await engine.submitAction({
      action: {
        type: 'submit',
        value: '1847',
      },
      blockId: 'vault-code',
      state: toSessionState(traversed),
    });

    expect(started.view.traversableEdges).toEqual([
      {
        edgeId: 'foyer-to-archive',
        label: 'Head to the archive',
        targetNodeId: 'archive-door',
      },
    ]);
    expect(loaded.view.traversableEdges).toEqual(started.view.traversableEdges);
    expect(traversed.view.traversableEdges).toEqual([]);
    expect(submitted.view.traversableEdges).toEqual([
      {
        edgeId: 'archive-to-vault',
        label: 'Open the archive vault',
        targetNodeId: 'vault',
      },
    ]);
  });

  it('traverses to the selected edge target and updates current node state', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);

    const traversed = await engine.traverse({
      edgeId: 'foyer-to-archive',
      state: toSessionState(started),
    });

    expect(traversed.state.currentNodeId).toBe('archive-door');
    expect(traversed.view.traversableEdges).toEqual([]);
  });

  it('traverses conditioned edges after their facts resolve true', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);
    const archiveDoor = await engine.traverse({
      edgeId: 'foyer-to-archive',
      state: toSessionState(started),
    });
    const unlockedArchiveDoor = await engine.submitAction({
      action: {
        type: 'submit',
        value: '1847',
      },
      blockId: 'vault-code',
      state: toSessionState(archiveDoor),
    });

    const traversed = await engine.traverse({
      edgeId: 'archive-to-vault',
      state: toSessionState(unlockedArchiveDoor),
    });

    expect(unlockedArchiveDoor.view.traversableEdges).toEqual([
      {
        edgeId: 'archive-to-vault',
        label: 'Open the archive vault',
        targetNodeId: 'vault',
      },
    ]);
    expect(traversed.state.currentNodeId).toBe('vault');
    expect(traversed.view.traversableEdges).toEqual([]);
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

    const traversed = await engine.traverse({
      edgeId: 'foyer-to-archive',
      state: toSessionState(started),
    });

    expect(getCurrentNodeBlock(traversed, 'archive-briefing').state).toEqual({
      unlocked: true,
    });
    expect(Object.hasOwn(traversed.state.playerState.blockStates, 'archive-briefing')).toBe(false);
  });

  it('rehydrates the same hydrated current-node view from sparse runtime state', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);
    const traversed = await engine.traverse({
      edgeId: 'foyer-to-archive',
      state: toSessionState(started),
    });

    const loaded = await engine.loadSession({
      state: toSessionStateAtNode(started, 'archive-door'),
    });

    expect(loaded.view.currentNode).toEqual(traversed.view.currentNode);
    expect(loaded.view.traversableEdges).toEqual(traversed.view.traversableEdges);
    expect(loaded.state.playerState.blockStates).toEqual(traversed.state.playerState.blockStates);
  });

  it('recomputes conditioned edges from effective runtime state after block updates', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);
    const traversed = await engine.traverse({
      edgeId: 'foyer-to-archive',
      state: toSessionState(started),
    });
    const submitted = await engine.submitAction({
      action: {
        type: 'submit',
        value: '1847',
      },
      blockId: 'vault-code',
      state: toSessionState(traversed),
    });

    expect(traversed.view.traversableEdges).toEqual([]);
    expect(submitted.view.traversableEdges).toEqual([
      {
        edgeId: 'archive-to-vault',
        label: 'Open the archive vault',
        targetNodeId: 'vault',
      },
    ]);
  });

  it('rejects conditioned authored edges as not traversable', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);
    const traversed = await engine.traverse({
      edgeId: 'foyer-to-archive',
      state: toSessionState(started),
    });

    const error = await expectRuntimeError(
      engine.traverse({
        edgeId: 'archive-to-vault',
        state: toSessionState(traversed),
      }),
      'runtime_edge_not_traversable',
    );

    expect(error.details).toMatchObject({
      edgeId: 'archive-to-vault',
      nodeId: 'archive-door',
      reason: 'condition_false',
      storyId,
    });
  });

  it('rejects state payloads that include derived view fields', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);
    const staleStateWithView = {
      ...toSessionState(started),
      currentNode: {
        ...started.view.currentNode,
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

    const loadPromise = engine.loadSession({
      state: staleStateWithView as unknown as SessionState,
    });

    await expectRuntimeError(loadPromise, 'runtime_session_input_invalid');
    await expect(loadPromise).rejects.toThrow('unrecognized_keys');
  });

  it('clones block-state maps when normalizing session state into a frame', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);

    const stateWithBlockState: SessionState = {
      ...toSessionState(started),
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

    const loaded = await engine.loadSession({ state: stateWithBlockState });

    expect(loaded).not.toBe(stateWithBlockState);
    expect(loaded.state.playerState.blockStates).not.toBe(stateWithBlockState.playerState.blockStates);
    expect(loaded.state.sharedState.blockStates).not.toBe(stateWithBlockState.sharedState.blockStates);
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

        return engine.loadSession({
          state: {
            ...toSessionState(started),
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
            type: 'submit',
            value: '1847',
          },
          blockId: 'missing-block',
          state: toSessionState(started),
        });
      },
    },
    {
      code: 'runtime_edge_not_found',
      name: 'edge target is unknown during traversal',
      run: async ({ engine, storyId }) => {
        const started = await startRuntime(engine, storyId);

        return engine.traverse({
          edgeId: 'missing-edge',
          state: toSessionState(started),
        });
      },
    },
    {
      code: 'runtime_edge_not_traversable',
      name: 'edge target is conditioned during traversal',
      run: async ({ engine, storyId }) => {
        const started = await startRuntime(engine, storyId);
        const traversed = await engine.traverse({
          edgeId: 'foyer-to-archive',
          state: toSessionState(started),
        });

        return engine.traverse({
          edgeId: 'archive-to-vault',
          state: toSessionState(traversed),
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
      engine.startSession(createStartInput('story-requested-by-runtime')),
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

    const startPromise = engine.startSession(createStartInput('story-the-stolen-ledger'));

    await expectRuntimeError(startPromise, 'runtime_story_package_unavailable');
    await expect(startPromise).rejects.toThrow('storage offline');
  });

  it('throws runtime_story_package_version_unavailable when pinned version cannot be loaded', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);

    const loadPromise = engine.loadSession({
      state: {
        ...toSessionState(started),
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

  it('throws runtime_session_input_invalid for malformed startSession payloads', async () => {
    const { engine, storyId } = createRuntimeContext();
    const startPromise = startRuntime(engine, storyId, {
      sessionId: '',
    });

    await expectRuntimeError(startPromise, 'runtime_session_input_invalid');
    await expect(startPromise).rejects.toThrow('too_small at sessionId');
  });

  it('throws runtime_session_input_invalid for malformed loadSession state payloads', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);

    const loadPromise = engine.loadSession({
      state: {
        ...toSessionState(started),
        roleId: '',
      } as unknown as SessionState,
    });

    await expectRuntimeError(loadPromise, 'runtime_session_input_invalid');
    await expect(loadPromise).rejects.toThrow('too_small at state.roleId');
  });

  it('throws runtime_session_input_invalid when pinned story package version is missing from loadSession state', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);

    const runtimeState = toSessionState(started) as Record<string, unknown>;
    delete runtimeState.storyPackageVersionId;

    const loadPromise = engine.loadSession({
      state: runtimeState as unknown as SessionState,
    });

    await expectRuntimeError(loadPromise, 'runtime_session_input_invalid');
    await expect(loadPromise).rejects.toThrow('at state.storyPackageVersionId');
  });

  it('throws runtime_session_input_invalid for malformed submitAction payloads', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);

    const submitPromise = engine.submitAction({
      action: {
        type: 'submit',
        value: '1847',
      },
      blockId: '',
      state: toSessionState(started),
    });

    await expectRuntimeError(submitPromise, 'runtime_session_input_invalid');
    await expect(submitPromise).rejects.toThrow('too_small at blockId');
  });

  it('throws runtime_session_input_invalid when submitAction action is missing', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);

    const submitPromise = engine.submitAction({
      blockId: 'briefing',
      state: toSessionState(started),
    } as unknown as Parameters<Engine['submitAction']>[0]);

    await expectRuntimeError(submitPromise, 'runtime_session_input_invalid');
    await expect(submitPromise).rejects.toThrow(/at action/);
  });

  it('throws runtime_session_input_invalid for malformed traverse payloads', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);

    const traversePromise = engine.traverse({
      edgeId: '',
      state: toSessionState(started),
    });

    await expectRuntimeError(traversePromise, 'runtime_session_input_invalid');
    await expect(traversePromise).rejects.toThrow('too_small at edgeId');
  });

  it('uses runtime_session_input_invalid across all runtime entrypoints for malformed input', async () => {
    const { engine, storyId } = createRuntimeContext();
    const started = await startRuntime(engine, storyId);

    await Promise.all([
      expectRuntimeError(
        startRuntime(engine, storyId, {
          playerId: '',
        }),
        'runtime_session_input_invalid',
      ),
      expectRuntimeError(
        engine.loadSession({
          state: {
            ...toSessionState(started),
            roleId: '',
          } as unknown as SessionState,
        }),
        'runtime_session_input_invalid',
      ),
      expectRuntimeError(
        engine.submitAction({
          action: {
            type: 'submit',
            value: '1847',
          },
          blockId: '',
          state: toSessionState(started),
        }),
        'runtime_session_input_invalid',
      ),
      expectRuntimeError(
        engine.traverse({
          edgeId: '',
          state: toSessionState(started),
        }),
        'runtime_session_input_invalid',
      ),
    ]);
  });
});
