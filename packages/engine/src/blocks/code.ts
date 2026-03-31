import { z } from 'zod';
import { defineBlockDefinition, type BlockRegistryEntry } from './types.js';

type CodeBlockConfig = {
  caseSensitive?: boolean | undefined;
  expected: string;
  length?:
    | {
        max?: number | undefined;
        min?: number | undefined;
      }
    | undefined;
  maxAttempts?: number | undefined;
  mode: 'passcode' | 'password';
};

const codeConfigSchema: z.ZodType<CodeBlockConfig> = z
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
    mode: z.enum(['passcode', 'password']),
  })
  .strict();

export const codeBlock: BlockRegistryEntry<CodeBlockConfig> = defineBlockDefinition({
  configSchema: codeConfigSchema,
  scope: 'user',
});
