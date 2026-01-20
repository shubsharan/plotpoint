import type {
  StoryNode,
  GameState,
  InventoryItem,
  StoryManifest,
  StorySession,
} from '@plotpoint/schemas';
import type { StoryGraph } from '../graph/story-graph';
import type { SessionState } from '../state/session-state';
import type { ResolvedEdges } from './edge-resolver';
import type { EngineEvent } from '../events/event-emitter';
import { getNode, getEdge, getStartNodeId } from '../graph/story-graph';
import {
  createSessionState,
  setCurrentNode,
  updateGameState as updateSessionGameState,
  addInventoryItem,
  removeInventoryItem,
  updateInventoryItem,
  serializeSessionState,
  addChoice,
  clearState,
} from '../state/session-state';
import { resolveEdges, isEdgeAvailable } from './edge-resolver';

/**
 * Configuration for creating a story executor.
 */
export interface ExecutorConfig {
  graph: StoryGraph;
  manifest?: StoryManifest;
  initialState?: Partial<StorySession>;
  onEvent?: (event: EngineEvent) => void;
}

/**
 * Current execution context - snapshot of the story state.
 */
export interface ExecutionContext {
  readonly currentNode: StoryNode | null;
  readonly resolvedEdges: ResolvedEdges;
  readonly gameState: GameState;
  readonly inventory: InventoryItem[];
  readonly visitedNodes: string[];
  readonly isComplete: boolean;
  readonly isAtEndNode: boolean;
}

/**
 * Story executor interface - manages story execution and state.
 */
export interface StoryExecutor {
  // Queries (pure, no side effects)
  getContext: () => ExecutionContext;
  getState: () => SessionState;
  getGraph: () => StoryGraph;
  canNavigate: (edgeId: string) => boolean;
  isAtEndNode: () => boolean;

  // Mutations (update internal state, emit events)
  start: () => ExecutionContext;
  reset: () => ExecutionContext;
  navigate: (edgeId: string) => ExecutionContext;
  navigateToNode: (nodeId: string) => ExecutionContext;
  completeCurrentNode: () => ExecutionContext;
  updateGameState: (updates: Partial<GameState>) => void;
  updateInventory: (item: InventoryItem, action: 'add' | 'remove' | 'update') => void;

  // Persistence
  serialize: () => Partial<StorySession>;
  restore: (session: Partial<StorySession>) => void;
}

/**
 * Create a story executor.
 * Uses closure pattern to maintain internal state.
 */
