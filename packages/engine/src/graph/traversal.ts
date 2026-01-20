import type { StoryNode } from '@plotpoint/db';
import type { StoryGraph } from './story-graph';
import { getNode, getOutgoingEdges, getAllNodes, getIncomingEdges, getStartNodeId } from './story-graph';

/**
 * Find all nodes reachable from a starting node using breadth-first search.
 * Returns a set of node IDs that can be reached by following edges.
 */
export function findReachableNodes(graph: StoryGraph, startNodeId: string): Set<string> {
  const reachable = new Set<string>();
  const queue: string[] = [startNodeId];
  reachable.add(startNodeId);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const edges = getOutgoingEdges(graph, currentId);

    for (const edge of edges) {
      if (!reachable.has(edge.targetNodeId)) {
        reachable.add(edge.targetNodeId);
        queue.push(edge.targetNodeId);
      }
    }
  }

  return reachable;
}

/**
 * Find all paths from one node to another.
 * Uses depth-first search with backtracking.
 * Returns array of paths, where each path is an array of node IDs.
 */
export function findAllPaths(
  graph: StoryGraph,
  fromNodeId: string,
  toNodeId: string,
  maxDepth: number = 100
): string[][] {
  const paths: string[][] = [];
  const visited = new Set<string>();

  function dfs(currentId: string, currentPath: string[], depth: number): void {
    // Prevent infinite loops
    if (depth > maxDepth) return;

    // Found target
    if (currentId === toNodeId) {
      paths.push([...currentPath, currentId]);
      return;
    }

    // Mark as visited for this path
    visited.add(currentId);
    currentPath.push(currentId);

    // Explore outgoing edges
    const edges = getOutgoingEdges(graph, currentId);
    for (const edge of edges) {
      if (!visited.has(edge.targetNodeId)) {
        dfs(edge.targetNodeId, currentPath, depth + 1);
      }
    }

    // Backtrack
    currentPath.pop();
    visited.delete(currentId);
  }

  dfs(fromNodeId, [], 0);
  return paths;
}

/**
 * Detect cycles in the graph.
 * Returns an array of cycles, where each cycle is an array of node IDs.
 * Empty array means no cycles found (DAG).
 */
export function detectCycles(graph: StoryGraph): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const pathStack: string[] = [];

  function dfs(nodeId: string): void {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    pathStack.push(nodeId);

    const edges = getOutgoingEdges(graph, nodeId);
    for (const edge of edges) {
      const targetId = edge.targetNodeId;

      if (!visited.has(targetId)) {
        dfs(targetId);
      } else if (recursionStack.has(targetId)) {
        // Found a cycle - extract the cycle from pathStack
        const cycleStartIndex = pathStack.indexOf(targetId);
        const cycle = pathStack.slice(cycleStartIndex);
        cycle.push(targetId); // Complete the cycle
        cycles.push(cycle);
      }
    }

    pathStack.pop();
    recursionStack.delete(nodeId);
  }

  // Check all nodes (graph might have disconnected components)
  const allNodes = getAllNodes(graph);
  for (const node of allNodes) {
    if (!visited.has(node.id)) {
      dfs(node.id);
    }
  }

  return cycles;
}

/**
 * Get all nodes of type 'end' (story endings).
 */
export function getEndNodes(graph: StoryGraph): StoryNode[] {
  return getAllNodes(graph).filter((node) => node.nodeType === 'end');
}

/**
 * Find nodes with no incoming edges (except the start node).
 * These are "orphaned" nodes that can never be reached during normal play.
 */
export function getOrphanedNodes(graph: StoryGraph): StoryNode[] {
  const startNodeId = getStartNodeId(graph);
  const orphaned: StoryNode[] = [];

  const allNodes = getAllNodes(graph);
  for (const node of allNodes) {
    // Skip the start node
    if (node.id === startNodeId) continue;

    const incomingEdges = getIncomingEdges(graph, node.id);
    if (incomingEdges.length === 0) {
      orphaned.push(node);
    }
  }

  return orphaned;
}

/**
 * Find all unreachable nodes from the start node.
 * These nodes exist in the graph but cannot be reached during play.
 */
export function findUnreachableNodes(graph: StoryGraph): StoryNode[] {
  const startNodeId = getStartNodeId(graph);
  const reachable = findReachableNodes(graph, startNodeId);
  const unreachable: StoryNode[] = [];

  const allNodes = getAllNodes(graph);
  for (const node of allNodes) {
    if (!reachable.has(node.id)) {
      unreachable.push(node);
    }
  }

  return unreachable;
}

/**
 * Find dead-end nodes (nodes with no outgoing edges that are not 'end' nodes).
 * These represent potential story bugs where the player gets stuck.
 */
export function findDeadEndNodes(graph: StoryGraph): StoryNode[] {
  const deadEnds: StoryNode[] = [];

  const allNodes = getAllNodes(graph);
  for (const node of allNodes) {
    // 'end' nodes are supposed to have no outgoing edges
    if (node.nodeType === 'end') continue;

    const outgoingEdges = getOutgoingEdges(graph, node.id);
    if (outgoingEdges.length === 0) {
      deadEnds.push(node);
    }
  }

  return deadEnds;
}

/**
 * Perform a topological sort on the graph.
 * Returns an array of node IDs in topological order, or null if the graph has cycles.
 * Useful for analyzing story flow and dependencies.
 */
export function topologicalSort(graph: StoryGraph): string[] | null {
  // First check for cycles
  const cycles = detectCycles(graph);
  if (cycles.length > 0) {
    return null; // Can't do topological sort on graphs with cycles
  }

  const sorted: string[] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(nodeId: string): void {
    if (visited.has(nodeId)) return;

    visited.add(nodeId);
    recursionStack.add(nodeId);

    const edges = getOutgoingEdges(graph, nodeId);
    for (const edge of edges) {
      if (!visited.has(edge.targetNodeId)) {
        dfs(edge.targetNodeId);
      }
    }

    recursionStack.delete(nodeId);
    sorted.unshift(nodeId); // Add to beginning (reverse post-order)
  }

  // Visit all nodes (handle disconnected components)
  const allNodes = getAllNodes(graph);
  for (const node of allNodes) {
    if (!visited.has(node.id)) {
      dfs(node.id);
    }
  }

  return sorted;
}
