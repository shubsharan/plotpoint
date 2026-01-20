import type { EdgeCondition, GameState, InventoryItem } from '@plotpoint/schemas';

/**
 * Evaluate an edge condition against the current game state and inventory.
 * Returns true if the condition passes, false otherwise.
 */
export function evaluateCondition(
  condition: EdgeCondition | null | undefined,
  gameState: GameState,
  inventory: InventoryItem[]
): boolean {
  // Null/undefined conditions always pass
  if (!condition) return true;

  switch (condition.operator) {
    case 'equals':
      return condition.key !== undefined && gameState[condition.key] === condition.value;

    case 'not_equals':
      return condition.key !== undefined && gameState[condition.key] !== condition.value;

    case 'greater_than': {
      if (condition.key === undefined) return false;
      const stateValue = gameState[condition.key];
      const compareValue = condition.value;
      if (typeof stateValue !== 'number' || typeof compareValue !== 'number') return false;
      return stateValue > compareValue;
    }

    case 'less_than': {
      if (condition.key === undefined) return false;
      const stateValue = gameState[condition.key];
      const compareValue = condition.value;
      if (typeof stateValue !== 'number' || typeof compareValue !== 'number') return false;
      return stateValue < compareValue;
    }

    case 'contains': {
      if (condition.key === undefined) return false;
      const stateValue = gameState[condition.key];
      if (typeof stateValue !== 'string') return false;
      return stateValue.includes(String(condition.value));
    }

    case 'not_contains': {
      if (condition.key === undefined) return false;
      const stateValue = gameState[condition.key];
      if (typeof stateValue !== 'string') return false;
      return !stateValue.includes(String(condition.value));
    }

    case 'has_item':
      return inventory.some(
        (item) => item.id === condition.value && item.quantity > 0
      );

    case 'not_has_item':
      return !inventory.some(
        (item) => item.id === condition.value && item.quantity > 0
      );

    case 'and':
      return (condition.conditions ?? []).every((c) =>
        evaluateCondition(c, gameState, inventory)
      );

    case 'or':
      return (condition.conditions ?? []).some((c) =>
        evaluateCondition(c, gameState, inventory)
      );

    default:
      console.warn(`Unknown condition operator: ${condition.operator}`);
      return true;
  }
}

/**
 * Filter edges based on their conditions
 */
export function filterEdgesByCondition<T extends { condition?: EdgeCondition | null }>(
  edges: T[],
  gameState: GameState,
  inventory: InventoryItem[]
): T[] {
  return edges.filter((edge) => evaluateCondition(edge.condition, gameState, inventory));
}

/**
 * Check if a specific condition type is met
 */
export function checkCondition(
  operator: EdgeCondition['operator'],
  gameState: GameState,
  inventory: InventoryItem[],
  key?: string,
  value?: unknown
): boolean {
  return evaluateCondition({ operator, key, value }, gameState, inventory);
}
