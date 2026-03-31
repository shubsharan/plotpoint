import type { z } from 'zod';
import { getBlockDefinition, hasBlockType } from '../blocks/index.js';
import { hasConditionName } from '../graph/conditions.js';
import type {
  StoryPackage,
  StoryPackageCompatibilityOptions,
  StoryPackageValidationIssue,
} from './types.js';
import {
  createStoryPackageIssueFactory,
  normalizeStoryPackageValidationPath,
} from './validation-issues.js';

type StoryPackageCondition = NonNullable<
  StoryPackage['graph']['nodes'][number]['edges'][number]['condition']
>;

const createIssue = createStoryPackageIssueFactory('compatibility');

const visitCondition = (
  condition: StoryPackageCondition,
  path: ReadonlyArray<number | string>,
  visit: (condition: StoryPackageCondition, path: ReadonlyArray<number | string>) => void,
): void => {
  visit(condition, path);

  switch (condition.type) {
    case 'and':
    case 'or': {
      condition.children.forEach((child, childIndex) => {
        visitCondition(child, [...path, 'children', childIndex], visit);
      });
      return;
    }
    case 'always':
    case 'check':
      return;
  }
};

export const validateStoryPackageCompatibility = (
  storyPackage: StoryPackage,
  options: StoryPackageCompatibilityOptions,
): StoryPackageValidationIssue[] => {
  const issues: StoryPackageValidationIssue[] = [];
  const mode = options.mode ?? 'draft';

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
      const configResult = definition.configSchema.safeParse(block.config);

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

      visitCondition(
        edge.condition,
        ['graph', 'nodes', nodeIndex, 'edges', edgeIndex, 'condition'],
        (condition, path) => {
          if (condition.type !== 'check' || hasConditionName(condition.condition)) {
            return;
          }

          issues.push(
            createIssue(
              'unknown-condition-name',
              [...path, 'condition'],
              `Condition "${condition.condition}" is not registered in the engine.`,
              {
                conditionName: condition.condition,
                edgeId: edge.id,
                nodeId: node.id,
              },
            ),
          );
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
