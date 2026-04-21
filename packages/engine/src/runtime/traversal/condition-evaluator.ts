import type {
  TraversalFactKind,
  TraversalFactValue,
} from '../../blocks/contracts.js';
import {
  appendConditionChildPath,
  buildStoryPackageBlockIndex,
    getTraversalFactKind,
    isFactComparisonCondition,
    type StoryPackageFactComparisonCondition,
    type StoryPackageFactCondition,
  } from '../../story-packages/condition-helpers.js';
import type {
  StoryPackage,
  StoryPackageCondition,
  StoryPackageEdge,
  StoryPackageNode,
} from '../../story-packages/schema.js';
import { EngineRuntimeError } from '../errors.js';
import type { ResolvedEffectiveBlockState } from '../context/block-resolution.js';
import { resolveEffectiveBlockStateOrThrow } from '../context/block-resolution.js';
import { formatIssuePath } from '../context/story-context.js';
import type { SessionState, TraversableEdge } from '../types.js';

type ResolvedTraversalFact = {
  kind: TraversalFactKind;
  value: TraversalFactValue;
};
type ResolvedBlockRuntime = Pick<
  ResolvedEffectiveBlockState,
  'blockSpec' | 'currentNodeBlock' | 'parsedConfig' | 'parsedState'
>;
type ConditionEvaluationContext = {
  edgeId: string;
  nodeId: string;
  path: ReadonlyArray<number | string>;
  storyId: string;
};
type TraversalFactResolver = {
  resolveFactOrThrow: (
    blockId: string,
    fact: string,
    context: ConditionEvaluationContext,
  ) => ResolvedTraversalFact;
};

type TraversalFactCache = {
  get: (blockId: string, fact: string) => ResolvedTraversalFact | undefined;
  set: (blockId: string, fact: string, resolvedFact: ResolvedTraversalFact) => void;
};

const projectTraversalFactOrThrow = <TBlockRuntime extends ResolvedBlockRuntime>(
  blockRuntime: TBlockRuntime,
  factDefinition: TBlockRuntime['blockSpec']['traversalFacts'][string],
): TraversalFactValue =>
  (factDefinition.derive as (input: {
    config: TBlockRuntime['parsedConfig'];
    state: TBlockRuntime['parsedState'];
  }) => TraversalFactValue)({
    config: blockRuntime.parsedConfig,
    state: blockRuntime.parsedState,
  });

const createTraversableEdge = (edge: StoryPackageEdge): TraversableEdge => {
  if (edge.label === undefined) {
    return {
      edgeId: edge.id,
      targetNodeId: edge.targetNodeId,
    };
  }

  return {
    edgeId: edge.id,
    label: edge.label,
    targetNodeId: edge.targetNodeId,
  };
};

const createConditionEvaluationFailedError = (
  context: ConditionEvaluationContext,
  message: string,
  options?: {
    cause?: unknown;
    details?: Record<string, unknown>;
  },
): EngineRuntimeError =>
  new EngineRuntimeError(
    'runtime_condition_evaluation_failed',
    `Condition evaluation failed for edge "${context.edgeId}" in node "${context.nodeId}" at ${formatIssuePath(context.path)}: ${message}`,
    {
      cause: options?.cause,
      details: {
        conditionPath: formatIssuePath(context.path),
        edgeId: context.edgeId,
        nodeId: context.nodeId,
        storyId: context.storyId,
        ...options?.details,
      },
    },
  );

export const createTraversalFactCache = (): TraversalFactCache => {
  const factsByBlockId = new Map<string, Map<string, ResolvedTraversalFact>>();

  return {
    get: (blockId, fact) => factsByBlockId.get(blockId)?.get(fact),
    set: (blockId, fact, resolvedFact) => {
      let factsByName = factsByBlockId.get(blockId);
      if (!factsByName) {
        factsByName = new Map<string, ResolvedTraversalFact>();
        factsByBlockId.set(blockId, factsByName);
      }

      factsByName.set(fact, resolvedFact);
    },
  };
};

