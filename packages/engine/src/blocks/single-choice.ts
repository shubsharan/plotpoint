import { z } from 'zod';
import { defineBlockDefinition, type BlockRegistryEntry } from './types.js';

type SingleChoiceOption = {
  id: string;
  label: string;
};

type SingleChoiceBlockConfig = {
  correctOptionId: string;
  options: SingleChoiceOption[];
  prompt: string;
  shuffle?: boolean | undefined;
};

const optionSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
  })
  .strict();

const singleChoiceConfigSchema: z.ZodType<SingleChoiceBlockConfig> = z
  .object({
    correctOptionId: z.string().min(1),
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

    if (!optionIdSet.has(config.correctOptionId)) {
      context.addIssue({
        code: 'custom',
        message: `correctOptionId "${config.correctOptionId}" must match a declared option id.`,
        path: ['correctOptionId'],
      });
    }
  });

export const singleChoiceBlock: BlockRegistryEntry<SingleChoiceBlockConfig> = defineBlockDefinition({
  configSchema: singleChoiceConfigSchema,
  scope: 'user',
});
