import type { TraversalFactKind } from '../blocks/contracts.js';
import type { StoryPackage, StoryPackageBlock, StoryPackageCondition } from './schema.js';

export type StoryPackageConditionPath = ReadonlyArray<number | string>;
export type StoryPackageBlockRef = {
  block: StoryPackageBlock;
  nodeId: string;
};
export type StoryPackageFactCondition = Extract<StoryPackageCondition, { type: 'fact' }>;
export type StoryPackageFactComparisonCondition = Extract<
  StoryPackageFactCondition,
  { operator: string }
>;

export const appendConditionChildPath = (
  path: StoryPackageConditionPath,
  childIndex: number,
): Array<number | string> => [...path, 'children', childIndex];

export const buildStoryPackageBlockIndex = (
  storyPackage: StoryPackage,
): Map<string, StoryPackageBlockRef> => {
  const blockIndex = new Map<string, StoryPackageBlockRef>();

  storyPackage.graph.nodes.forEach((node) => {
    node.blocks.forEach((block) => {
      if (!blockIndex.has(block.id)) {
        blockIndex.set(block.id, {
          block,
          nodeId: node.id,
        });
      }
    });
  });

  return blockIndex;
};

export const getTraversalFactKind = (
  value: boolean | number | string,
): TraversalFactKind =>
  typeof value === 'boolean'
    ? 'boolean'
    : typeof value === 'number'
      ? 'number'
      : 'string';

export const isFactComparisonCondition = (
  condition: StoryPackageFactCondition,
): condition is StoryPackageFactComparisonCondition => 'operator' in condition;

export const visitStoryPackageCondition = (
  condition: StoryPackageCondition,
  path: StoryPackageConditionPath,
  visit: (condition: StoryPackageCondition, path: StoryPackageConditionPath) => void,
): void => {
  visit(condition, path);

  switch (condition.type) {
    case 'and':
    case 'or': {
      condition.children.forEach((child, childIndex) => {
        visitStoryPackageCondition(child, appendConditionChildPath(path, childIndex), visit);
      });
      return;
    }
    case 'always':
    case 'fact':
      return;
  }
};
