import { z } from 'zod';
import { defineBlockDefinition, type BlockRegistryEntry } from './types.js';

type LocationBlockConfig = {
  hint?: string | undefined;
  radiusMeters: number;
  target:
    | {
        kind: 'coordinates';
        lat: number;
        lng: number;
      }
    | {
        kind: 'place';
        placeId: string;
      };
  ui: {
    variant: 'compass' | 'hint' | 'map';
  };
};

const locationConfigSchema: z.ZodType<LocationBlockConfig> = z
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

export const locationBlock: BlockRegistryEntry<LocationBlockConfig> = defineBlockDefinition({
  configSchema: locationConfigSchema,
  scope: 'user',
});
