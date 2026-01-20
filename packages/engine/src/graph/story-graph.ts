import type { StoryNode, StoryEdge } from '@plotpoint/db';
import type { ComponentTypeName } from '@plotpoint/schemas';

/**
 * Immutable graph structure representing a story's nodes and edges.
 * Uses ReadonlyMap for O(1) lookups while maintaining immutability.
 */
export interface StoryGraph {
  readonly nodes: ReadonlyMap<string, StoryNode>;
  readonly edges: ReadonlyMap<string, StoryEdge>;
  readonly edgesBySource: ReadonlyMap<string, readonly StoryEdge[]>;
  readonly edgesByTarget: ReadonlyMap<string, readonly StoryEdge[]>;
  readonly startNodeId: string;
}

/**
 * Create a StoryGraph from arrays of nodes and edges.
 * Builds indexes for efficient edge lookup by source/target.
 */
export function createStoryGraph(
  nodes: StoryNode[],
  edges: StoryEdge[],
  startNodeId: string
): StoryGraph {
  // Build node map
  const nodeMap = new Map<string, StoryNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // Build edge map
  const edgeMap = new Map<string, StoryEdge>();
  for (const edge of edges) {
    edgeMap.set(edge.id, edge);
  }

  // Build edge indexes
  const edgesBySourceMap = new Map<string, StoryEdge[]>();
  const edgesByTargetMap = new Map<string, StoryEdge[]>();

  for (const edge of edges) {
    // Index by source
    if (!edgesBySourceMap.has(edge.sourceNodeId)) {
      edgesBySourceMap.set(edge.sourceNodeId, []);
    }
    edgesBySourceMap.get(edge.sourceNodeId)!.push(edge);

    // Index by target
    if (!edgesByTargetMap.has(edge.targetNodeId)) {
      edgesByTargetMap.set(edge.targetNodeId, []);
    }
    edgesByTargetMap.get(edge.targetNodeId)!.push(edge);
  }

  return {
    nodes: nodeMap,
    edges: edgeMap,
    edgesBySource: edgesBySourceMap,
    edgesByTarget: edgesByTargetMap,
    startNodeId,
  };
}

/**
 * Get a node by ID. Returns null if not found.
 */
export function getNode(graph: StoryGraph, nodeId: string): StoryNode | null {
  return graph.nodes.get(nodeId) ?? null;
}

/**
 * Get an edge by ID. Returns null if not found.
 */
export function getEdge(graph: StoryGraph, edgeId: string): StoryEdge | null {
  return graph.edges.get(edgeId) ?? null;
}

/**
 * Get all outgoing edges from a node (edges where this node is the source).
 */
export function getOutgoingEdges(graph: StoryGraph, nodeId: string): StoryEdge[] {
  return Array.from(graph.edgesBySource.get(nodeId) ?? []);
}

/**
 * Get all incoming edges to a node (edges where this node is the target).
 */
export function getIncomingEdges(graph: StoryGraph, nodeId: string): StoryEdge[] {
  return Array.from(graph.edgesByTarget.get(nodeId) ?? []);
}

/**
 * Get all nodes in the graph.
 */
export function getAllNodes(graph: StoryGraph): StoryNode[] {
  return Array.from(graph.nodes.values());
}

/**
 * Get all edges in the graph.
 */
export function getAllEdges(graph: StoryGraph): StoryEdge[] {
  return Array.from(graph.edges.values());
}

/**
 * Get all nodes of a specific component type.
 */
export function getNodesByType(graph: StoryGraph, type: ComponentTypeName): StoryNode[] {
  return getAllNodes(graph).filter((node) => node.nodeType === type);
}

/**
 * Get the total number of nodes in the graph.
 */
export function getNodeCount(graph: StoryGraph): number {
  return graph.nodes.size;
}

/**
 * Get the total number of edges in the graph.
 */
export function getEdgeCount(graph: StoryGraph): number {
  return graph.edges.size;
}

/**
 * Get the start node ID for the graph.
 */
export function getStartNodeId(graph: StoryGraph): string {
  return graph.startNodeId;
}

/**
 * Check if a node exists in the graph.
 */
export function hasNode(graph: StoryGraph, nodeId: string): boolean {
  return graph.nodes.has(nodeId);
}

/**
 * Check if an edge exists in the graph.
 */
export function hasEdge(graph: StoryGraph, edgeId: string): boolean {
  return graph.edges.has(edgeId);
}
