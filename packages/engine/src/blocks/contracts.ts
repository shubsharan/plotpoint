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
export type BlockStateScope = 'player' | 'shared';
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

type BlockBaseSpec<
  TConfig extends BlockConfig = BlockConfig,
  TState extends BlockState = BlockState,
> = {
  configSchema: z.ZodType<TConfig>;
  initialState: (config: TConfig) => TState;
  isActionable?: ((state: TState, config: TConfig) => boolean) | undefined;
  requiredContext: ReadonlyArray<BlockContextKey>;
  stateScope: BlockStateScope;
  stateSchema: z.ZodType<TState>;
  traversalFacts: BlockTraversalFacts<TConfig, TState>;
};

export type InteractiveBlockSpec<
  TConfig extends BlockConfig = BlockConfig,
  TState extends BlockState = BlockState,
  TAction extends BlockAction = BlockAction,
> = BlockBaseSpec<TConfig, TState> & {
  interactive: true;
  onAction: (
    state: TState,
    action: TAction,
    context: BlockActionContext,
    config: TConfig,
  ) => TState;
  actionSchema: z.ZodType<TAction>;
};

export type NonInteractiveBlockSpec<
  TConfig extends BlockConfig = BlockConfig,
  TState extends BlockState = BlockState,
> = BlockBaseSpec<TConfig, TState> & {
  interactive: false;
};

export type BlockSpec<
  TConfig extends BlockConfig = BlockConfig,
  TState extends BlockState = BlockState,
  TAction extends BlockAction = BlockAction,
> =
  | InteractiveBlockSpec<TConfig, TState, TAction>
  | NonInteractiveBlockSpec<TConfig, TState>;

export type BlockSpecConfig<TSpec extends { configSchema: z.ZodTypeAny }> = z.output<
  TSpec['configSchema']
>;
export type BlockSpecState<TSpec extends { stateSchema: z.ZodTypeAny }> = z.output<
  TSpec['stateSchema']
>;
export type InteractiveBlockSpecAction<TSpec extends { actionSchema: z.ZodTypeAny }> = z.output<
  TSpec['actionSchema']
>;

export function defineBlockSpec<
  TConfig extends BlockConfig,
  TState extends BlockState,
  TAction extends BlockAction,
>(
  spec: InteractiveBlockSpec<TConfig, TState, TAction>,
): InteractiveBlockSpec<TConfig, TState, TAction>;
export function defineBlockSpec<
  TConfig extends BlockConfig,
  TState extends BlockState,
>(
  spec: NonInteractiveBlockSpec<TConfig, TState>,
): NonInteractiveBlockSpec<TConfig, TState>;
export function defineBlockSpec(
  spec: BlockSpec,
): BlockSpec {
  return spec;
}
