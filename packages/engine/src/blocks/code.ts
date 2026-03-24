import { z } from "zod";
import type { BlockConfig, BlockRegistryEntry } from "./types.js";

export const codeConfigSchema: z.ZodType<BlockConfig> = z
  .object({
    caseSensitive: z.boolean().optional(),
    expected: z.string().min(1),
    length: z
      .object({
        max: z.number().int().positive().optional(),
        min: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
    maxAttempts: z.number().int().positive().optional(),
    mode: z.enum(["passcode", "password"]),
  })
  .strict();

export const codeBlock: BlockRegistryEntry = {
  configSchema: codeConfigSchema,
  scope: "user",
};
