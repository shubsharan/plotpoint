import type { EdgeCondition } from '@plotpoint/schemas';
import type { StoryGraph } from './story-graph';
import {
  getNode,
  getEdge,
  getAllNodes,
  getAllEdges,
  getStartNodeId,
  hasNode,
} from './story-graph';
import {
  findUnreachableNodes,
  findDeadEndNodes,
  detectCycles,
  getOrphanedNodes,
} from './traversal';
import { componentRegistry } from '../registry/component-registry';

/**
 * Validation error codes
 */
export type ValidationErrorCode =
  | 'MISSING_START'
  | 'UNREACHABLE_NODE'
  | 'DEAD_END'
  | 'INVALID_EDGE_TARGET'
  | 'INVALID_EDGE_SOURCE'
  | 'CYCLE_DETECTED'
  | 'INVALID_CONDITION'
  | 'MISSING_COMPONENT_TYPE'
  | 'ORPHANED_NODE'
  | 'EMPTY_GRAPH';

/**
 * Validation warning codes
 */
export type ValidationWarningCode =
  | 'NO_END_NODES'
  | 'MULTIPLE_START_EDGES'
  | 'UNREGISTERED_COMPONENT'
  | 'ORPHANED_NODE';

/**
 * Validation error
 */
export interface ValidationError {
  code: ValidationErrorCode;
  nodeId?: string;
  edgeId?: string;
  message: string;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  code: ValidationWarningCode;
  nodeId?: string;
  edgeId?: string;
  message: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Validate the entire story graph.
 * Checks for structural issues, reachability, and edge validity.
 */
export function validateGraph(graph: StoryGraph): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check if graph is empty
  const allNodes = getAllNodes(graph);
  if (allNodes.length === 0) {
    errors.push({
      code: 'EMPTY_GRAPH',
      message: 'Graph has no nodes',
    });
    return { valid: false, errors, warnings };
  }

  // Check if start node exists
  const startNodeId = getStartNodeId(graph);
  const startNode = getNode(graph, startNodeId);
  if (!startNode) {
    errors.push({
      code: 'MISSING_START',
      nodeId: startNodeId,
      message: `Start node '${startNodeId}' does not exist in the graph`,
    });
  }

  // Check for invalid edge targets and sources
  const allEdges = getAllEdges(graph);
  for (const edge of allEdges) {
    if (!hasNode(graph, edge.sourceNodeId)) {
      errors.push({
        code: 'INVALID_EDGE_SOURCE',
        edgeId: edge.id,
        nodeId: edge.sourceNodeId,
        message: `Edge '${edge.id}' has invalid source node '${edge.sourceNodeId}'`,
      });
    }

    if (!hasNode(graph, edge.targetNodeId)) {
      errors.push({
        code: 'INVALID_EDGE_TARGET',
        edgeId: edge.id,
        nodeId: edge.targetNodeId,
        message: `Edge '${edge.id}' has invalid target node '${edge.targetNodeId}'`,
      });
    }
  }

  // Check for unreachable nodes
  const unreachable = findUnreachableNodes(graph);
  for (const node of unreachable) {
    errors.push({
      code: 'UNREACHABLE_NODE',
      nodeId: node.id,
      message: `Node '${node.nodeKey}' (${node.nodeType}) is unreachable from the start node`,
    });
  }

  // Check for dead-end nodes (non-end nodes with no outgoing edges)
  const deadEnds = findDeadEndNodes(graph);
  for (const node of deadEnds) {
    errors.push({
      code: 'DEAD_END',
      nodeId: node.id,
      message: `Node '${node.nodeKey}' (${node.nodeType}) is a dead end - it has no outgoing edges and is not an 'end' node`,
    });
  }

  // Check for cycles
  const cycles = detectCycles(graph);
  if (cycles.length > 0) {
    for (const cycle of cycles) {
      errors.push({
        code: 'CYCLE_DETECTED',
        message: `Cycle detected in graph: ${cycle.join(' -> ')}`,
      });
    }
  }

  // Check for orphaned nodes (nodes with no incoming edges, except start)
  const orphaned = getOrphanedNodes(graph);
  for (const node of orphaned) {
    warnings.push({
      code: 'ORPHANED_NODE',
      nodeId: node.id,
      message: `Node '${node.nodeKey}' (${node.nodeType}) has no incoming edges - can only be reached via direct navigation`,
    });
  }

  // Check for end nodes
  const endNodes = allNodes.filter((node) => node.nodeType === 'end');
  if (endNodes.length === 0) {
    warnings.push({
      code: 'NO_END_NODES',
      message: 'Graph has no end nodes - story may not have a clear conclusion',
    });
  }