export const deriveTraversalFactOrThrow = (
  blockRuntime: ResolvedBlockRuntime,
  fact: string,
  context: ConditionEvaluationContext,
): ResolvedTraversalFact => {
  const factDefinition = blockRuntime.blockSpec.traversalFacts[fact];
  if (!factDefinition) {
    throw createConditionEvaluationFailedError(
      context,
      `Block "${blockRuntime.currentNodeBlock.id}" does not export traversal fact "${fact}".`,
      {
        details: {
          blockId: blockRuntime.currentNodeBlock.id,
          blockType: blockRuntime.currentNodeBlock.type,
          fact,
        },
      },
    );
  }

  let factValue: TraversalFactValue;
  try {
    factValue = projectTraversalFactOrThrow(blockRuntime, factDefinition);
  } catch (error) {
    throw createConditionEvaluationFailedError(
      context,
      `Block "${blockRuntime.currentNodeBlock.id}" failed to derive traversal fact "${fact}".`,
      {
        cause: error,
        details: {
          blockId: blockRuntime.currentNodeBlock.id,
          blockType: blockRuntime.currentNodeBlock.type,
          fact,
        },
      },
    );
  }

  const actualKind = getTraversalFactKind(factValue);
  if (actualKind !== factDefinition.kind) {
    throw createConditionEvaluationFailedError(
      context,
      `Traversal fact "${fact}" on block "${blockRuntime.currentNodeBlock.id}" returned ${actualKind} but declared ${factDefinition.kind}.`,
      {
        details: {
          actualKind,
          blockId: blockRuntime.currentNodeBlock.id,
          blockType: blockRuntime.currentNodeBlock.type,
          fact,
          factKind: factDefinition.kind,
        },
      },
    );
  }

  return {
    kind: factDefinition.kind,
    value: factValue,
  } satisfies ResolvedTraversalFact;
};

const createTraversalFactResolver = (
  story: StoryPackage,
  state: SessionState,
): TraversalFactResolver => {
  const blockIndex = buildStoryPackageBlockIndex(story);
  const blockRuntimeCache = new Map<string, ResolvedEffectiveBlockState>();
  const factValueCache = createTraversalFactCache();

  const resolveBlockRuntimeOrThrow = (
    blockId: string,
    context: ConditionEvaluationContext,
  ): ResolvedEffectiveBlockState => {
    const cachedRuntime = blockRuntimeCache.get(blockId);
    if (cachedRuntime) {
      return cachedRuntime;
    }

    const blockRef = blockIndex.get(blockId);
    if (!blockRef) {
      throw createConditionEvaluationFailedError(
        context,
        `Referenced block "${blockId}" does not exist.`,
        {
          details: {
            blockId,
          },
        },
      );
    }

    const blockRuntime = resolveEffectiveBlockStateOrThrow(state, blockRef.nodeId, blockRef.block);
    blockRuntimeCache.set(blockId, blockRuntime);
    return blockRuntime;
  };

  return {
    resolveFactOrThrow: (blockId, fact, context) => {
      const cachedFact = factValueCache.get(blockId, fact);
      if (cachedFact) {
        return cachedFact;
      }

      const blockRuntime = resolveBlockRuntimeOrThrow(blockId, context);
      const resolvedFact = deriveTraversalFactOrThrow(blockRuntime, fact, context);
      factValueCache.set(blockId, fact, resolvedFact);
      return resolvedFact;
    },
  };
};

const getNumericFactValueOrThrow = (
  resolvedFact: ResolvedTraversalFact,
  condition: StoryPackageFactComparisonCondition,
  context: ConditionEvaluationContext,
): number => {
  if (resolvedFact.kind !== 'number' || typeof resolvedFact.value !== 'number') {
    throw createConditionEvaluationFailedError(
      context,
      `Operator "${condition.operator}" requires number fact "${condition.fact}" on block "${condition.blockId}".`,
      {
        details: {
          blockId: condition.blockId,
          fact: condition.fact,
          factKind: resolvedFact.kind,
          operator: condition.operator,
        },
      },
    );
  }

  return resolvedFact.value;
};

