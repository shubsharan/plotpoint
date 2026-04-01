import { codeBlockBehavior } from './code.js';
import { locationBlockBehavior } from './location.js';
import { multiChoiceBlockBehavior } from './multi-choice.js';
import { singleChoiceBlockBehavior } from './single-choice.js';
import { textBlockBehavior } from './text.js';
import type { BlockRegistryEntry } from './types.js';

export type { BlockConfig, BlockRegistryEntry, BlockStateType } from './types.js';

type BlockRegistry = {
  readonly code: BlockRegistryEntry<any, any, any>;
  readonly location: BlockRegistryEntry<any, any, any>;
  readonly 'multi-choice': BlockRegistryEntry<any, any, any>;
  readonly 'single-choice': BlockRegistryEntry<any, any, any>;
  readonly text: BlockRegistryEntry<any, any, any>;
};

export const blockRegistry: BlockRegistry = {
  code: {
    behavior: codeBlockBehavior,
    policy: {
      requiredContext: ['nowIso'],
      stateType: 'playerState',
    },
  },
  location: {
    behavior: locationBlockBehavior,
    policy: {
      requiredContext: ['nowIso', 'playerLocation'],
      stateType: 'playerState',
    },
  },
  'multi-choice': {
    behavior: multiChoiceBlockBehavior,
    policy: {
      requiredContext: ['nowIso'],
      stateType: 'playerState',
    },
  },
  'single-choice': {
    behavior: singleChoiceBlockBehavior,
    policy: {
      requiredContext: ['nowIso'],
      stateType: 'playerState',
    },
  },
  text: {
    behavior: textBlockBehavior,
    policy: {
      requiredContext: [],
      stateType: 'playerState',
    },
  },
};

export type KnownBlockType = keyof typeof blockRegistry;

export const hasBlockType = (blockType: string): blockType is KnownBlockType =>
  Object.hasOwn(blockRegistry, blockType);

export const getBlockDefinition = <TBlockType extends KnownBlockType>(
  blockType: TBlockType,
): (typeof blockRegistry)[TBlockType] =>
  blockRegistry[blockType];