export function createStoryExecutor(config: ExecutorConfig): StoryExecutor {
  const { graph, manifest, initialState, onEvent } = config;

  // Internal mutable state
  let state: SessionState = createSessionState(initialState);
  let currentContext: ExecutionContext | null = null;

  // Helper: Emit an event
  function emitEvent(event: EngineEvent): void {
    if (onEvent) {
      onEvent(event);
    }
  }

  // Helper: Build execution context from current state
  function buildContext(): ExecutionContext {
    const currentNodeId = state.currentNodeId;
    const currentNode = currentNodeId ? getNode(graph, currentNodeId) : null;

    const resolvedEdges = currentNodeId
      ? resolveEdges(graph, currentNodeId, state.gameState, Array.from(state.inventory))
      : {
          all: [],
          available: [],
          default: null,
          choices: [],
          conditional: [],
        };

    const isAtEndNode = currentNode?.nodeType === 'end';
    const isComplete = isAtEndNode && resolvedEdges.available.length === 0;

    return {
      currentNode,
      resolvedEdges,
      gameState: { ...state.gameState },
      inventory: Array.from(state.inventory).map((item) => ({ ...item })),
      visitedNodes: Array.from(state.visitedNodes),
      isComplete,
      isAtEndNode,
    };
  }

  // Helper: Update context cache
  function updateContext(): ExecutionContext {
    currentContext = buildContext();
    return currentContext;
  }

  // Initialize context
  if (state.currentNodeId) {
    updateContext();
  }

  // =============================================================================
  // QUERIES
  // =============================================================================

  function getContext(): ExecutionContext {
    if (!currentContext) {
      currentContext = buildContext();
    }
    return currentContext;
  }

  function getState(): SessionState {
    return { ...state };
  }

  function getGraph(): StoryGraph {
    return graph;
  }

  function canNavigate(edgeId: string): boolean {
    const context = getContext();
    return isEdgeAvailable(context.resolvedEdges, edgeId);
  }

  function isAtEndNode(): boolean {
    return getContext().isAtEndNode;
  }

  // =============================================================================
  // MUTATIONS
  // =============================================================================

  function start(): ExecutionContext {
    const startNodeId = getStartNodeId(graph);
    state = setCurrentNode(state, startNodeId);

    emitEvent({
      type: 'STORY_STARTED',
      timestamp: Date.now(),
      nodeId: startNodeId,
    });

    emitEvent({
      type: 'NODE_ENTERED',
      timestamp: Date.now(),
      nodeId: startNodeId,
    });

    return updateContext();
  }

  function reset(): ExecutionContext {
    const startNodeId = getStartNodeId(graph);
    state = clearState(state, startNodeId);

    emitEvent({
      type: 'STORY_RESTARTED',
      timestamp: Date.now(),
      nodeId: startNodeId,
    });

    emitEvent({
      type: 'NODE_ENTERED',
      timestamp: Date.now(),
      nodeId: startNodeId,
    });

    return updateContext();
  }

  function navigateToNode(nodeId: string): ExecutionContext {
    const previousNodeId = state.currentNodeId;

    // Check if node exists
    const targetNode = getNode(graph, nodeId);
    if (!targetNode) {
      throw new Error(`Cannot navigate to non-existent node: ${nodeId}`);
    }

    // Update state
    state = setCurrentNode(state, nodeId);

    // Emit events
    if (previousNodeId) {
      emitEvent({
        type: 'NODE_EXITED',
        timestamp: Date.now(),
        nodeId: previousNodeId,
      });
    }

    emitEvent({
      type: 'NODE_ENTERED',
      timestamp: Date.now(),
      nodeId,
    });

    // Check if story is complete
    const context = updateContext();
    if (context.isComplete) {
      emitEvent({
        type: 'STORY_COMPLETED',
        timestamp: Date.now(),
        nodeId,
      });
    }

    return context;
  }

  function navigate(edgeId: string): ExecutionContext {
    // Get current context
    const context = getContext();

    // Check if edge is available
    if (!isEdgeAvailable(context.resolvedEdges, edgeId)) {
      throw new Error(`Cannot navigate via unavailable edge: ${edgeId}`);
    }

    // Get edge
    const edge = getEdge(graph, edgeId);
    if (!edge) {
      throw new Error(`Cannot navigate via non-existent edge: ${edgeId}`);
    }

    // Record choice in history
    if (state.currentNodeId) {
      state = addChoice(state, {
        nodeId: state.currentNodeId,
        edgeId,
        timestamp: new Date().toISOString(),
      });
    }

    // Emit edge traversed event
    emitEvent({
      type: 'EDGE_TRAVERSED',
      timestamp: Date.now(),
      nodeId: state.currentNodeId ?? undefined,
      edgeId,
      data: {
        edgeType: edge.edgeType,
        targetNodeId: edge.targetNodeId,
      },
    });

    // Navigate to target node
    return navigateToNode(edge.targetNodeId);
  }

  function completeCurrentNode(): ExecutionContext {
    const context = getContext();

    // Find default edge
    const defaultEdge = context.resolvedEdges.default;
    if (!defaultEdge) {
      throw new Error('Cannot complete node: no default edge available');
    }

    // Navigate via default edge
    return navigate(defaultEdge.id);
  }

  function updateGameState(updates: Partial<GameState>): void {
    state = updateSessionGameState(state, updates);
    updateContext();

    emitEvent({
      type: 'STATE_UPDATED',
      timestamp: Date.now(),
      nodeId: state.currentNodeId ?? undefined,
      data: { updates },
    });
  }

  function updateInventory(
    item: InventoryItem,
    action: 'add' | 'remove' | 'update'
  ): void {
    switch (action) {
      case 'add':
        state = addInventoryItem(state, item);
        break;
      case 'remove':
        state = removeInventoryItem(state, item.id, item.quantity);
        break;
      case 'update':
        state = updateInventoryItem(state, item);
        break;
    }

    updateContext();

    emitEvent({
      type: 'INVENTORY_CHANGED',
      timestamp: Date.now(),
      nodeId: state.currentNodeId ?? undefined,
      data: { item, action },
    });
  }

  // =============================================================================
  // PERSISTENCE
  // =============================================================================

  function serialize(): Partial<StorySession> {
    return serializeSessionState(state);
  }

  function restore(session: Partial<StorySession>): void {
    state = createSessionState(session);
    updateContext();
  }

  // =============================================================================
  // RETURN EXECUTOR INTERFACE
  // =============================================================================

  return {
    // Queries
    getContext,
    getState,
    getGraph,
    canNavigate,
    isAtEndNode,

    // Mutations
    start,
    reset,
    navigate,
    navigateToNode,
    completeCurrentNode,
    updateGameState,
    updateInventory,

    // Persistence
    serialize,
    restore,
  };
}
