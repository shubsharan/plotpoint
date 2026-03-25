import type { z } from 'zod';

export type BlockScope = 'game' | 'user';

export type BlockConfig = Record<string, unknown>;

export type BlockRegistryEntry = {
  configSchema: z.ZodType<BlockConfig>;
  scope: BlockScope;
};
