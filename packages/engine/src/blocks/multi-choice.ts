import { z } from "zod";
import type { BlockConfig, BlockRegistryEntry } from "./types.js";

const optionSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
  })
  .strict();

export const multiChoiceConfigSchema: z.ZodType<BlockConfig> = z
  .object({
    correctOptionIds: z.array(z.string().min(1)).min(1),
    maxSelections: z.number().int().positive().optional(),
    minSelections: z.number().int().nonnegative().optional(),
    options: z.array(optionSchema).min(1),
    prompt: z.string().min(1),
    shuffle: z.boolean().optional(),
  })
  .strict();

export const multiChoiceBlock: BlockRegistryEntry = {
  configSchema: multiChoiceConfigSchema,
  scope: "user",
};
