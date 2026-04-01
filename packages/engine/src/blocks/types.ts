import type { z } from 'zod';
import type { GeoCoord } from '../ports/location-reader.js';

export type BlockScope = 'game' | 'user';

export type BlockConfig = Record<string, unknown>;
export type BlockState = Record<string, unknown>;
export type BlockAction = {
  type: 'submit';
};

export type BlockUpdateContext = {
  nowIso?: string | undefined;
  playerLocation?: GeoCoord | null | undefined;
};

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
  isActionable?: ((state: TState) => boolean) | undefined;
  scope: BlockScope;
  stateSchema: z.ZodType<TState>;
};

export type ExecutableBlockDefinition<
  TConfig extends BlockConfig = BlockConfig,
  TState extends BlockState = BlockState,
  TAction extends BlockAction = BlockAction,
> = BlockBaseDefinition<TConfig, TState> & {
  actionSchema: z.ZodType<TAction>;
  interactive: true;
  update: (state: TState, action: TAction, context: BlockUpdateContext) => TState;
};

export type NonInteractiveBlockDefinition<
  TConfig extends BlockConfig = BlockConfig,
  TState extends BlockState = BlockState,
> = BlockBaseDefinition<TConfig, TState> & {
  interactive: false;
};

export type BlockRegistryEntry<
  TConfig extends BlockConfig = BlockConfig,
  TState extends BlockState = BlockState,
  TAction extends BlockAction = BlockAction,
> = ExecutableBlockDefinition<TConfig, TState, TAction> | NonInteractiveBlockDefinition<TConfig, TState>;

export function defineBlockDefinition<
  TConfig extends BlockConfig,
  TState extends BlockState,
  TAction extends BlockAction,
>(
  definition: ExecutableBlockDefinition<TConfig, TState, TAction>,
): ExecutableBlockDefinition<TConfig, TState, TAction>;
export function defineBlockDefinition<
  TConfig extends BlockConfig,
  TState extends BlockState,
>(
  definition: NonInteractiveBlockDefinition<TConfig, TState>,
): NonInteractiveBlockDefinition<TConfig, TState>;
export function defineBlockDefinition(
  definition: BlockRegistryEntry,
): BlockRegistryEntry {
  return definition;
}
