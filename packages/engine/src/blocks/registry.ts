import { codeBlockSpec } from './definitions/code.js';
import { locationBlockSpec } from './definitions/location.js';
import { multiChoiceBlockSpec } from './definitions/multi-choice.js';
import { singleChoiceBlockSpec } from './definitions/single-choice.js';
import { textBlockSpec } from './definitions/text.js';
import type {
  BlockSpec,
  BlockConfig,
  BlockState,
  BlockTraversalFacts,
} from './contracts.js';

export type {
  BlockSpec,
  BlockConfig,
  BlockStateScope,
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

const freezeBlockSpec = <
  TConfig extends BlockConfig,
  TState extends BlockState,
  TAction extends { type: 'submit' },
>(
  spec: BlockSpec<TConfig, TState, TAction>,
): BlockSpec<TConfig, TState, TAction> =>
  Object.freeze({
    ...spec,
    requiredContext: Object.freeze([...spec.requiredContext]),
    traversalFacts: freezeTraversalFacts(spec.traversalFacts),
  });

const blockRegistry = Object.freeze({
  code: freezeBlockSpec(codeBlockSpec),
  location: freezeBlockSpec(locationBlockSpec),
  'multi-choice': freezeBlockSpec(multiChoiceBlockSpec),
  'single-choice': freezeBlockSpec(singleChoiceBlockSpec),
  text: freezeBlockSpec(textBlockSpec),
});

export type KnownBlockType = 'code' | 'location' | 'multi-choice' | 'single-choice' | 'text';

export const hasBlockType = (blockType: string): blockType is KnownBlockType =>
  Object.hasOwn(blockRegistry, blockType);

export const getBlockSpec = <TBlockType extends KnownBlockType>(
  blockType: TBlockType,
): BlockSpec =>
  blockRegistry[blockType] as unknown as BlockSpec;
