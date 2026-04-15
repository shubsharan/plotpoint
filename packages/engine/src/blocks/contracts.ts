import type { z } from 'zod';
import type { GeoCoord } from '../ports/location-reader.js';

export type BlockConfig = Record<string, unknown>;
export type UnlockableBlockState = {
  unlocked: boolean;
};
export type BlockState = UnlockableBlockState & Record<string, unknown>;
export type BlockAction = {
  type: 'submit';
};

export type BlockActionContext = {
  nowIso?: string | undefined;
  playerLocation?: GeoCoord | null | undefined;
};

export type BlockContextKey = keyof BlockActionContext;
export type BlockStateType = 'playerState' | 'sharedState';
export type TraversalFactKind = 'boolean' | 'number' | 'string';
export type TraversalFactValue = boolean | number | string;

export type TraversalFactDefinition<
  TConfig extends BlockConfig = BlockConfig,
  TState extends BlockState = BlockState,
> = {
  kind: TraversalFactKind;
  derive: (input: { config: TConfig; state: TState }) => TraversalFactValue;
};

export type BlockTraversalFacts<
  TConfig extends BlockConfig = BlockConfig,
  TState extends BlockState = BlockState,
> = Record<string, TraversalFactDefinition<TConfig, TState>>;

export type BlockUpdateErrorCode = 'action_invalid_for_config' | 'unsupported_location_target';

export class BlockUpdateError extends Error {
  readonly code: BlockUpdateErrorCode;
  readonly details?: Record<string, unknown> | undefined;

  constructor(
    code: BlockUpdateErrorCode,
    message: string,
    details?: Record<string, unknown> | undefined,
  ) {
    super(message);
    this.name = 'BlockUpdateError';
    this.code = code;
    this.details = details;
  }
}

type BlockBaseDefinition<
  TConfig extends BlockConfig = BlockConfig,
  TState extends BlockState = BlockState,
> = {
  configSchema: z.ZodType<TConfig>;
  initialState: (config: TConfig) => TState;
  isActionable?: ((state: TState, config: TConfig) => boolean) | undefined;
  stateSchema: z.ZodType<TState>;
};

export type InteractiveBlockBehavior<
  TConfig extends BlockConfig = BlockConfig,
  TState extends BlockState = BlockState,
  TAction extends BlockAction = BlockAction,
> = BlockBaseDefinition<TConfig, TState> & {
  interactive: true;
  onAction: (
    state: TState,
    action: TAction,
    context: BlockActionContext,
    config: TConfig,
  ) => TState;
  actionSchema: z.ZodType<TAction>;
};

export type NonInteractiveBlockBehavior<
  TConfig extends BlockConfig = BlockConfig,
  TState extends BlockState = BlockState,
> = BlockBaseDefinition<TConfig, TState> & {
  interactive: false;
};

export type BlockBehavior<
  TConfig extends BlockConfig = BlockConfig,
  TState extends BlockState = BlockState,
  TAction extends BlockAction = BlockAction,
> =
  | InteractiveBlockBehavior<TConfig, TState, TAction>
  | NonInteractiveBlockBehavior<TConfig, TState>;

export type BlockRegistryEntry<
  TConfig extends BlockConfig = BlockConfig,
  TState extends BlockState = BlockState,
  TAction extends BlockAction = BlockAction,
> = {
  behavior: BlockBehavior<TConfig, TState, TAction>;
  policy: {
    requiredContext: ReadonlyArray<BlockContextKey>;
    stateType: BlockStateType;
  };
  traversal: {
    facts: BlockTraversalFacts<TConfig, TState>;
  };
};

export function defineBlockBehavior<
  TConfig extends BlockConfig,
  TState extends BlockState,
  TAction extends BlockAction,
>(
  behavior: InteractiveBlockBehavior<TConfig, TState, TAction>,
): InteractiveBlockBehavior<TConfig, TState, TAction>;
export function defineBlockBehavior<
  TConfig extends BlockConfig,
  TState extends BlockState,
>(
  behavior: NonInteractiveBlockBehavior<TConfig, TState>,
): NonInteractiveBlockBehavior<TConfig, TState>;
export function defineBlockBehavior(
  behavior: BlockBehavior,
): BlockBehavior {
  return behavior;
}
