import { z } from 'zod';
import {
  BlockUpdateError,
  defineBlockBehavior,
  type BlockTraversalFacts,
  type InteractiveBlockBehavior,
} from './types.js';

type MultiChoiceOption = {
  id: string;
  label: string;
};

type MultiChoiceBlockConfig = {
  correctOptionIds: string[];
  maxSelections?: number | undefined;
  minSelections?: number | undefined;
  options: MultiChoiceOption[];
  prompt: string;
  shuffle?: boolean | undefined;
};

type MultiChoiceBlockAction = {
  optionIds: string[];
  type: 'submit';
};

type MultiChoiceAttempt = {
  isCorrect: boolean;
  normalizedOptionIds: string[];
  submitted: MultiChoiceBlockAction;
  submittedAt?: string | undefined;
};

type MultiChoiceBlockState = {
  attempts: MultiChoiceAttempt[];
  lastSubmittedAt?: string | undefined;
  selectedOptionIds: string[];
  unlocked: boolean;
};

const optionSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
  })
  .strict();

const multiChoiceConfigSchema: z.ZodType<MultiChoiceBlockConfig> = z
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

const multiChoiceActionSchema: z.ZodType<MultiChoiceBlockAction> = z
  .object({
    optionIds: z.array(z.string().min(1)).min(1),
    type: z.literal('submit'),
  })
  .strict();

const multiChoiceAttemptSchema: z.ZodType<MultiChoiceAttempt> = z
  .object({
    isCorrect: z.boolean(),
    normalizedOptionIds: z.array(z.string().min(1)),
    submitted: multiChoiceActionSchema,
    submittedAt: z.string().min(1).optional(),
  })
  .strict();

const multiChoiceStateSchema: z.ZodType<MultiChoiceBlockState> = z
  .object({
    attempts: z.array(multiChoiceAttemptSchema),
    lastSubmittedAt: z.string().min(1).optional(),
    selectedOptionIds: z.array(z.string().min(1)),
    unlocked: z.boolean(),
  })
  .strict();

const normalizeOptionIds = (optionIds: string[]): string[] =>
  [...new Set(optionIds)].sort((left, right) => left.localeCompare(right));

const hasSameOptions = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((optionId, index) => optionId === right[index]);

export const multiChoiceBlockBehavior: InteractiveBlockBehavior<
  MultiChoiceBlockConfig,
  MultiChoiceBlockState,
  MultiChoiceBlockAction
> = defineBlockBehavior({
  configSchema: multiChoiceConfigSchema,
  initialState: (): MultiChoiceBlockState => ({
    attempts: [],
    selectedOptionIds: [],
    unlocked: false,
  }),
  interactive: true,
  isActionable: (state) =>
    !state.unlocked && state.selectedOptionIds.length === 0 && state.attempts.length === 0,
  stateSchema: multiChoiceStateSchema,
  onAction: (state, action, context, config) => {
    const normalizedOptionIds = normalizeOptionIds(action.optionIds);
    const allowedOptionIds = config.options.map((option) => option.id);
    const unknownOptionIds = normalizedOptionIds.filter(
      (optionId) => !allowedOptionIds.includes(optionId),
    );

    if (unknownOptionIds.length > 0) {
      throw new BlockUpdateError(
        'action_invalid_for_config',
        'Submitted option ids include values not declared in this multi-choice block.',
        {
          optionIds: unknownOptionIds,
        },
      );
    }

    if (config.minSelections !== undefined && normalizedOptionIds.length < config.minSelections) {
      throw new BlockUpdateError(
        'action_invalid_for_config',
        `Submitted selections must include at least ${config.minSelections} options.`,
        {
          minSelections: config.minSelections,
          normalizedOptionCount: normalizedOptionIds.length,
        },
      );
    }

    if (config.maxSelections !== undefined && normalizedOptionIds.length > config.maxSelections) {
      throw new BlockUpdateError(
        'action_invalid_for_config',
        `Submitted selections must include at most ${config.maxSelections} options.`,
        {
          maxSelections: config.maxSelections,
          normalizedOptionCount: normalizedOptionIds.length,
        },
      );
    }

    const isCorrect = hasSameOptions(
      normalizedOptionIds,
      normalizeOptionIds(config.correctOptionIds),
    );
    const previouslyUnlocked = state.unlocked || state.attempts.some((attempt) => attempt.isCorrect);
    const submittedAt = context.nowIso;
    const attempt: MultiChoiceAttempt = submittedAt === undefined
      ? {
          isCorrect,
          normalizedOptionIds,
          submitted: action,
        }
      : {
          isCorrect,
          normalizedOptionIds,
          submitted: action,
          submittedAt,
        };

    return {
      attempts: [...state.attempts, attempt],
      lastSubmittedAt: submittedAt,
      selectedOptionIds: normalizedOptionIds,
      unlocked: previouslyUnlocked || isCorrect,
    };
  },
  actionSchema: multiChoiceActionSchema,
});

export const multiChoiceBlockTraversalFacts: BlockTraversalFacts<
  MultiChoiceBlockConfig,
  MultiChoiceBlockState
> = {
  answered: {
    derive: ({ state }) => state.selectedOptionIds.length > 0,
    kind: 'boolean',
  },
  correct: {
    derive: ({ state }) => state.unlocked,
    kind: 'boolean',
  },
  selectedCount: {
    derive: ({ state }) => state.selectedOptionIds.length,
    kind: 'number',
  },
  unlocked: {
    derive: ({ state }) => state.unlocked,
    kind: 'boolean',
  },
};
