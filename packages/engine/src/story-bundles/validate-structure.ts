import type { StoryBundle } from './schema.js';
import type { StoryBundleValidationIssue } from './types.js';

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

const createIssue = (
  code: string,
  path: ReadonlyArray<number | string>,
  message: string,
  details?: Record<string, boolean | null | number | string>,
): StoryBundleValidationIssue =>
  details === undefined
    ? {
        code,
        layer: 'structure',
        message,
        path,
      }
    : {
        code,
        details,
        layer: 'structure',
        message,
        path,
      };

const appendDuplicateIdIssues = (
  issues: StoryBundleValidationIssue[],
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

export const validateStoryBundleStructure = (bundle: StoryBundle): StoryBundleValidationIssue[] => {
  const issues: StoryBundleValidationIssue[] = [];
  const firstCrossNodeBlockById = new Map<string, BlockLocation>();

  appendDuplicateIdIssues(issues, bundle.roles, ['roles'], 'role');

  if (bundle.graph.nodes.length === 0) {
    issues.push(
      createIssue(
        'empty-graph',
        ['graph', 'nodes'],
        'Story bundles must declare at least one node.',
      ),
    );
  }

  const nodeIndexById = new Map<string, number>();
  let hasDuplicateNodeIds = false;

  bundle.graph.nodes.forEach((node, nodeIndex) => {
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

  appendDuplicateIdIssues(issues, bundle.graph.nodes, ['graph', 'nodes'], 'node');

  const entryNodeIndex = nodeIndexById.get(bundle.graph.entryNodeId);
  if (entryNodeIndex === undefined) {
    issues.push(
      createIssue(
        'invalid-entry-node',
        ['graph', 'entryNodeId'],
        `Entry node "${bundle.graph.entryNodeId}" does not exist.`,
        {
          entryNodeId: bundle.graph.entryNodeId,
        },
      ),
    );
  }

  const traversableEdgesByNode = bundle.graph.nodes.map<TraversableEdge[]>((node, nodeIndex) => {
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
    const reachable = new Array(bundle.graph.nodes.length).fill(false);
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

    bundle.graph.nodes.forEach((node, nodeIndex) => {
      if (reachable[nodeIndex]) {
        return;
      }

      issues.push(
        createIssue(
          'unreachable-node',
          ['graph', 'nodes', nodeIndex, 'id'],
          `Node "${node.id}" is unreachable from entry node "${bundle.graph.entryNodeId}".`,
          {
            entryNodeId: bundle.graph.entryNodeId,
            nodeId: node.id,
          },
        ),
      );
    });

    const visitState = new Array(bundle.graph.nodes.length).fill(0);

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

    bundle.graph.nodes.forEach((_, nodeIndex) => {
      if (visitState[nodeIndex] === 0) {
        visitNode(nodeIndex);
      }
    });
  }

  return issues;
};
