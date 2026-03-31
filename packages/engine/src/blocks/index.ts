import { codeBlock } from './code.js';
import { locationBlock } from './location.js';
import { multiChoiceBlock } from './multi-choice.js';
import { singleChoiceBlock } from './single-choice.js';
import { textBlock } from './text.js';

export type { BlockConfig, BlockRegistryEntry, BlockScope } from './types.js';

type BlockRegistry = {
  readonly code: typeof codeBlock;
  readonly location: typeof locationBlock;
  readonly 'multi-choice': typeof multiChoiceBlock;
  readonly 'single-choice': typeof singleChoiceBlock;
  readonly text: typeof textBlock;
};

export const blockRegistry: BlockRegistry = {
  code: codeBlock,
  location: locationBlock,
  'multi-choice': multiChoiceBlock,
  'single-choice': singleChoiceBlock,
  text: textBlock,
};

export type KnownBlockType = keyof typeof blockRegistry;

export const hasBlockType = (blockType: string): blockType is KnownBlockType =>
  Object.hasOwn(blockRegistry, blockType);

export const getBlockDefinition = <TBlockType extends KnownBlockType>(
  blockType: TBlockType,
): (typeof blockRegistry)[TBlockType] =>
  blockRegistry[blockType];
