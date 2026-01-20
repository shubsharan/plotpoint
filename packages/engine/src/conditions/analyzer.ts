import type { EdgeCondition } from '@plotpoint/schemas';

/**
 * Get all game state keys required by a condition.
 * Useful for understanding what state variables a condition depends on.
 */
export function getRequiredStateKeys(condition: EdgeCondition): string[] {
  const keys: string[] = [];

  function traverse(cond: EdgeCondition): void {
    // Logical operators (and/or)
    if (cond.operator === 'and' || cond.operator === 'or') {
      if (cond.conditions) {
        for (const subCondition of cond.conditions) {
          traverse(subCondition);
        }
      }
      return;
    }

    // Comparison operators that use a key
    const keyBasedOps = ['equals', 'not_equals', 'greater_than', 'less_than', 'contains', 'not_contains'];
    if (keyBasedOps.includes(cond.operator) && cond.key) {
      keys.push(cond.key);
    }
  }

  traverse(condition);
  return Array.from(new Set(keys)); // Remove duplicates
}

/**
 * Get all inventory item IDs required by a condition.
 * Useful for understanding what items a condition depends on.
 */
export function getRequiredItems(condition: EdgeCondition): string[] {
  const items: string[] = [];

  function traverse(cond: EdgeCondition): void {
    // Logical operators (and/or)
    if (cond.operator === 'and' || cond.operator === 'or') {
      if (cond.conditions) {
        for (const subCondition of cond.conditions) {
          traverse(subCondition);
        }
      }
      return;
    }

    // Inventory operators
    if ((cond.operator === 'has_item' || cond.operator === 'not_has_item') && cond.value) {
      items.push(String(cond.value));
    }
  }

  traverse(condition);
  return Array.from(new Set(items)); // Remove duplicates
}

/**
 * Validate condition structure for correctness.
 * Returns validation result with error message if invalid.
 */
export function validateConditionStructure(condition: EdgeCondition): {
  valid: boolean;
  error?: string;
} {
  function validate(cond: EdgeCondition, path: string = ''): { valid: boolean; error?: string } {
    const currentPath = path ? `${path}.${cond.operator}` : cond.operator;

    // Validate logical operators (and/or)
    if (cond.operator === 'and' || cond.operator === 'or') {
      if (!cond.conditions || cond.conditions.length === 0) {
        return {
          valid: false,
          error: `Logical operator '${cond.operator}' at ${currentPath} requires at least one sub-condition`,
        };
      }

      // Recursively validate sub-conditions
      for (let i = 0; i < cond.conditions.length; i++) {
        const result = validate(cond.conditions[i], `${currentPath}[${i}]`);
        if (!result.valid) {
          return result;
        }
      }

      return { valid: true };
    }

    // Validate comparison operators (require key and value)
    const comparisonOps = ['equals', 'not_equals', 'greater_than', 'less_than', 'contains', 'not_contains'];
    if (comparisonOps.includes(cond.operator)) {
      if (!cond.key) {
        return {
          valid: false,
          error: `Comparison operator '${cond.operator}' at ${currentPath} requires a 'key' field`,
        };
      }
      if (cond.value === undefined) {
        return {
          valid: false,
          error: `Comparison operator '${cond.operator}' at ${currentPath} requires a 'value' field`,
        };
      }
      return { valid: true };
    }

    // Validate inventory operators (require value)
    if (cond.operator === 'has_item' || cond.operator === 'not_has_item') {
      if (cond.value === undefined) {
        return {
          valid: false,
          error: `Inventory operator '${cond.operator}' at ${currentPath} requires a 'value' field (item ID)`,
        };
      }
      return { valid: true };
    }

    // Unknown operator
    return {
      valid: false,
      error: `Unknown operator '${cond.operator}' at ${currentPath}`,
    };
  }

  return validate(condition);
}

/**
 * Count the total number of conditions (including nested ones).
 */
export function countConditions(condition: EdgeCondition): number {
  let count = 1; // Count this condition

  if ((condition.operator === 'and' || condition.operator === 'or') && condition.conditions) {
    for (const subCondition of condition.conditions) {
      count += countConditions(subCondition);
    }
  }

  return count;
}

/**
 * Get the maximum depth of nested conditions.
 */
export function getConditionDepth(condition: EdgeCondition): number {
  if ((condition.operator === 'and' || condition.operator === 'or') && condition.conditions) {
    let maxDepth = 0;
    for (const subCondition of condition.conditions) {
      maxDepth = Math.max(maxDepth, getConditionDepth(subCondition));
    }
    return 1 + maxDepth;
  }

  return 1;
}

/**
 * Simplify a condition by flattening nested AND/OR operators.
 * Example: and(and(a, b), c) -> and(a, b, c)
 */
export function simplifyCondition(condition: EdgeCondition): EdgeCondition {
  if (condition.operator !== 'and' && condition.operator !== 'or') {
    return condition;
  }

  if (!condition.conditions) {
    return condition;
  }

  const flattenedConditions: EdgeCondition[] = [];

  for (const subCondition of condition.conditions) {
    const simplified = simplifyCondition(subCondition);

    // Flatten if same operator
    if (simplified.operator === condition.operator && simplified.conditions) {
      flattenedConditions.push(...simplified.conditions);
    } else {
      flattenedConditions.push(simplified);
    }
  }

  return {
    ...condition,
    conditions: flattenedConditions,
  };
}

/**
 * Convert a condition to a human-readable string.
 */
export function conditionToString(condition: EdgeCondition): string {
  if (condition.operator === 'and' && condition.conditions) {
    return `(${condition.conditions.map(conditionToString).join(' AND ')})`;
  }

  if (condition.operator === 'or' && condition.conditions) {
    return `(${condition.conditions.map(conditionToString).join(' OR ')})`;
  }

  if (condition.operator === 'equals') {
    return `${condition.key} == ${JSON.stringify(condition.value)}`;
  }

  if (condition.operator === 'not_equals') {
    return `${condition.key} != ${JSON.stringify(condition.value)}`;
  }

  if (condition.operator === 'greater_than') {
    return `${condition.key} > ${condition.value}`;
  }

  if (condition.operator === 'less_than') {
    return `${condition.key} < ${condition.value}`;
  }

  if (condition.operator === 'contains') {
    return `${condition.key}.contains(${JSON.stringify(condition.value)})`;
  }

  if (condition.operator === 'not_contains') {
    return `!${condition.key}.contains(${JSON.stringify(condition.value)})`;
  }

  if (condition.operator === 'has_item') {
    return `has_item(${JSON.stringify(condition.value)})`;
  }

  if (condition.operator === 'not_has_item') {
    return `!has_item(${JSON.stringify(condition.value)})`;
  }

  return `UNKNOWN(${condition.operator})`;
}
