import { z } from "zod";
import type { BlockConfig, BlockRegistryEntry } from "./types.js";

const optionSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
  })
  .strict();

export const singleChoiceConfigSchema: z.ZodType<BlockConfig> = z
  .object({
    correctOptionId: z.string().min(1),
    options: z.array(optionSchema).min(1),
    prompt: z.string().min(1),
    shuffle: z.boolean().optional(),
  })
  .strict();

export const singleChoiceBlock: BlockRegistryEntry = {
  configSchema: singleChoiceConfigSchema,
  scope: "user",
};
