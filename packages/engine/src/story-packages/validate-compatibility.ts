import type { z } from 'zod';
import { getBlockDefinition, hasBlockType } from '../blocks/index.js';
import {
  buildStoryPackageBlockIndex,
  getTraversalFactKind,
  isFactComparisonCondition,
  visitStoryPackageCondition,
} from './condition-helpers.js';
import type {
  StoryPackage,
  StoryPackageCompatibilityOptions,
  StoryPackageValidationIssue,
} from './types.js';
import {
  createStoryPackageIssueFactory,
  normalizeStoryPackageValidationPath,
} from './validation-issues.js';

const createIssue = createStoryPackageIssueFactory('compatibility');

export const validateStoryPackageCompatibility = (
  storyPackage: StoryPackage,
  options: StoryPackageCompatibilityOptions,
): StoryPackageValidationIssue[] => {
  const issues: StoryPackageValidationIssue[] = [];
  const mode = options.mode ?? 'draft';
  const blockIndex = buildStoryPackageBlockIndex(storyPackage);

  storyPackage.graph.nodes.forEach((node, nodeIndex) => {
    node.blocks.forEach((block, blockIndex) => {
      if (!hasBlockType(block.type)) {
        issues.push(
          createIssue(
            'unknown-block-type',
            ['graph', 'nodes', nodeIndex, 'blocks', blockIndex, 'type'],
            `Block type "${block.type}" is not registered in the engine.`,
            {
              blockId: block.id,
              blockType: block.type,
              nodeId: node.id,
            },
          ),
        );
        return;
      }

      const definition = getBlockDefinition(block.type);
      const configResult = definition.behavior.configSchema.safeParse(block.config);

      if (configResult.success) {
        return;
      }

      configResult.error.issues.forEach((issue: z.core.$ZodIssue) => {
        issues.push(
          createIssue(
            'invalid-block-config',
            [
              'graph',
              'nodes',
              nodeIndex,
              'blocks',
              blockIndex,
              'config',
              ...normalizeStoryPackageValidationPath(issue.path),
            ],
            `Block "${block.id}" has invalid config for type "${block.type}".`,
            {
              blockId: block.id,
              blockType: block.type,
              nodeId: node.id,
              validationCode: issue.code,
            },
          ),
        );
      });
    });

    node.edges.forEach((edge, edgeIndex) => {
      if (!edge.condition) {
        return;
      }

      visitStoryPackageCondition(
        edge.condition,
        ['graph', 'nodes', nodeIndex, 'edges', edgeIndex, 'condition'],
        (condition, path) => {
          if (condition.type !== 'fact') {
            return;
          }

          const referencedBlock = blockIndex.get(condition.blockId);
          if (!referencedBlock) {
            issues.push(
              createIssue(
                'unknown-condition-block',
                [...path, 'blockId'],
                `Condition references unknown block "${condition.blockId}".`,
                {
                  blockId: condition.blockId,
                  edgeId: edge.id,
                  nodeId: node.id,
                },
              ),
            );
            return;
          }

          if (!hasBlockType(referencedBlock.block.type)) {
            return;
          }

          const factDefinition =
            getBlockDefinition(referencedBlock.block.type).traversal.facts[condition.fact];
          if (!factDefinition) {
            issues.push(
              createIssue(
                'unknown-condition-fact',
                [...path, 'fact'],
                `Condition references unknown fact "${condition.fact}" on block "${condition.blockId}".`,
                {
                  blockId: condition.blockId,
                  blockType: referencedBlock.block.type,
                  edgeId: edge.id,
                  fact: condition.fact,
                  nodeId: node.id,
                },
              ),
            );
            return;
          }

          if (!isFactComparisonCondition(condition)) {
            if (factDefinition.kind !== 'boolean') {
              issues.push(
                createIssue(
                  'invalid-condition-operator',
                  [...path, 'operator'],
                  `Condition fact "${condition.fact}" on block "${condition.blockId}" requires an operator.`,
                  {
                    blockId: condition.blockId,
                    edgeId: edge.id,
                    fact: condition.fact,
                    factKind: factDefinition.kind,
                    nodeId: node.id,
                  },
                ),
              );
            }
            return;
          }

          const { operator, value } = condition;
          const valueType = getTraversalFactKind(value);
          if (
            operator === 'gt' ||
            operator === 'gte' ||
            operator === 'lt' ||
            operator === 'lte'
          ) {
            if (factDefinition.kind !== 'number') {
              issues.push(
                createIssue(
                  'invalid-condition-operator',
                  [...path, 'operator'],
                  `Operator "${operator}" is only valid for number facts.`,
                  {
                    blockId: condition.blockId,
                    edgeId: edge.id,
                    fact: condition.fact,
                    factKind: factDefinition.kind,
                    nodeId: node.id,
                    operator,
                  },
                ),
              );
            }

            if (valueType !== 'number') {
              issues.push(
                createIssue(
                  'invalid-condition-value',
                  [...path, 'value'],
                  `Condition value for fact "${condition.fact}" must be a number.`,
                  {
                    blockId: condition.blockId,
                    edgeId: edge.id,
                    fact: condition.fact,
                    factKind: factDefinition.kind,
                    nodeId: node.id,
                    operator,
                    valueType,
                  },
                ),
              );
            }
            return;
          }

          if (valueType !== factDefinition.kind) {
            issues.push(
              createIssue(
                'invalid-condition-value',
                [...path, 'value'],
                `Condition value for fact "${condition.fact}" must be a ${factDefinition.kind}.`,
                {
                  blockId: condition.blockId,
                  edgeId: edge.id,
                  fact: condition.fact,
                  factKind: factDefinition.kind,
                  nodeId: node.id,
                  operator,
                  valueType,
                },
              ),
            );
          }
        },
      );
    });
  });

  const engineMajor = storyPackage.version.engineMajor;
  if (mode === 'draft') {
    if (engineMajor !== null && engineMajor !== options.currentEngineMajor) {
      issues.push(
        createIssue(
          'incompatible-engine-major',
          ['version', 'engineMajor'],
          `Draft story package engine major ${engineMajor} does not match current engine major ${options.currentEngineMajor}.`,
          {
            currentEngineMajor: options.currentEngineMajor,
            engineMajor,
            mode,
          },
        ),
      );
    }

    return issues;
  }

  if (engineMajor === null) {
    issues.push(
      createIssue(
        'missing-engine-major',
        ['version', 'engineMajor'],
        `Story package engine major is required for ${mode} validation.`,
        {
          currentEngineMajor: options.currentEngineMajor,
          mode,
        },
      ),
    );
    return issues;
  }

  if (engineMajor !== options.currentEngineMajor) {
    issues.push(
      createIssue(
        'incompatible-engine-major',
        ['version', 'engineMajor'],
        `Story package engine major ${engineMajor} does not match current engine major ${options.currentEngineMajor}.`,
        {
          currentEngineMajor: options.currentEngineMajor,
          engineMajor,
          mode,
        },
      ),
    );
  }

  return issues;
};
