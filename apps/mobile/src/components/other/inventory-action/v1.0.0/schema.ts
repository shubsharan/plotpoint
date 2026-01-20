import { z } from 'zod';

export const inventoryActionSchema = z.object({
  action: z.enum(['add', 'remove', 'check', 'display']),
  itemId: z.string().optional(),
  itemName: z.string().optional(),
  itemDescription: z.string().optional(),
  itemImageUrl: z.string().url().optional(),
  quantity: z.number().int().default(1),
  message: z.string().optional(),
  autoAdvance: z.boolean().default(true),
});

export type InventoryActionSchema = z.infer<typeof inventoryActionSchema>;
