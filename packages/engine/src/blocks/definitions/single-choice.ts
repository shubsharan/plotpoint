import { z } from 'zod';
import {
  BlockUpdateError,
  defineBlockBehavior,
  type BlockTraversalFacts,
  type InteractiveBlockBehavior,
} from '../contracts.js';

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
  lastSubmittedAt?: string | undefined;
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
    lastSubmittedAt: z.string().min(1).optional(),
    selectedOptionId: z.string().min(1).nullable(),
    unlocked: z.boolean(),
  })
  .strict();

export const singleChoiceBlockBehavior: InteractiveBlockBehavior<
  SingleChoiceBlockConfig,
  SingleChoiceBlockState,
  SingleChoiceBlockAction
> = defineBlockBehavior({
  configSchema: singleChoiceConfigSchema,
  initialState: (): SingleChoiceBlockState => ({
    attempts: [],
    selectedOptionId: null,
    unlocked: false,
  }),
  interactive: true,
  isActionable: (state) =>
    !state.unlocked && state.selectedOptionId === null && state.attempts.length === 0,
  stateSchema: singleChoiceStateSchema,
  onAction: (state, action, context, config) => {
    const optionIds = config.options.map((option) => option.id);
    if (!optionIds.includes(action.optionId)) {
      throw new BlockUpdateError(
        'action_invalid_for_config',
        `Option id "${action.optionId}" is not declared in this single-choice block.`,
        {
          optionId: action.optionId,
        },
      );
    }

    const isCorrect = action.optionId === config.correctOptionId;
    const previouslyUnlocked = state.unlocked || state.attempts.some((attempt) => attempt.isCorrect);
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
      lastSubmittedAt: submittedAt,
      selectedOptionId: action.optionId,
      unlocked: previouslyUnlocked || isCorrect,
    };
  },
  actionSchema: singleChoiceActionSchema,
});

export const singleChoiceBlockTraversalFacts: BlockTraversalFacts<
  SingleChoiceBlockConfig,
  SingleChoiceBlockState
> = {
  answered: {
    derive: ({ state }) => state.selectedOptionId !== null,
    kind: 'boolean',
  },
  correct: {
    derive: ({ state }) => state.unlocked,
    kind: 'boolean',
  },
  unlocked: {
    derive: ({ state }) => state.unlocked,
    kind: 'boolean',
  },
};
