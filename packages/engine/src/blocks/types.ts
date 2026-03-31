import type { z } from 'zod';

export type BlockScope = 'game' | 'user';

export type BlockConfig = Record<string, unknown>;

export type BlockRegistryEntry<TConfig extends BlockConfig = BlockConfig> = {
  configSchema: z.ZodType<TConfig>;
  scope: BlockScope;
};

export const defineBlockDefinition = <TConfig extends BlockConfig>(
  definition: BlockRegistryEntry<TConfig>,
): BlockRegistryEntry<TConfig> => definition;
