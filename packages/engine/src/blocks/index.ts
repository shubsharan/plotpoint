import { codeBlock } from './code.js';
import { locationBlock } from './location.js';
import { multiChoiceBlock } from './multi-choice.js';
import { singleChoiceBlock } from './single-choice.js';
import { textBlock } from './text.js';
import type { BlockRegistryEntry } from './types.js';

export type { BlockConfig, BlockRegistryEntry, BlockScope } from './types.js';

export type KnownBlockType = 'code' | 'location' | 'multi-choice' | 'single-choice' | 'text';

export const blockRegistry: Record<KnownBlockType, BlockRegistryEntry> = {
  code: codeBlock,
  location: locationBlock,
  'multi-choice': multiChoiceBlock,
  'single-choice': singleChoiceBlock,
  text: textBlock,
};

export const hasBlockType = (blockType: string): blockType is KnownBlockType =>
  Object.hasOwn(blockRegistry, blockType);

export const getBlockDefinition = (blockType: KnownBlockType): BlockRegistryEntry =>
  blockRegistry[blockType];
