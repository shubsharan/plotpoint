import type { StoryEdge } from '@plotpoint/db';
import type { GameState, InventoryItem } from '@plotpoint/schemas';
import type { StoryGraph } from '../graph/story-graph';
import { getOutgoingEdges } from '../graph/story-graph';
import { evaluateCondition } from '../conditions';

/**
 * Resolved edges from a node, categorized by type and filtered by conditions.
 */
export interface ResolvedEdges {
  readonly all: readonly StoryEdge[]; // All edges from current node
  readonly available: readonly StoryEdge[]; // Edges that pass condition checks
  readonly default: StoryEdge | null; // First available default edge
  readonly choices: readonly StoryEdge[]; // Available choice edges
  readonly conditional: readonly StoryEdge[]; // Available conditional edges
}

/**
 * Resolve edges from a node, filtering by conditions and categorizing by type.
 * This is the core logic for determining which edges are traversable.
 */
export function resolveEdges(
  graph: StoryGraph,
  nodeId: string,
  gameState: GameState,
  inventory: InventoryItem[]
): ResolvedEdges {
  // Get all outgoing edges
  const allEdges = getOutgoingEdges(graph, nodeId);

  // Filter edges by conditions and sort by priority
  const available = filterAndSortEdges(allEdges, gameState, inventory);

  // Categorize edges
  const defaultEdges = available.filter((e) => e.edgeType === 'default');
  const choiceEdges = available.filter((e) => e.edgeType === 'choice');
  const conditionalEdges = available.filter((e) => e.edgeType === 'conditional');

  return {
    all: allEdges,
    available,
    default: defaultEdges[0] ?? null,
    choices: choiceEdges,
    conditional: conditionalEdges,
  };
}

/**
 * Filter edges by conditions and sort by priority.
 */
export function filterAndSortEdges(
  edges: StoryEdge[],
  gameState: GameState,
  inventory: InventoryItem[]
): StoryEdge[] {
  // Filter by conditions
  const filtered = edges.filter((edge) => canTraverseEdge(edge, gameState, inventory));

  // Sort by priority (lower priority number = higher precedence)
  return sortEdgesByPriority(filtered);
}

/**
 * Check if an edge can be traversed given current game state and inventory.
 * Returns true if the edge's conditions are satisfied (or has no conditions).
 */
export function canTraverseEdge(
  edge: StoryEdge,
  gameState: GameState,
  inventory: InventoryItem[]
): boolean {
  // Default and choice edges with no conditions are always traversable
  if (!edge.condition) return true;

  // Conditional edges must pass their condition check
  return evaluateCondition(edge.condition, gameState, inventory);
}

/**
 * Sort edges by priority (ascending order).
 * Lower priority numbers come first.
 */
export function sortEdgesByPriority(edges: StoryEdge[]): StoryEdge[] {
  return [...edges].sort((a, b) => a.priority - b.priority);
}

/**
 * Find the first available default edge from resolved edges.
 */
export function getDefaultEdge(resolved: ResolvedEdges): StoryEdge | null {
  return resolved.default;
}

/**
 * Get all available choice edges from resolved edges.
 */
export function getChoiceEdges(resolved: ResolvedEdges): StoryEdge[] {
  return Array.from(resolved.choices);
}

/**
 * Get all available conditional edges from resolved edges.
 */
export function getConditionalEdges(resolved: ResolvedEdges): StoryEdge[] {
  return Array.from(resolved.conditional);
}

/**
 * Check if a specific edge ID is available (exists and passes conditions).
 */
export function isEdgeAvailable(resolved: ResolvedEdges, edgeId: string): boolean {
  return resolved.available.some((edge) => edge.id === edgeId);
}

/**
 * Get an edge by ID from all edges.
 */
export function getEdgeById(resolved: ResolvedEdges, edgeId: string): StoryEdge | null {
  return resolved.all.find((edge) => edge.id === edgeId) ?? null;
}

/**
 * Check if there are any available edges from the current node.
 */
export function hasAvailableEdges(resolved: ResolvedEdges): boolean {
  return resolved.available.length > 0;
}

/**
 * Get summary of resolved edges (useful for debugging).
 */
export function getResolvedEdgesSummary(resolved: ResolvedEdges): {
  total: number;
  available: number;
  default: number;
  choices: number;
  conditional: number;
} {
  return {
    total: resolved.all.length,
    available: resolved.available.length,
    default: resolved.default ? 1 : 0,
    choices: resolved.choices.length,
    conditional: resolved.conditional.length,
  };
}
