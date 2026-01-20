import type {
  GameState,
  InventoryItem,
  ChoiceHistoryEntry,
  StorySession,
} from '@plotpoint/schemas';

/**
 * Immutable session state for story execution.
 * All mutation functions return new instances.
 */
export interface SessionState {
  readonly currentNodeId: string | null;
  readonly gameState: Readonly<GameState>;
  readonly inventory: readonly InventoryItem[];
  readonly visitedNodes: ReadonlySet<string>;
  readonly choiceHistory: readonly ChoiceHistoryEntry[];
}

/**
 * Create a new session state from optional initial data.
 */
export function createSessionState(initial?: Partial<StorySession>): SessionState {
  return {
    currentNodeId: initial?.currentNodeId ?? null,
    gameState: { ...(initial?.gameState ?? {}) },
    inventory: [...(initial?.inventory ?? [])],
    visitedNodes: new Set(initial?.visitedNodes ?? []),
    choiceHistory: [...(initial?.choiceHistory ?? [])],
  };
}

// =============================================================================
// GETTERS (Pure functions)
// =============================================================================

/**
 * Get the current node ID.
 */
export function getCurrentNodeId(state: SessionState): string | null {
  return state.currentNodeId;
}

/**
 * Get the entire game state object.
 */
export function getGameState(state: SessionState): GameState {
  return { ...state.gameState };
}

/**
 * Get a specific value from game state.
 */
export function getStateValue<T = unknown>(state: SessionState, key: string): T | undefined {
  return state.gameState[key] as T | undefined;
}

/**
 * Get the inventory as a mutable array (returns copy).
 */
export function getInventory(state: SessionState): InventoryItem[] {
  return state.inventory.map((item) => ({ ...item }));
}

/**
 * Get a specific inventory item by ID.
 */
export function getInventoryItem(state: SessionState, itemId: string): InventoryItem | null {
  const item = state.inventory.find((i) => i.id === itemId);
  return item ? { ...item } : null;
}

/**
 * Check if the inventory contains an item with quantity > 0.
 */
export function hasItem(state: SessionState, itemId: string): boolean {
  const item = state.inventory.find((i) => i.id === itemId);
  return item !== undefined && item.quantity > 0;
}

/**
 * Get visited nodes as an array.
 */
export function getVisitedNodes(state: SessionState): string[] {
  return Array.from(state.visitedNodes);
}

/**
 * Check if a node has been visited.
 */
export function hasVisited(state: SessionState, nodeId: string): boolean {
  return state.visitedNodes.has(nodeId);
}

/**
 * Get choice history as an array (returns copy).
 */
export function getChoiceHistory(state: SessionState): ChoiceHistoryEntry[] {
  return [...state.choiceHistory];
}

// =============================================================================
// MUTATIONS (Return new state - immutable)
// =============================================================================

/**
 * Set the current node ID and mark it as visited.
 */
export function setCurrentNode(state: SessionState, nodeId: string): SessionState {
  const newVisited = new Set(state.visitedNodes);
  newVisited.add(nodeId);

  return {
    ...state,
    currentNodeId: nodeId,
    visitedNodes: newVisited,
  };
}

/**
 * Update game state with partial updates.
 * Performs a shallow merge with existing state.
 */
export function updateGameState(
  state: SessionState,
  updates: Partial<GameState>
): SessionState {
  return {
    ...state,
    gameState: {
      ...state.gameState,
      ...updates,
    },
  };
}

/**
 * Add an item to inventory.
 * If item exists, increases quantity. Otherwise adds new item.
 */
export function addInventoryItem(state: SessionState, item: InventoryItem): SessionState {
  const inventory = [...state.inventory];
  const existingIndex = inventory.findIndex((i) => i.id === item.id);

  if (existingIndex !== -1) {
    // Update existing item quantity
    inventory[existingIndex] = {
      ...inventory[existingIndex],
      quantity: inventory[existingIndex].quantity + item.quantity,
    };
  } else {
    // Add new item
    inventory.push({ ...item });
  }

  return {
    ...state,
    inventory,
  };
}

/**
 * Remove an item from inventory (or reduce quantity).
 * If quantity becomes 0 or less, removes the item entirely.
 */
export function removeInventoryItem(
  state: SessionState,
  itemId: string,
  quantity: number = 1
): SessionState {
  const inventory = [...state.inventory];
  const existingIndex = inventory.findIndex((i) => i.id === itemId);

  if (existingIndex === -1) {
    // Item doesn't exist, return unchanged
    return state;
  }

  const newQuantity = inventory[existingIndex].quantity - quantity;

  if (newQuantity <= 0) {
    // Remove item entirely
    inventory.splice(existingIndex, 1);
  } else {
    // Update quantity
    inventory[existingIndex] = {
      ...inventory[existingIndex],
      quantity: newQuantity,
    };
  }

  return {
    ...state,
    inventory,
  };
}

/**
 * Update an inventory item completely (replaces existing item).
 */
export function updateInventoryItem(state: SessionState, item: InventoryItem): SessionState {
  const inventory = [...state.inventory];
  const existingIndex = inventory.findIndex((i) => i.id === item.id);

  if (existingIndex !== -1) {
    inventory[existingIndex] = { ...item };
  } else {
    // Item doesn't exist, add it
    inventory.push({ ...item });
  }

  return {
    ...state,
    inventory,
  };
}

/**
 * Mark a node as visited (doesn't change current node).
 */
export function markVisited(state: SessionState, nodeId: string): SessionState {
  if (state.visitedNodes.has(nodeId)) {
    return state; // Already visited, return unchanged
  }

  const newVisited = new Set(state.visitedNodes);
  newVisited.add(nodeId);

  return {
    ...state,
    visitedNodes: newVisited,
  };
}

/**
 * Add a choice to the history.
 */
export function addChoice(state: SessionState, entry: ChoiceHistoryEntry): SessionState {
  return {
    ...state,
    choiceHistory: [...state.choiceHistory, { ...entry }],
  };
}

/**
 * Clear all state (useful for restarts).
 */
export function clearState(state: SessionState, startNodeId: string): SessionState {
  return {
    currentNodeId: startNodeId,
    gameState: {},
    inventory: [],
    visitedNodes: new Set([startNodeId]),
    choiceHistory: [],
  };
}

// =============================================================================
// SERIALIZATION
// =============================================================================

/**
 * Serialize session state to JSON-compatible format for persistence.
 */
export function serializeSessionState(state: SessionState): Partial<StorySession> {
  return {
    currentNodeId: state.currentNodeId,
    gameState: { ...state.gameState },
    inventory: state.inventory.map((item) => ({ ...item })),
    visitedNodes: Array.from(state.visitedNodes),
    choiceHistory: [...state.choiceHistory],
  };
}

/**
 * Deserialize session state from persisted data.
 */
export function deserializeSessionState(data: Partial<StorySession>): SessionState {
  return createSessionState(data);
}

/**
 * Create a complete copy of session state.
 */
export function cloneSessionState(state: SessionState): SessionState {
  return {
    currentNodeId: state.currentNodeId,
    gameState: { ...state.gameState },
    inventory: state.inventory.map((item) => ({ ...item })),
    visitedNodes: new Set(state.visitedNodes),
    choiceHistory: [...state.choiceHistory],
  };
}