const evaluateFactConditionOrThrow = (
  condition: StoryPackageFactCondition,
  resolver: TraversalFactResolver,
  context: ConditionEvaluationContext,
): boolean => {
  const resolvedFact = resolver.resolveFactOrThrow(condition.blockId, condition.fact, context);
  if (!isFactComparisonCondition(condition)) {
    if (resolvedFact.kind !== 'boolean') {
      throw createConditionEvaluationFailedError(
        context,
        `Traversal fact "${condition.fact}" on block "${condition.blockId}" requires an operator.`,
        {
          details: {
            blockId: condition.blockId,
            fact: condition.fact,
            factKind: resolvedFact.kind,
          },
        },
      );
    }

    return resolvedFact.value === true;
  }

  const conditionValueType = getTraversalFactKind(condition.value);
  switch (condition.operator) {
    case 'eq':
      if (conditionValueType !== resolvedFact.kind) {
        throw createConditionEvaluationFailedError(
          context,
          `Traversal fact "${condition.fact}" on block "${condition.blockId}" cannot compare ${resolvedFact.kind} to ${conditionValueType}.`,
          {
            details: {
              blockId: condition.blockId,
              fact: condition.fact,
              factKind: resolvedFact.kind,
              operator: condition.operator,
              valueType: conditionValueType,
            },
          },
        );
      }
      return resolvedFact.value === condition.value;
    case 'neq':
      if (conditionValueType !== resolvedFact.kind) {
        throw createConditionEvaluationFailedError(
          context,
          `Traversal fact "${condition.fact}" on block "${condition.blockId}" cannot compare ${resolvedFact.kind} to ${conditionValueType}.`,
          {
            details: {
              blockId: condition.blockId,
              fact: condition.fact,
              factKind: resolvedFact.kind,
              operator: condition.operator,
              valueType: conditionValueType,
            },
          },
        );
      }
      return resolvedFact.value !== condition.value;
    case 'gt':
      return getNumericFactValueOrThrow(resolvedFact, condition, context) > condition.value;
    case 'gte':
      return getNumericFactValueOrThrow(resolvedFact, condition, context) >= condition.value;
    case 'lt':
      return getNumericFactValueOrThrow(resolvedFact, condition, context) < condition.value;
    case 'lte':
      return getNumericFactValueOrThrow(resolvedFact, condition, context) <= condition.value;
    default: {
      const invalidCondition = condition as {
        blockId?: unknown;
        fact?: unknown;
        operator?: unknown;
      };
      throw createConditionEvaluationFailedError(
        context,
        `Operator "${String(invalidCondition.operator)}" is not supported.`,
        {
          details: {
            blockId: invalidCondition.blockId,
            fact: invalidCondition.fact,
            operator: invalidCondition.operator,
          },
        },
      );
    }
  }
};

export const evaluateConditionOrThrow = (
  condition: StoryPackageCondition,
  resolver: TraversalFactResolver,
  context: ConditionEvaluationContext,
): boolean => {
  switch (condition.type) {
    case 'always':
      return true;
    case 'fact':
      return evaluateFactConditionOrThrow(condition, resolver, context);
    case 'and':
      for (let childIndex = 0; childIndex < condition.children.length; childIndex += 1) {
        const child = condition.children[childIndex];
        if (!child) {
          throw createConditionEvaluationFailedError(
            {
              ...context,
              path: appendConditionChildPath(context.path, childIndex),
            },
            `Condition "${condition.type}" is missing child ${childIndex}.`,
            {
              details: {
                childIndex,
                conditionType: condition.type,
              },
            },
          );
        }
        if (
          !evaluateConditionOrThrow(child, resolver, {
            ...context,
            path: appendConditionChildPath(context.path, childIndex),
          })
        ) {
          return false;
        }
      }
      return true;
    case 'or':
      for (let childIndex = 0; childIndex < condition.children.length; childIndex += 1) {
        const child = condition.children[childIndex];
        if (!child) {
          throw createConditionEvaluationFailedError(
            {
              ...context,
              path: appendConditionChildPath(context.path, childIndex),
            },
            `Condition "${condition.type}" is missing child ${childIndex}.`,
            {
              details: {
                childIndex,
                conditionType: condition.type,
              },
            },
          );
        }
        if (
          evaluateConditionOrThrow(child, resolver, {
            ...context,
            path: appendConditionChildPath(context.path, childIndex),
          })
        ) {
          return true;
        }
      }
      return false;
  }
};

export const deriveTraversableEdgesOrThrow = (
  story: StoryPackage,
  state: SessionState,
  node: StoryPackageNode,
): TraversableEdge[] => {
  const nodeIndex = story.graph.nodes.findIndex((candidate) => candidate.id === node.id);
  const resolver = createTraversalFactResolver(story, state);
  const traversableEdges: TraversableEdge[] = [];

  node.edges.forEach((edge, edgeIndex) => {
    const condition = edge.condition;
    if (!condition || condition.type === 'always') {
      traversableEdges.push(createTraversableEdge(edge));
      return;
    }

    if (
      evaluateConditionOrThrow(condition, resolver, {
        edgeId: edge.id,
        nodeId: node.id,
        path: ['graph', 'nodes', nodeIndex, 'edges', edgeIndex, 'condition'],
        storyId: story.metadata.storyId,
      })
    ) {
      traversableEdges.push(createTraversableEdge(edge));
    }
  });

  return traversableEdges;
};
