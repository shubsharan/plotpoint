import { z } from 'zod';
import type { BlockConfig, BlockRegistryEntry } from './types.js';

export const locationConfigSchema: z.ZodType<BlockConfig> = z
  .object({
    hint: z.string().min(1).optional(),
    radiusMeters: z.number().positive(),
    target: z.union([
      z
        .object({
          kind: z.literal('coordinates'),
          lat: z.number(),
          lng: z.number(),
        })
        .strict(),
      z
        .object({
          kind: z.literal('place'),
          placeId: z.string().min(1),
        })
        .strict(),
    ]),
    ui: z
      .object({
        variant: z.enum(['map', 'compass', 'hint']),
      })
      .strict(),
  })
  .strict();

export const locationBlock: BlockRegistryEntry = {
  configSchema: locationConfigSchema,
  scope: 'user',
};
