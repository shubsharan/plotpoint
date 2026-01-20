import { describe, it, expect } from 'vitest';
import {
  createStoryGraph,
  getNode,
  getEdge,
  getOutgoingEdges,
  getIncomingEdges,
  getAllNodes,
  getAllEdges,
  getNodesByType,
  getNodeCount,
  getEdgeCount,
  getStartNodeId,
  hasNode,
  hasEdge,
} from '../story-graph';
import { createTestNode, createTestEdge } from '../../testing/graph-builders';

describe('createStoryGraph', () => {
  it('should create graph with correct node map', () => {
    const nodes = [
      createTestNode({ id: 'a', nodeKey: 'node_a' }),
      createTestNode({ id: 'b', nodeKey: 'node_b' }),
    ];
    const edges = [createTestEdge('a', 'b', { id: 'e1' })];

    const graph = createStoryGraph(nodes, edges, 'a');

    expect(getNode(graph, 'a')).toEqual(nodes[0]);
    expect(getNode(graph, 'b')).toEqual(nodes[1]);
    expect(getStartNodeId(graph)).toBe('a');
  });

  it('should create graph with correct edge indexes', () => {
    const nodes = [
      createTestNode({ id: 'a' }),
      createTestNode({ id: 'b' }),
      createTestNode({ id: 'c' }),
    ];
    const edges = [
      createTestEdge('a', 'b', { id: 'e1' }),
      createTestEdge('a', 'c', { id: 'e2' }),
      createTestEdge('b', 'c', { id: 'e3' }),
    ];

    const graph = createStoryGraph(nodes, edges, 'a');

    expect(getOutgoingEdges(graph, 'a')).toHaveLength(2);
    expect(getOutgoingEdges(graph, 'b')).toHaveLength(1);
    expect(getOutgoingEdges(graph, 'c')).toHaveLength(0);

    expect(getIncomingEdges(graph, 'a')).toHaveLength(0);
    expect(getIncomingEdges(graph, 'b')).toHaveLength(1);
    expect(getIncomingEdges(graph, 'c')).toHaveLength(2);
  });

  it('should handle empty arrays', () => {
    const graph = createStoryGraph([], [], 'start');

    expect(getAllNodes(graph)).toHaveLength(0);
    expect(getAllEdges(graph)).toHaveLength(0);
    expect(getNodeCount(graph)).toBe(0);
    expect(getEdgeCount(graph)).toBe(0);
  });
});

describe('getNode', () => {
  it('should return node by ID', () => {
    const node = createTestNode({ id: 'test-node', nodeKey: 'test' });
    const graph = createStoryGraph([node], [], 'test-node');

    expect(getNode(graph, 'test-node')).toEqual(node);
  });

  it('should return null for missing ID', () => {
    const graph = createStoryGraph([], [], 'start');

    expect(getNode(graph, 'non-existent')).toBeNull();
  });
});

describe('getEdge', () => {
  it('should return edge by ID', () => {
    const nodes = [createTestNode({ id: 'a' }), createTestNode({ id: 'b' })];
    const edge = createTestEdge('a', 'b', { id: 'test-edge' });
    const graph = createStoryGraph(nodes, [edge], 'a');

    expect(getEdge(graph, 'test-edge')).toEqual(edge);
  });

  it('should return null for missing ID', () => {
    const graph = createStoryGraph([], [], 'start');

    expect(getEdge(graph, 'non-existent')).toBeNull();
  });
});

describe('getNodesByType', () => {
  it('should filter nodes by component type', () => {
    const nodes = [
      createTestNode({ id: 'a', nodeType: 'text_block' }),
      createTestNode({ id: 'b', nodeType: 'choice_gate' }),
      createTestNode({ id: 'c', nodeType: 'text_block' }),
      createTestNode({ id: 'd', nodeType: 'end' }),
    ];
    const graph = createStoryGraph(nodes, [], 'a');

    expect(getNodesByType(graph, 'text_block')).toHaveLength(2);
    expect(getNodesByType(graph, 'choice_gate')).toHaveLength(1);
    expect(getNodesByType(graph, 'end')).toHaveLength(1);
    expect(getNodesByType(graph, 'image_block')).toHaveLength(0);
  });
});

describe('hasNode and hasEdge', () => {
  it('should return true for existing node', () => {
    const graph = createStoryGraph([createTestNode({ id: 'a' })], [], 'a');

    expect(hasNode(graph, 'a')).toBe(true);
    expect(hasNode(graph, 'b')).toBe(false);
  });

  it('should return true for existing edge', () => {
    const nodes = [createTestNode({ id: 'a' }), createTestNode({ id: 'b' })];
    const edges = [createTestEdge('a', 'b', { id: 'e1' })];
    const graph = createStoryGraph(nodes, edges, 'a');

    expect(hasEdge(graph, 'e1')).toBe(true);
    expect(hasEdge(graph, 'e2')).toBe(false);
  });
});
