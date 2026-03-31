import { describe, expect, it } from 'vitest';
import {
  storyPackageSchema,
  validateStoryPackageCompatibility,
  validateStoryPackageStructure,
} from '../index.js';
import {
  createCompatibilityInvalidStoryPackageFixture,
  createStructurallyInvalidStoryPackageFixture,
  createValidStoryPackageFixture,
  invalidStoryPackageFixtures,
} from './fixtures/story-packages.js';

describe('@plotpoint/engine story package validation', () => {
  it('accepts a valid rooted DAG storyPackage', () => {
    const storyPackage = createValidStoryPackageFixture();

    expect(validateStoryPackageStructure(storyPackage)).toEqual([]);
    expect(
      validateStoryPackageCompatibility(storyPackage, {
        currentEngineMajor: 0,
        mode: 'draft',
      }),
    ).toEqual([]);
  });

  it('rejects duplicate node ids deterministically', () => {
    const storyPackage = createStructurallyInvalidStoryPackageFixture();

    expect(validateStoryPackageStructure(storyPackage)).toEqual([
      {
        code: 'duplicate-node-id',
        details: {
          duplicateId: 'archive-door',
          duplicateIndex: 3,
          firstIndex: 1,
        },
        layer: 'structure',
        message: 'node id "archive-door" is duplicated.',
        path: ['graph', 'nodes', 3, 'id'],
      },
    ]);
  });

  it('rejects broken references, unreachable nodes, and cycles', () => {
    const storyPackage = createValidStoryPackageFixture();
    const entryNode = storyPackage.graph.nodes[0];
    const archiveNode = storyPackage.graph.nodes[1];
    const vaultNode = storyPackage.graph.nodes[2];

    if (!entryNode || !archiveNode || !vaultNode) {
      throw new Error('Expected seed fixture to include foyer, archive door, and vault nodes.');
    }

    entryNode.edges[0] = {
      id: 'foyer-to-missing',
      targetNodeId: 'missing-node',
    };
    vaultNode.edges.push({
      id: 'vault-to-archive',
      targetNodeId: 'archive-door',
    });

    expect(validateStoryPackageStructure(storyPackage)).toEqual([
      {
        code: 'unknown-edge-target',
        details: {
          sourceNodeId: 'foyer',
          targetNodeId: 'missing-node',
        },
        layer: 'structure',
        message: 'Edge target "missing-node" does not exist.',
        path: ['graph', 'nodes', 0, 'edges', 0, 'targetNodeId'],
      },
      {
        code: 'unreachable-node',
        details: {
          entryNodeId: 'foyer',
          nodeId: 'archive-door',
        },
        layer: 'structure',
        message: 'Node "archive-door" is unreachable from entry node "foyer".',
        path: ['graph', 'nodes', 1, 'id'],
      },
      {
        code: 'unreachable-node',
        details: {
          entryNodeId: 'foyer',
          nodeId: 'vault',
        },
        layer: 'structure',
        message: 'Node "vault" is unreachable from entry node "foyer".',
        path: ['graph', 'nodes', 2, 'id'],
      },
      {
        code: 'cyclic-edge',
        details: {
          sourceNodeId: 'vault',
          targetNodeId: 'archive-door',
        },
        layer: 'structure',
        message: 'Edge from "vault" to "archive-door" creates a cycle.',
        path: ['graph', 'nodes', 2, 'edges', 0, 'targetNodeId'],
      },
    ]);
  });

  it('rejects duplicate role, block, and edge ids', () => {
    const storyPackage = createValidStoryPackageFixture();
    const firstNode = storyPackage.graph.nodes[0];

    if (!firstNode) {
      throw new Error('Expected a first node in the valid story package fixture.');
    }

    storyPackage.roles.push({
      id: 'detective',
      title: 'Lead Detective',
    });
    firstNode.blocks.push({
      id: 'briefing',
      type: 'text',
      config: {},
    });
    firstNode.edges.push({
      id: 'foyer-to-archive',
      targetNodeId: 'archive-door',
    });

    expect(validateStoryPackageStructure(storyPackage)).toEqual([
      {
        code: 'duplicate-role-id',
        details: {
          duplicateId: 'detective',
          duplicateIndex: 2,
          firstIndex: 0,
        },
        layer: 'structure',
        message: 'role id "detective" is duplicated.',
        path: ['roles', 2, 'id'],
      },
      {
        code: 'duplicate-block-id',
        details: {
          duplicateId: 'briefing',
          duplicateIndex: 1,
          firstIndex: 0,
        },
        layer: 'structure',
        message: 'block id "briefing" is duplicated.',
        path: ['graph', 'nodes', 0, 'blocks', 1, 'id'],
      },
      {
        code: 'duplicate-edge-id',
        details: {
          duplicateId: 'foyer-to-archive',
          duplicateIndex: 1,
          firstIndex: 0,
        },
        layer: 'structure',
        message: 'edge id "foyer-to-archive" is duplicated.',
        path: ['graph', 'nodes', 0, 'edges', 1, 'id'],
      },
    ]);
  });

  it('rejects duplicate block ids across different nodes', () => {
    const storyPackage = createValidStoryPackageFixture();
    const vaultNode = storyPackage.graph.nodes[2];

    if (!vaultNode) {
      throw new Error('Expected vault node in valid story package fixture.');
    }

    vaultNode.blocks.push({
      id: 'vault-code',
      type: 'text',
      config: {},
    });

    expect(validateStoryPackageStructure(storyPackage)).toEqual([
      {
        code: 'duplicate-block-id',
        details: {
          duplicateId: 'vault-code',
          duplicateIndex: 1,
          duplicateNodeId: 'vault',
          duplicateNodeIndex: 2,
          firstIndex: 0,
          firstNodeId: 'archive-door',
          firstNodeIndex: 1,
        },
        layer: 'structure',
        message: 'block id "vault-code" is duplicated.',
        path: ['graph', 'nodes', 2, 'blocks', 1, 'id'],
      },
    ]);
  });

  it('rejects unknown block types and incompatible engine majors', () => {
    const parsed = storyPackageSchema.safeParse(createCompatibilityInvalidStoryPackageFixture());
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }

    expect(
      validateStoryPackageCompatibility(parsed.data, {
        currentEngineMajor: 0,
        mode: 'published',
      }),
    ).toEqual([
      {
        code: 'unknown-block-type',
        details: {
          blockId: 'mystery-device',
          blockType: 'mystery-device',
          nodeId: 'foyer',
        },
        layer: 'compatibility',
        message: 'Block type "mystery-device" is not registered in the engine.',
        path: ['graph', 'nodes', 0, 'blocks', 1, 'type'],
      },
      {
        code: 'incompatible-engine-major',
        details: {
          currentEngineMajor: 0,
          engineMajor: 9,
          mode: 'published',
        },
        layer: 'compatibility',
        message: 'Story package engine major 9 does not match current engine major 0.',
        path: ['version', 'engineMajor'],
      },
    ]);
  });

  it('rejects invalid block configs for known block types', () => {
    const storyPackage = storyPackageSchema.parse(invalidStoryPackageFixtures.invalidBlockConfig);

    expect(
      validateStoryPackageCompatibility(storyPackage, {
        currentEngineMajor: 0,
        mode: 'draft',
      }),
    ).toEqual([
      {
        code: 'invalid-block-config',
        details: {
          blockId: 'vault-code',
          blockType: 'code',
          nodeId: 'foyer',
          validationCode: 'invalid_type',
        },
        layer: 'compatibility',
        message: 'Block "vault-code" has invalid config for type "code".',
        path: ['graph', 'nodes', 0, 'blocks', 0, 'config', 'expected'],
      },
      {
        code: 'invalid-block-config',
        details: {
          blockId: 'vault-code',
          blockType: 'code',
          nodeId: 'foyer',
          validationCode: 'invalid_type',
        },
        layer: 'compatibility',
        message: 'Block "vault-code" has invalid config for type "code".',
        path: ['graph', 'nodes', 0, 'blocks', 0, 'config', 'maxAttempts'],
      },
    ]);
  });

  it('rejects inconsistent single-choice configs', () => {
    const storyPackage = createValidStoryPackageFixture();
    const singleChoiceBlock = storyPackage.graph.nodes[1]?.blocks[1];

    if (!singleChoiceBlock || singleChoiceBlock.type !== 'single-choice') {
      throw new Error('Expected archive-door node to include a single-choice block.');
    }

    singleChoiceBlock.config = {
      correctOptionId: 'missing-option',
      options: [
        {
          id: 'archivist',
          label: 'Archivist',
        },
        {
          id: 'archivist',
          label: 'Archivist (duplicate)',
        },
      ],
      prompt: 'Who had access to the archive key?',
    };

    expect(
      validateStoryPackageCompatibility(storyPackage, {
        currentEngineMajor: 0,
        mode: 'draft',
      }),
    ).toEqual([
      {
        code: 'invalid-block-config',
        details: {
          blockId: 'suspect-theory',
          blockType: 'single-choice',
          nodeId: 'archive-door',
          validationCode: 'custom',
        },
        layer: 'compatibility',
        message: 'Block "suspect-theory" has invalid config for type "single-choice".',
        path: ['graph', 'nodes', 1, 'blocks', 1, 'config', 'options', 1, 'id'],
      },
      {
        code: 'invalid-block-config',
        details: {
          blockId: 'suspect-theory',
          blockType: 'single-choice',
          nodeId: 'archive-door',
          validationCode: 'custom',
        },
        layer: 'compatibility',
        message: 'Block "suspect-theory" has invalid config for type "single-choice".',
        path: ['graph', 'nodes', 1, 'blocks', 1, 'config', 'correctOptionId'],
      },
    ]);
  });

  it('rejects inconsistent multi-choice configs', () => {
    const storyPackage = createValidStoryPackageFixture();
    const archiveNode = storyPackage.graph.nodes[1];

    if (!archiveNode) {
      throw new Error('Expected archive-door node in valid story package fixture.');
    }

    archiveNode.blocks.push({
      id: 'suspect-vote',
      type: 'multi-choice',
      config: {
        correctOptionIds: ['curator', 'missing-option', 'curator'],
        maxSelections: 2,
        minSelections: 3,
        options: [
          {
            id: 'curator',
            label: 'Curator',
          },
          {
            id: 'curator',
            label: 'Curator (duplicate)',
          },
        ],
        prompt: 'Which suspects had key access?',
      },
    });

    expect(
      validateStoryPackageCompatibility(storyPackage, {
        currentEngineMajor: 0,
        mode: 'draft',
      }),
    ).toEqual([
      {
        code: 'invalid-block-config',
        details: {
          blockId: 'suspect-vote',
          blockType: 'multi-choice',
          nodeId: 'archive-door',
          validationCode: 'custom',
        },
        layer: 'compatibility',
        message: 'Block "suspect-vote" has invalid config for type "multi-choice".',
        path: ['graph', 'nodes', 1, 'blocks', 2, 'config', 'options', 1, 'id'],
      },
      {
        code: 'invalid-block-config',
        details: {
          blockId: 'suspect-vote',
          blockType: 'multi-choice',
          nodeId: 'archive-door',
          validationCode: 'custom',
        },
        layer: 'compatibility',
        message: 'Block "suspect-vote" has invalid config for type "multi-choice".',
        path: ['graph', 'nodes', 1, 'blocks', 2, 'config', 'correctOptionIds', 1],
      },
      {
        code: 'invalid-block-config',
        details: {
          blockId: 'suspect-vote',
          blockType: 'multi-choice',
          nodeId: 'archive-door',
          validationCode: 'custom',
        },
        layer: 'compatibility',
        message: 'Block "suspect-vote" has invalid config for type "multi-choice".',
        path: ['graph', 'nodes', 1, 'blocks', 2, 'config', 'correctOptionIds', 2],
      },
      {
        code: 'invalid-block-config',
        details: {
          blockId: 'suspect-vote',
          blockType: 'multi-choice',
          nodeId: 'archive-door',
          validationCode: 'custom',
        },
        layer: 'compatibility',
        message: 'Block "suspect-vote" has invalid config for type "multi-choice".',
        path: ['graph', 'nodes', 1, 'blocks', 2, 'config', 'minSelections'],
      },
      {
        code: 'invalid-block-config',
        details: {
          blockId: 'suspect-vote',
          blockType: 'multi-choice',
          nodeId: 'archive-door',
          validationCode: 'custom',
        },
        layer: 'compatibility',
        message: 'Block "suspect-vote" has invalid config for type "multi-choice".',
        path: ['graph', 'nodes', 1, 'blocks', 2, 'config', 'minSelections'],
      },
    ]);
  });

  it('rejects unknown condition names and missing published engine majors', () => {
    const storyPackage = createValidStoryPackageFixture();
    const conditionalEdge = storyPackage.graph.nodes[1]?.edges[0];

    if (!conditionalEdge?.condition || conditionalEdge.condition.type !== 'check') {
      throw new Error('Expected archive-door edge to include a check condition.');
    }

    conditionalEdge.condition.condition = 'mystery-check';
    const parsed = storyPackageSchema.safeParse(storyPackage);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }

    expect(
      validateStoryPackageCompatibility(parsed.data, {
        currentEngineMajor: 0,
        mode: 'runtime',
      }),
    ).toEqual([
      {
        code: 'unknown-condition-name',
        details: {
          conditionName: 'mystery-check',
          edgeId: 'archive-to-vault',
          nodeId: 'archive-door',
        },
        layer: 'compatibility',
        message: 'Condition "mystery-check" is not registered in the engine.',
        path: ['graph', 'nodes', 1, 'edges', 0, 'condition', 'condition'],
      },
      {
        code: 'missing-engine-major',
        details: {
          currentEngineMajor: 0,
          mode: 'runtime',
        },
        layer: 'compatibility',
        message: 'Story package engine major is required for runtime validation.',
        path: ['version', 'engineMajor'],
      },
    ]);
  });
});