  // Validate edge conditions
  const conditionErrors = validateEdgeConditions(graph);
  errors.push(...conditionErrors);

  // Validate component types
  const componentErrors = validateComponentTypes(graph);
  errors.push(...componentErrors);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate edge conditions for structural correctness.
 * Checks if condition operators are valid and have required fields.
 */
export function validateEdgeConditions(graph: StoryGraph): ValidationError[] {
  const errors: ValidationError[] = [];
  const allEdges = getAllEdges(graph);

  for (const edge of allEdges) {
    if (edge.edgeType === 'conditional' && edge.condition) {
      const conditionErrors = validateConditionStructure(edge.condition, edge.id);
      errors.push(...conditionErrors);
    }
  }

  return errors;
}

/**
 * Recursively validate condition structure.
 */
function validateConditionStructure(
  condition: EdgeCondition,
  edgeId: string,
  path: string = ''
): ValidationError[] {
  const errors: ValidationError[] = [];
  const currentPath = path ? `${path}.${condition.operator}` : condition.operator;

  // Validate logical operators (and/or)
  if (condition.operator === 'and' || condition.operator === 'or') {
    if (!condition.conditions || condition.conditions.length === 0) {
      errors.push({
        code: 'INVALID_CONDITION',
        edgeId,
        message: `Condition '${currentPath}' requires at least one sub-condition`,
      });
    } else {
      // Recursively validate sub-conditions
      for (const subCondition of condition.conditions) {
        errors.push(...validateConditionStructure(subCondition, edgeId, currentPath));
      }
    }
    return errors;
  }

  // Validate comparison operators (requires key and value)
  const comparisonOps = ['equals', 'not_equals', 'greater_than', 'less_than', 'contains', 'not_contains'];
  if (comparisonOps.includes(condition.operator)) {
    if (!condition.key) {
      errors.push({
        code: 'INVALID_CONDITION',
        edgeId,
        message: `Condition '${currentPath}' requires a 'key' field`,
      });
    }
    if (condition.value === undefined) {
      errors.push({
        code: 'INVALID_CONDITION',
        edgeId,
        message: `Condition '${currentPath}' requires a 'value' field`,
      });
    }
  }

  // Validate inventory operators (requires value)
  const inventoryOps = ['has_item', 'not_has_item'];
  if (inventoryOps.includes(condition.operator)) {
    if (condition.value === undefined) {
      errors.push({
        code: 'INVALID_CONDITION',
        edgeId,
        message: `Condition '${currentPath}' requires a 'value' field (item ID)`,
      });
    }
  }

  return errors;
}

/**
 * Validate that all component types used in nodes are registered.
 * Generates warnings for unregistered components.
 */
export function validateComponentTypes(graph: StoryGraph): ValidationError[] {
  const errors: ValidationError[] = [];
  const allNodes = getAllNodes(graph);

  for (const node of allNodes) {
    if (!componentRegistry.hasComponentType(node.nodeType)) {
      errors.push({
        code: 'MISSING_COMPONENT_TYPE',
        nodeId: node.id,
        message: `Node '${node.nodeKey}' uses unregistered component type '${node.nodeType}'`,
      });
    }
  }

  return errors;
}

/**
 * Check if validation result is valid (no errors).
 */
export function isValid(result: ValidationResult): boolean {
  return result.valid && result.errors.length === 0;
}

/**
 * Get a summary of validation errors by code.
 */
export function getErrorSummary(result: ValidationResult): Record<ValidationErrorCode, number> {
  const summary: Partial<Record<ValidationErrorCode, number>> = {};

  for (const error of result.errors) {
    summary[error.code] = (summary[error.code] ?? 0) + 1;
  }

  return summary as Record<ValidationErrorCode, number>;
}

/**
 * Get a human-readable validation report.
 */
export function formatValidationReport(result: ValidationResult): string {
  const lines: string[] = [];

  if (result.valid) {
    lines.push('✓ Graph validation passed');
  } else {
    lines.push('✗ Graph validation failed');
  }

  if (result.errors.length > 0) {
    lines.push(`\nErrors (${result.errors.length}):`);
    for (const error of result.errors) {
      lines.push(`  - [${error.code}] ${error.message}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push(`\nWarnings (${result.warnings.length}):`);
    for (const warning of result.warnings) {
      lines.push(`  - [${warning.code}] ${warning.message}`);
    }
  }

  return lines.join('\n');
}
