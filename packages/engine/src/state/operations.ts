import type { GameState, InventoryItem } from '@plotpoint/schemas';
import type { SessionState } from './session-state';

/**
 * Represents a diff between two session states.
 */
export interface StateDiff {
  gameStateChanges: Partial<GameState>;
  inventoryChanges: InventoryChange[];
  nodesVisited: string[];
  currentNodeChanged: boolean;
}

/**
 * Represents a change to an inventory item.
 */
export interface InventoryChange {
  type: 'added' | 'removed' | 'updated';
  item: InventoryItem;
  previousQuantity?: number;
}

/**
 * Merge two game state objects.
 * Performs a shallow merge (updates override base).
 */
export function mergeGameState(base: GameState, updates: Partial<GameState>): GameState {
  return {
    ...base,
    ...updates,
  };
}

/**
 * Apply an inventory action to an inventory array.
 * Returns a new array with the action applied.
 */
export function applyInventoryAction(
  inventory: InventoryItem[],
  item: InventoryItem,
  action: 'add' | 'remove' | 'update'
): InventoryItem[] {
  const newInventory = [...inventory];
  const existingIndex = newInventory.findIndex((i) => i.id === item.id);

  switch (action) {
    case 'add': {
      if (existingIndex !== -1) {
        // Item exists, increase quantity
        newInventory[existingIndex] = {
          ...newInventory[existingIndex],
          quantity: newInventory[existingIndex].quantity + item.quantity,
        };
      } else {
        // Item doesn't exist, add it
        newInventory.push({ ...item });
      }
      break;
    }

    case 'remove': {
      if (existingIndex !== -1) {
        const newQuantity = newInventory[existingIndex].quantity - item.quantity;
        if (newQuantity <= 0) {
          // Remove item entirely
          newInventory.splice(existingIndex, 1);
        } else {
          // Update quantity
          newInventory[existingIndex] = {
            ...newInventory[existingIndex],
            quantity: newQuantity,
          };
        }
      }
      break;
    }

    case 'update': {
      if (existingIndex !== -1) {
        // Replace existing item
        newInventory[existingIndex] = { ...item };
      } else {
        // Item doesn't exist, add it
        newInventory.push({ ...item });
      }
      break;
    }
  }

  return newInventory;
}

/**
 * Compute the difference between two session states.
 * Useful for understanding what changed during execution.
 */
export function computeStateDiff(before: SessionState, after: SessionState): StateDiff {
  // Compute game state changes
  const gameStateChanges: Partial<GameState> = {};
  for (const key of Object.keys(after.gameState)) {
    if (after.gameState[key] !== before.gameState[key]) {
      gameStateChanges[key] = after.gameState[key];
    }
  }

  // Compute inventory changes
  const inventoryChanges: InventoryChange[] = [];
  const beforeInventoryMap = new Map(before.inventory.map((item) => [item.id, item]));
  const afterInventoryMap = new Map(after.inventory.map((item) => [item.id, item]));

  // Check for added and updated items
  for (const [itemId, afterItem] of afterInventoryMap) {
    const beforeItem = beforeInventoryMap.get(itemId);
    if (!beforeItem) {
      inventoryChanges.push({
        type: 'added',
        item: afterItem,
      });
    } else if (
      beforeItem.quantity !== afterItem.quantity ||
      JSON.stringify(beforeItem.metadata) !== JSON.stringify(afterItem.metadata)
    ) {
      inventoryChanges.push({
        type: 'updated',
        item: afterItem,
        previousQuantity: beforeItem.quantity,
      });
    }
  }

  // Check for removed items
  for (const [itemId, beforeItem] of beforeInventoryMap) {
    if (!afterInventoryMap.has(itemId)) {
      inventoryChanges.push({
        type: 'removed',
        item: beforeItem,
        previousQuantity: beforeItem.quantity,
      });
    }
  }

  // Compute newly visited nodes
  const nodesVisited: string[] = [];
  for (const nodeId of after.visitedNodes) {
    if (!before.visitedNodes.has(nodeId)) {
      nodesVisited.push(nodeId);
    }
  }

  // Check if current node changed
  const currentNodeChanged = before.currentNodeId !== after.currentNodeId;

  return {
    gameStateChanges,
    inventoryChanges,
    nodesVisited,
    currentNodeChanged,
  };
}

/**
 * Deep clone a game state object.
 */
export function cloneGameState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state));
}

/**
 * Deep clone an inventory array.
 */
export function cloneInventory(inventory: InventoryItem[]): InventoryItem[] {
  return inventory.map((item) => ({
    ...item,
    metadata: item.metadata ? { ...item.metadata } : undefined,
  }));
}

/**
 * Check if two game states are equal (shallow comparison).
 */
export function isGameStateEqual(a: GameState, b: GameState): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }

  return true;
}

/**
 * Check if two inventory arrays are equal.
 */
export function isInventoryEqual(a: InventoryItem[], b: InventoryItem[]): boolean {
  if (a.length !== b.length) return false;

  const aMap = new Map(a.map((item) => [item.id, item]));
  const bMap = new Map(b.map((item) => [item.id, item]));

  for (const [id, itemA] of aMap) {
    const itemB = bMap.get(id);
    if (!itemB || itemA.quantity !== itemB.quantity) return false;
  }

  return true;
}
