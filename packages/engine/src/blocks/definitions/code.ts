import { z } from 'zod';
import {
  defineBlockBehavior,
  type BlockTraversalFacts,
  type InteractiveBlockBehavior,
} from '../contracts.js';

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

type CodeBlockAction = {
  type: 'submit';
  value: string;
};

type CodeBlockAttempt = {
  isCorrect: boolean;
  submitted: CodeBlockAction;
  submittedAt?: string | undefined;
};

type CodeBlockState = {
  attempts: CodeBlockAttempt[];
  lastSubmittedAt?: string | undefined;
  unlocked: boolean;
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
  .superRefine((config, context) => {
    if (config.length?.min !== undefined && config.length?.max !== undefined && config.length.min > config.length.max) {
      context.addIssue({
        code: 'custom',
        message: 'length.min cannot be greater than length.max.',
        path: ['length', 'min'],
      });
    }
  })
  .strict();

const codeActionSchema: z.ZodType<CodeBlockAction> = z
  .object({
    type: z.literal('submit'),
    value: z.string(),
  })
  .strict();

const codeAttemptSchema: z.ZodType<CodeBlockAttempt> = z
  .object({
    isCorrect: z.boolean(),
    submitted: codeActionSchema,
    submittedAt: z.string().min(1).optional(),
  })
  .strict();

const codeStateSchema: z.ZodType<CodeBlockState> = z
  .object({
    attempts: z.array(codeAttemptSchema),
    lastSubmittedAt: z.string().min(1).optional(),
    unlocked: z.boolean(),
  })
  .strict();

const resolveIsCorrect = (config: CodeBlockConfig, submittedValue: string): boolean => {
  const caseSensitive = config.caseSensitive ?? false;
  const expectedValue = caseSensitive ? config.expected : config.expected.toLowerCase();
  const normalizedSubmitted = caseSensitive
    ? submittedValue
    : submittedValue.toLowerCase();

  if (config.length?.min !== undefined && submittedValue.length < config.length.min) {
    return false;
  }

  if (config.length?.max !== undefined && submittedValue.length > config.length.max) {
    return false;
  }

  return normalizedSubmitted === expectedValue;
};

export const codeBlockBehavior: InteractiveBlockBehavior<
  CodeBlockConfig,
  CodeBlockState,
  CodeBlockAction
> = defineBlockBehavior({
  configSchema: codeConfigSchema,
  initialState: (): CodeBlockState => ({
    attempts: [],
    unlocked: false,
  }),
  interactive: true,
  isActionable: (state, config) =>
    !state.unlocked &&
    !state.attempts.some((attempt) => attempt.isCorrect) &&
    (config.maxAttempts === undefined || state.attempts.length < config.maxAttempts),
  stateSchema: codeStateSchema,
  onAction: (state, action, context, config) => {
    const isCorrect = resolveIsCorrect(config, action.value);
    const previouslyUnlocked = state.unlocked || state.attempts.some((attempt) => attempt.isCorrect);

    const submittedAt = context.nowIso;
    const attempt: CodeBlockAttempt = submittedAt === undefined
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
      unlocked: previouslyUnlocked || isCorrect,
    };
  },
  actionSchema: codeActionSchema,
});

export const codeBlockTraversalFacts: BlockTraversalFacts<CodeBlockConfig, CodeBlockState> = {
  attemptsCount: {
    derive: ({ state }) => state.attempts.length,
    kind: 'number',
  },
  unlocked: {
    derive: ({ state }) => state.unlocked,
    kind: 'boolean',
  },
};
