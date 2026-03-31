import type { StoryPackage } from './schema.js';
import type { StoryPackageValidationIssue } from './types.js';
import { createStoryPackageIssueFactory } from './validation-issues.js';

type DuplicateItem = {
  id: string;
};

type TraversableEdge = {
  edgeIndex: number;
  sourceNodeId: string;
  targetIndex: number;
  targetNodeId: string;
};

type BlockLocation = {
  blockIndex: number;
  nodeId: string;
  nodeIndex: number;
};

const createIssue = createStoryPackageIssueFactory('structure');

const appendDuplicateIdIssues = (
  issues: StoryPackageValidationIssue[],
  items: readonly DuplicateItem[],
  pathPrefix: ReadonlyArray<number | string>,
  itemLabel: string,
): void => {
  const firstIndexById = new Map<string, number>();

  items.forEach((item, index) => {
    const firstIndex = firstIndexById.get(item.id);
    if (firstIndex === undefined) {
      firstIndexById.set(item.id, index);
      return;
    }

    issues.push(
      createIssue(
        `duplicate-${itemLabel}-id`,
        [...pathPrefix, index, 'id'],
        `${itemLabel} id "${item.id}" is duplicated.`,
        {
          duplicateId: item.id,
          duplicateIndex: index,
          firstIndex,
        },
      ),
    );
  });
};

export const validateStoryPackageStructure = (storyPackage: StoryPackage): StoryPackageValidationIssue[] => {
  const issues: StoryPackageValidationIssue[] = [];
  const firstCrossNodeBlockById = new Map<string, BlockLocation>();

  appendDuplicateIdIssues(issues, storyPackage.roles, ['roles'], 'role');

  if (storyPackage.graph.nodes.length === 0) {
    issues.push(
      createIssue(
        'empty-graph',
        ['graph', 'nodes'],
        'Story packages must declare at least one node.',
      ),
    );
  }

  const nodeIndexById = new Map<string, number>();
  let hasDuplicateNodeIds = false;

  storyPackage.graph.nodes.forEach((node, nodeIndex) => {
    const existingIndex = nodeIndexById.get(node.id);
    if (existingIndex === undefined) {
      nodeIndexById.set(node.id, nodeIndex);
    } else {
      hasDuplicateNodeIds = true;
    }

    appendDuplicateIdIssues(issues, node.blocks, ['graph', 'nodes', nodeIndex, 'blocks'], 'block');

    node.blocks.forEach((block, blockIndex) => {
      const firstLocation = firstCrossNodeBlockById.get(block.id);
      if (firstLocation === undefined) {
        firstCrossNodeBlockById.set(block.id, {
          blockIndex,
          nodeId: node.id,
          nodeIndex,
        });
        return;
      }

      if (firstLocation.nodeIndex === nodeIndex) {
        return;
      }

      issues.push(
        createIssue(
          'duplicate-block-id',
          ['graph', 'nodes', nodeIndex, 'blocks', blockIndex, 'id'],
          `block id "${block.id}" is duplicated.`,
          {
            duplicateId: block.id,
            duplicateIndex: blockIndex,
            duplicateNodeId: node.id,
            duplicateNodeIndex: nodeIndex,
            firstIndex: firstLocation.blockIndex,
            firstNodeId: firstLocation.nodeId,
            firstNodeIndex: firstLocation.nodeIndex,
          },
        ),
      );
    });

    appendDuplicateIdIssues(issues, node.edges, ['graph', 'nodes', nodeIndex, 'edges'], 'edge');
  });

  appendDuplicateIdIssues(issues, storyPackage.graph.nodes, ['graph', 'nodes'], 'node');

  const entryNodeIndex = nodeIndexById.get(storyPackage.graph.entryNodeId);
  if (entryNodeIndex === undefined) {
    issues.push(
      createIssue(
        'invalid-entry-node',
        ['graph', 'entryNodeId'],
        `Entry node "${storyPackage.graph.entryNodeId}" does not exist.`,
        {
          entryNodeId: storyPackage.graph.entryNodeId,
        },
      ),
    );
  }

  const traversableEdgesByNode = storyPackage.graph.nodes.map<TraversableEdge[]>((node, nodeIndex) => {
    const traversableEdges: TraversableEdge[] = [];

    node.edges.forEach((edge, edgeIndex) => {
      const targetIndex = nodeIndexById.get(edge.targetNodeId);
      if (targetIndex === undefined) {
        issues.push(
          createIssue(
            'unknown-edge-target',
            ['graph', 'nodes', nodeIndex, 'edges', edgeIndex, 'targetNodeId'],
            `Edge target "${edge.targetNodeId}" does not exist.`,
            {
              sourceNodeId: node.id,
              targetNodeId: edge.targetNodeId,
            },
          ),
        );
        return;
      }

      traversableEdges.push({
        edgeIndex,
        sourceNodeId: node.id,
        targetIndex,
        targetNodeId: edge.targetNodeId,
      });
    });

    return traversableEdges;
  });

  if (!hasDuplicateNodeIds && entryNodeIndex !== undefined) {
    const reachable = new Array(storyPackage.graph.nodes.length).fill(false);
    const stack = [entryNodeIndex];

    while (stack.length > 0) {
      const nodeIndex = stack.pop();
      if (nodeIndex === undefined || reachable[nodeIndex]) {
        continue;
      }

      reachable[nodeIndex] = true;
      for (const edge of traversableEdgesByNode[nodeIndex] ?? []) {
        if (!reachable[edge.targetIndex]) {
          stack.push(edge.targetIndex);
        }
      }
    }

    storyPackage.graph.nodes.forEach((node, nodeIndex) => {
      if (reachable[nodeIndex]) {
        return;
      }

      issues.push(
        createIssue(
          'unreachable-node',
          ['graph', 'nodes', nodeIndex, 'id'],
          `Node "${node.id}" is unreachable from entry node "${storyPackage.graph.entryNodeId}".`,
          {
            entryNodeId: storyPackage.graph.entryNodeId,
            nodeId: node.id,
          },
        ),
      );
    });

    const visitState = new Array(storyPackage.graph.nodes.length).fill(0);

    const visitNode = (nodeIndex: number): void => {
      visitState[nodeIndex] = 1;

      for (const edge of traversableEdgesByNode[nodeIndex] ?? []) {
        if (visitState[edge.targetIndex] === 0) {
          visitNode(edge.targetIndex);
          continue;
        }

        if (visitState[edge.targetIndex] === 1) {
          issues.push(
            createIssue(
              'cyclic-edge',
              ['graph', 'nodes', nodeIndex, 'edges', edge.edgeIndex, 'targetNodeId'],
              `Edge from "${edge.sourceNodeId}" to "${edge.targetNodeId}" creates a cycle.`,
              {
                sourceNodeId: edge.sourceNodeId,
                targetNodeId: edge.targetNodeId,
              },
            ),
          );
        }
      }

      visitState[nodeIndex] = 2;
    };

    storyPackage.graph.nodes.forEach((_, nodeIndex) => {
      if (visitState[nodeIndex] === 0) {
        visitNode(nodeIndex);
      }
    });
  }

  return issues;
};
