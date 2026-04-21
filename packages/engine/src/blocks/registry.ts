import { codeBlockSpec } from './definitions/code.js';
import { locationBlockSpec } from './definitions/location.js';
import { multiChoiceBlockSpec } from './definitions/multi-choice.js';
import { singleChoiceBlockSpec } from './definitions/single-choice.js';
import { textBlockSpec } from './definitions/text.js';
import type { BlockConfig, BlockSpec, BlockTraversalFacts } from './contracts.js';

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
  TState extends { unlocked: boolean },
>(
  facts: BlockTraversalFacts<TConfig, TState>,
): Readonly<BlockTraversalFacts<TConfig, TState>> =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(facts).map(([factName, factDefinition]) => [
        factName,
        Object.freeze({ ...factDefinition }),
      ]),
    ) as BlockTraversalFacts<TConfig, TState>,
  );

const freezeBlockSpec = <TSpec extends BlockSpec<any, any, any>>(
  spec: TSpec,
): Readonly<TSpec> => {
  const frozenSpec = {
    ...spec,
    requiredContext: Object.freeze([...spec.requiredContext]),
    traversalFacts: freezeTraversalFacts(spec.traversalFacts),
  };

  return Object.freeze(frozenSpec) as Readonly<TSpec>;
};

type BlockRegistryMap = {
  code: Readonly<typeof codeBlockSpec>;
  location: Readonly<typeof locationBlockSpec>;
  'multi-choice': Readonly<typeof multiChoiceBlockSpec>;
  'single-choice': Readonly<typeof singleChoiceBlockSpec>;
  text: Readonly<typeof textBlockSpec>;
};

const blockRegistry: BlockRegistryMap = Object.freeze({
  code: freezeBlockSpec(codeBlockSpec),
  location: freezeBlockSpec(locationBlockSpec),
  'multi-choice': freezeBlockSpec(multiChoiceBlockSpec),
  'single-choice': freezeBlockSpec(singleChoiceBlockSpec),
  text: freezeBlockSpec(textBlockSpec),
});

export type BlockRegistry = typeof blockRegistry;
export type KnownBlockType = keyof BlockRegistry;
export type KnownBlockSpec<TBlockType extends KnownBlockType = KnownBlockType> = BlockRegistry[TBlockType];
export type InteractiveKnownBlockType = {
  [TBlockType in KnownBlockType]: BlockRegistry[TBlockType] extends { interactive: true }
    ? TBlockType
    : never;
}[KnownBlockType];
export type InteractiveKnownBlockSpec<
  TBlockType extends InteractiveKnownBlockType = InteractiveKnownBlockType,
> = Extract<BlockRegistry[TBlockType], { interactive: true }>;

export const hasBlockType = (blockType: string): blockType is KnownBlockType =>
  Object.hasOwn(blockRegistry, blockType);

export const getBlockSpec = <TBlockType extends KnownBlockType>(
  blockType: TBlockType,
): KnownBlockSpec<TBlockType> => blockRegistry[blockType];

export const isInteractiveBlockSpec = <TBlockType extends KnownBlockType>(
  blockSpec: KnownBlockSpec<TBlockType>,
): blockSpec is InteractiveKnownBlockSpec<Extract<TBlockType, InteractiveKnownBlockType>> =>
  blockSpec.interactive;
