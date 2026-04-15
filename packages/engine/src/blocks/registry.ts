import { codeBlockBehavior, codeBlockTraversalFacts } from './definitions/code.js';
import { locationBlockBehavior, locationBlockTraversalFacts } from './definitions/location.js';
import {
  multiChoiceBlockBehavior,
  multiChoiceBlockTraversalFacts,
} from './definitions/multi-choice.js';
import {
  singleChoiceBlockBehavior,
  singleChoiceBlockTraversalFacts,
} from './definitions/single-choice.js';
import { textBlockBehavior, textBlockTraversalFacts } from './definitions/text.js';
import type {
  BlockConfig,
  BlockRegistryEntry,
  BlockState,
  BlockTraversalFacts,
} from './contracts.js';

export type {
  BlockConfig,
  BlockRegistryEntry,
  BlockStateType,
  BlockTraversalFacts,
  TraversalFactDefinition,
  TraversalFactKind,
  TraversalFactValue,
  UnlockableBlockState,
} from './contracts.js';

const freezeTraversalFacts = <
  TConfig extends BlockConfig,
  TState extends BlockState,
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
  TConfig extends BlockConfig,
  TState extends BlockState,
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

const blockRegistry = Object.freeze({
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

export type KnownBlockType = 'code' | 'location' | 'multi-choice' | 'single-choice' | 'text';

export const hasBlockType = (blockType: string): blockType is KnownBlockType =>
  Object.hasOwn(blockRegistry, blockType);

export const getBlockDefinition = <TBlockType extends KnownBlockType>(
  blockType: TBlockType,
): BlockRegistryEntry =>
  blockRegistry[blockType] as unknown as BlockRegistryEntry;
