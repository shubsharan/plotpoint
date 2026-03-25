import { z } from 'zod';
import type { BlockConfig, BlockRegistryEntry } from './types.js';

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
  .strict()
  .superRefine((config, context) => {
    const optionIdSet = new Set<string>();

    config.options.forEach((option, optionIndex) => {
      if (optionIdSet.has(option.id)) {
        context.addIssue({
          code: 'custom',
          message: `Option id "${option.id}" is duplicated.`,
          path: ['options', optionIndex, 'id'],
        });
        return;
      }

      optionIdSet.add(option.id);
    });

    const correctOptionIdSet = new Set<string>();
    config.correctOptionIds.forEach((correctOptionId, correctOptionIndex) => {
      if (correctOptionIdSet.has(correctOptionId)) {
        context.addIssue({
          code: 'custom',
          message: `correctOptionIds contains duplicate id "${correctOptionId}".`,
          path: ['correctOptionIds', correctOptionIndex],
        });
      } else {
        correctOptionIdSet.add(correctOptionId);
      }

      if (!optionIdSet.has(correctOptionId)) {
        context.addIssue({
          code: 'custom',
          message: `correctOptionIds[${correctOptionIndex}] "${correctOptionId}" must match a declared option id.`,
          path: ['correctOptionIds', correctOptionIndex],
        });
      }
    });

    if (
      config.minSelections !== undefined &&
      config.maxSelections !== undefined &&
      config.minSelections > config.maxSelections
    ) {
      context.addIssue({
        code: 'custom',
        message: 'minSelections cannot be greater than maxSelections.',
        path: ['minSelections'],
      });
    }

    if (config.minSelections !== undefined && config.minSelections > config.options.length) {
      context.addIssue({
        code: 'custom',
        message: 'minSelections cannot be greater than options length.',
        path: ['minSelections'],
      });
    }

    if (config.maxSelections !== undefined && config.maxSelections > config.options.length) {
      context.addIssue({
        code: 'custom',
        message: 'maxSelections cannot be greater than options length.',
        path: ['maxSelections'],
      });
    }
  });

export const multiChoiceBlock: BlockRegistryEntry = {
  configSchema: multiChoiceConfigSchema,
  scope: 'user',
};
