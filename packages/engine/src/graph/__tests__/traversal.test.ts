import { describe, it, expect } from 'vitest';
import {
  findReachableNodes,
  findAllPaths,
  detectCycles,
  getEndNodes,
  getOrphanedNodes,
  findUnreachableNodes,
  findDeadEndNodes,
  topologicalSort,
} from '../traversal';
import { createStoryGraph } from '../story-graph';
import {
  createTestNode,
  createTestEdge,
  createLinearGraph,
} from '../../testing/graph-builders';

describe('findReachableNodes', () => {
  it('should find all connected nodes', () => {
    const graph = createLinearGraph(4);
    const reachable = findReachableNodes(graph, 'node-0');

    expect(reachable.size).toBe(4);
    expect(reachable.has('node-0')).toBe(true);
    expect(reachable.has('node-1')).toBe(true);
    expect(reachable.has('node-2')).toBe(true);
    expect(reachable.has('node-3')).toBe(true);
  });

  it('should not include disconnected nodes', () => {
    const nodes = [
      createTestNode({ id: 'a' }),
      createTestNode({ id: 'b' }),
      createTestNode({ id: 'isolated' }),
    ];
    const edges = [createTestEdge('a', 'b')];
    const graph = createStoryGraph(nodes, edges, 'a');

    const reachable = findReachableNodes(graph, 'a');

    expect(reachable.has('a')).toBe(true);
    expect(reachable.has('b')).toBe(true);
    expect(reachable.has('isolated')).toBe(false);
  });

  it('should handle cycles without infinite loop', () => {
    const nodes = [
      createTestNode({ id: 'a' }),
      createTestNode({ id: 'b' }),
    ];
    const edges = [
      createTestEdge('a', 'b'),
      createTestEdge('b', 'a'), // Cycle
    ];
    const graph = createStoryGraph(nodes, edges, 'a');

    const reachable = findReachableNodes(graph, 'a');

    expect(reachable.size).toBe(2);
  });
});

describe('findAllPaths', () => {
  it('should find single path in linear graph', () => {
    const graph = createLinearGraph(3);
    const paths = findAllPaths(graph, 'node-0', 'node-2');

    expect(paths).toHaveLength(1);
    expect(paths[0]).toEqual(['node-0', 'node-1', 'node-2']);
  });

  it('should find multiple paths in branching graph', () => {
    const nodes = [
      createTestNode({ id: 'a' }),
      createTestNode({ id: 'b' }),
      createTestNode({ id: 'c' }),
      createTestNode({ id: 'd' }),
    ];
    const edges = [
      createTestEdge('a', 'b'),
      createTestEdge('a', 'c'),
      createTestEdge('b', 'd'),
      createTestEdge('c', 'd'),
    ];
    const graph = createStoryGraph(nodes, edges, 'a');

    const paths = findAllPaths(graph, 'a', 'd');

    expect(paths).toHaveLength(2);
  });

  it('should return empty for unreachable target', () => {
    const nodes = [
      createTestNode({ id: 'a' }),
      createTestNode({ id: 'b' }),
    ];
    const graph = createStoryGraph(nodes, [], 'a');

    const paths = findAllPaths(graph, 'a', 'b');

    expect(paths).toHaveLength(0);
  });

  it('should respect maxDepth', () => {
    const graph = createLinearGraph(10);
    const paths = findAllPaths(graph, 'node-0', 'node-9', 5);

    expect(paths).toHaveLength(0); // Can't reach in 5 steps
  });
});

describe('detectCycles', () => {
  it('should return empty for DAG', () => {
    const graph = createLinearGraph(3);
    const cycles = detectCycles(graph);

    expect(cycles).toHaveLength(0);
  });

  it('should detect simple cycle', () => {
    const nodes = [
      createTestNode({ id: 'a' }),
      createTestNode({ id: 'b' }),
    ];
    const edges = [
      createTestEdge('a', 'b'),
      createTestEdge('b', 'a'),
    ];
    const graph = createStoryGraph(nodes, edges, 'a');

    const cycles = detectCycles(graph);

    expect(cycles.length).toBeGreaterThan(0);
  });

  it('should detect self-loop', () => {
    const nodes = [createTestNode({ id: 'a' })];
    const edges = [createTestEdge('a', 'a')];
    const graph = createStoryGraph(nodes, edges, 'a');

    const cycles = detectCycles(graph);

    expect(cycles.length).toBeGreaterThan(0);
  });
});

describe('getEndNodes', () => {
  it('should return nodes of type end', () => {
    const nodes = [
      createTestNode({ id: 'a', nodeType: 'text_block' }),
      createTestNode({ id: 'b', nodeType: 'end' }),
      createTestNode({ id: 'c', nodeType: 'end' }),
    ];
    const graph = createStoryGraph(nodes, [], 'a');

    const endNodes = getEndNodes(graph);

    expect(endNodes).toHaveLength(2);
    expect(endNodes.map((n) => n.id)).toContain('b');
    expect(endNodes.map((n) => n.id)).toContain('c');
  });
});

describe('findDeadEndNodes', () => {
  it('should find non-end nodes without outgoing edges', () => {
    const nodes = [
      createTestNode({ id: 'a', nodeType: 'text_block' }),
      createTestNode({ id: 'b', nodeType: 'text_block' }), // Dead end
      createTestNode({ id: 'c', nodeType: 'end' }), // Valid end
    ];
    const edges = [createTestEdge('a', 'b'), createTestEdge('a', 'c')];
    const graph = createStoryGraph(nodes, edges, 'a');

    const deadEnds = findDeadEndNodes(graph);

    expect(deadEnds).toHaveLength(1);
    expect(deadEnds[0].id).toBe('b');
  });

  it('should not include end nodes', () => {
    const graph = createLinearGraph(3); // Last node is 'end'
    const deadEnds = findDeadEndNodes(graph);

    expect(deadEnds).toHaveLength(0);
  });
});

describe('findUnreachableNodes', () => {
  it('should find nodes not reachable from start', () => {
    const nodes = [
      createTestNode({ id: 'a' }),
      createTestNode({ id: 'b' }),
      createTestNode({ id: 'unreachable' }),
    ];
    const edges = [createTestEdge('a', 'b')];
    const graph = createStoryGraph(nodes, edges, 'a');

    const unreachable = findUnreachableNodes(graph);

    expect(unreachable).toHaveLength(1);
    expect(unreachable[0].id).toBe('unreachable');
  });
});

describe('topologicalSort', () => {
  it('should return valid ordering for DAG', () => {
    const graph = createLinearGraph(3);
    const sorted = topologicalSort(graph);

    expect(sorted).not.toBeNull();
    expect(sorted).toEqual(['node-0', 'node-1', 'node-2']);
  });

  it('should return null for cyclic graph', () => {
    const nodes = [createTestNode({ id: 'a' }), createTestNode({ id: 'b' })];
    const edges = [createTestEdge('a', 'b'), createTestEdge('b', 'a')];
    const graph = createStoryGraph(nodes, edges, 'a');

    const sorted = topologicalSort(graph);

    expect(sorted).toBeNull();
  });
});
