import type { EdgeCondition } from '@plotpoint/schemas';

/**
 * Fluent condition builder functions for creating edge conditions programmatically.
 */

/**
 * Create an AND condition that requires all sub-conditions to pass.
 */
export function and(...conditions: EdgeCondition[]): EdgeCondition {
  return {
    operator: 'and',
    conditions,
  };
}

/**
 * Create an OR condition that requires at least one sub-condition to pass.
 */
export function or(...conditions: EdgeCondition[]): EdgeCondition {
  return {
    operator: 'or',
    conditions,
  };
}

/**
 * Create an equals condition (gameState[key] === value).
 */
export function equals(key: string, value: unknown): EdgeCondition {
  return {
    operator: 'equals',
    key,
    value,
  };
}

/**
 * Create a not equals condition (gameState[key] !== value).
 */
export function notEquals(key: string, value: unknown): EdgeCondition {
  return {
    operator: 'not_equals',
    key,
    value,
  };
}

/**
 * Create a greater than condition (gameState[key] > value).
 */
export function greaterThan(key: string, value: number): EdgeCondition {
  return {
    operator: 'greater_than',
    key,
    value,
  };
}

/**
 * Create a less than condition (gameState[key] < value).
 */
export function lessThan(key: string, value: number): EdgeCondition {
  return {
    operator: 'less_than',
    key,
    value,
  };
}

/**
 * Create a contains condition (gameState[key].includes(value)).
 */
export function contains(key: string, value: string): EdgeCondition {
  return {
    operator: 'contains',
    key,
    value,
  };
}

/**
 * Create a not contains condition (!gameState[key].includes(value)).
 */
export function notContains(key: string, value: string): EdgeCondition {
  return {
    operator: 'not_contains',
    key,
    value,
  };
}

/**
 * Create a has item condition (inventory contains item with quantity > 0).
 */
export function hasItem(itemId: string): EdgeCondition {
  return {
    operator: 'has_item',
    value: itemId,
  };
}

/**
 * Create a not has item condition (inventory doesn't contain item or quantity is 0).
 */
export function notHasItem(itemId: string): EdgeCondition {
  return {
    operator: 'not_has_item',
    value: itemId,
  };
}

/**
 * Namespace for condition builders (alternative API).
 */
export const conditions = {
  and,
  or,
  equals,
  notEquals,
  greaterThan,
  lessThan,
  contains,
  notContains,
  hasItem,
  notHasItem,
};

// Example usage:
// const condition = and(
//   equals('hasKey', true),
//   or(
//     hasItem('golden_key'),
//     greaterThan('lockpickSkill', 5)
//   )
// );
