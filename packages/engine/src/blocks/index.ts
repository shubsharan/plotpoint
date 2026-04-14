import { codeBlockBehavior, codeBlockTraversalFacts } from './code.js';
import { locationBlockBehavior, locationBlockTraversalFacts } from './location.js';
import { multiChoiceBlockBehavior, multiChoiceBlockTraversalFacts } from './multi-choice.js';
import { singleChoiceBlockBehavior, singleChoiceBlockTraversalFacts } from './single-choice.js';
import { textBlockBehavior, textBlockTraversalFacts } from './text.js';
import type { BlockRegistryEntry, BlockTraversalFacts } from './types.js';

export type {
  BlockConfig,
  BlockRegistryEntry,
  BlockStateType,
  BlockTraversalFacts,
  TraversalFactDefinition,
  TraversalFactKind,
  TraversalFactValue,
} from './types.js';

type BlockRegistry = {
  readonly code: BlockRegistryEntry<any, any, any>;
  readonly location: BlockRegistryEntry<any, any, any>;
  readonly 'multi-choice': BlockRegistryEntry<any, any, any>;
  readonly 'single-choice': BlockRegistryEntry<any, any, any>;
  readonly text: BlockRegistryEntry<any, any, any>;
};

const freezeTraversalFacts = <
  TConfig extends Record<string, unknown>,
  TState extends Record<string, unknown>,
>(
  facts: BlockTraversalFacts<TConfig, TState>,
): BlockTraversalFacts<TConfig, TState> =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(facts).map(([factName, factDefinition]) => [
        factName,
        Object.freeze({ ...factDefinition }),
      ]),
    ) as BlockTraversalFacts<TConfig, TState>,
  );

const freezeBlockRegistryEntry = <
  TConfig extends Record<string, unknown>,
  TState extends Record<string, unknown>,
  TAction extends { type: 'submit' },
>(
  entry: BlockRegistryEntry<TConfig, TState, TAction>,
): BlockRegistryEntry<TConfig, TState, TAction> =>
  Object.freeze({
    behavior: Object.freeze(entry.behavior),
    policy: Object.freeze({
      requiredContext: Object.freeze([...entry.policy.requiredContext]),
      stateType: entry.policy.stateType,
    }),
    traversal: Object.freeze({
      facts: freezeTraversalFacts(entry.traversal.facts),
    }),
  });

const blockRegistry: BlockRegistry = Object.freeze({
  code: freezeBlockRegistryEntry({
    behavior: codeBlockBehavior,
    policy: {
      requiredContext: ['nowIso'],
      stateType: 'playerState',
    },
    traversal: {
      facts: codeBlockTraversalFacts,
    },
  }),
  location: freezeBlockRegistryEntry({
    behavior: locationBlockBehavior,
    policy: {
      requiredContext: ['nowIso', 'playerLocation'],
      stateType: 'playerState',
    },
    traversal: {
      facts: locationBlockTraversalFacts,
    },
  }),
  'multi-choice': freezeBlockRegistryEntry({
    behavior: multiChoiceBlockBehavior,
    policy: {
      requiredContext: ['nowIso'],
      stateType: 'playerState',
    },
    traversal: {
      facts: multiChoiceBlockTraversalFacts,
    },
  }),
  'single-choice': freezeBlockRegistryEntry({
    behavior: singleChoiceBlockBehavior,
    policy: {
      requiredContext: ['nowIso'],
      stateType: 'playerState',
    },
    traversal: {
      facts: singleChoiceBlockTraversalFacts,
    },
  }),
  text: freezeBlockRegistryEntry({
    behavior: textBlockBehavior,
    policy: {
      requiredContext: [],
      stateType: 'playerState',
    },
    traversal: {
      facts: textBlockTraversalFacts,
    },
  }),
});

export type KnownBlockType = keyof BlockRegistry;

export const hasBlockType = (blockType: string): blockType is KnownBlockType =>
  Object.hasOwn(blockRegistry, blockType);

export const getBlockDefinition = <TBlockType extends KnownBlockType>(
  blockType: TBlockType,
): (typeof blockRegistry)[TBlockType] =>
  blockRegistry[blockType];
