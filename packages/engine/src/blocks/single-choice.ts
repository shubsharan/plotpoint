import { z } from 'zod';
import {
  BlockUpdateError,
  defineBlockDefinition,
  type ExecutableBlockDefinition,
} from './types.js';

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

type SingleChoiceBlockAction = {
  optionId: string;
  type: 'submit';
};

type SingleChoiceAttempt = {
  isCorrect: boolean;
  submitted: SingleChoiceBlockAction;
  submittedAt?: string | undefined;
};

type SingleChoiceBlockState = {
  attempts: SingleChoiceAttempt[];
  correctOptionId: string;
  lastSubmittedAt?: string | undefined;
  optionIds: string[];
  resolved: boolean;
  selectedOptionId: string | null;
  unlocked: boolean;
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

const singleChoiceActionSchema: z.ZodType<SingleChoiceBlockAction> = z
  .object({
    optionId: z.string().min(1),
    type: z.literal('submit'),
  })
  .strict();

const singleChoiceAttemptSchema: z.ZodType<SingleChoiceAttempt> = z
  .object({
    isCorrect: z.boolean(),
    submitted: singleChoiceActionSchema,
    submittedAt: z.string().min(1).optional(),
  })
  .strict();

const singleChoiceStateSchema: z.ZodType<SingleChoiceBlockState> = z
  .object({
    attempts: z.array(singleChoiceAttemptSchema),
    correctOptionId: z.string().min(1),
    lastSubmittedAt: z.string().min(1).optional(),
    optionIds: z.array(z.string().min(1)).min(1),
    resolved: z.boolean(),
    selectedOptionId: z.string().min(1).nullable(),
    unlocked: z.boolean(),
  })
  .strict();

export const singleChoiceBlock: ExecutableBlockDefinition<
  SingleChoiceBlockConfig,
  SingleChoiceBlockState,
  SingleChoiceBlockAction
> = defineBlockDefinition({
  actionSchema: singleChoiceActionSchema,
  configSchema: singleChoiceConfigSchema,
  initialState: (config) => ({
    attempts: [],
    correctOptionId: config.correctOptionId,
    optionIds: config.options.map((option) => option.id),
    resolved: false,
    selectedOptionId: null,
    unlocked: false,
  }),
  interactive: true,
  isActionable: (state) => !state.resolved,
  scope: 'user',
  stateSchema: singleChoiceStateSchema,
  update: (state, action, context) => {
    if (!state.optionIds.includes(action.optionId)) {
      throw new BlockUpdateError(
        'action_invalid_for_config',
        `Option id "${action.optionId}" is not declared in this single-choice block.`,
        {
          optionId: action.optionId,
        },
      );
    }

    const isCorrect = action.optionId === state.correctOptionId;
    const submittedAt = context.nowIso;
    const attempt: SingleChoiceAttempt = submittedAt === undefined
      ? {
          isCorrect,
          submitted: action,
        }
      : {
          isCorrect,
          submitted: action,
          submittedAt,
        };

    return {
      attempts: [...state.attempts, attempt],
      correctOptionId: state.correctOptionId,
      lastSubmittedAt: submittedAt,
      optionIds: state.optionIds,
      resolved: true,
      selectedOptionId: action.optionId,
      unlocked: state.unlocked || isCorrect,
    };
  },
});
