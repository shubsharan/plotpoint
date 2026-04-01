import { z } from 'zod';
import { defineBlockDefinition, type ExecutableBlockDefinition } from './types.js';

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
  attemptsCount: number;
  caseSensitive: boolean;
  exhausted: boolean;
  expected: string;
  lastSubmittedAt?: string | undefined;
  maxAttempts?: number | undefined;
  maxLength?: number | undefined;
  minLength?: number | undefined;
  mode: 'passcode' | 'password';
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
    attemptsCount: z.number().int().nonnegative(),
    caseSensitive: z.boolean(),
    exhausted: z.boolean(),
    expected: z.string().min(1),
    lastSubmittedAt: z.string().min(1).optional(),
    maxAttempts: z.number().int().positive().optional(),
    maxLength: z.number().int().positive().optional(),
    minLength: z.number().int().positive().optional(),
    mode: z.enum(['passcode', 'password']),
    unlocked: z.boolean(),
  })
  .strict();

const resolveIsCorrect = (state: CodeBlockState, submittedValue: string): boolean => {
  const expectedValue = state.caseSensitive ? state.expected : state.expected.toLowerCase();
  const normalizedSubmitted = state.caseSensitive
    ? submittedValue
    : submittedValue.toLowerCase();

  if (state.minLength !== undefined && submittedValue.length < state.minLength) {
    return false;
  }

  if (state.maxLength !== undefined && submittedValue.length > state.maxLength) {
    return false;
  }

  return normalizedSubmitted === expectedValue;
};

export const codeBlock: ExecutableBlockDefinition<CodeBlockConfig, CodeBlockState, CodeBlockAction> = defineBlockDefinition({
  actionSchema: codeActionSchema,
  configSchema: codeConfigSchema,
  initialState: (config) => ({
    attempts: [],
    attemptsCount: 0,
    caseSensitive: config.caseSensitive ?? false,
    exhausted: false,
    expected: config.expected,
    maxAttempts: config.maxAttempts,
    maxLength: config.length?.max,
    minLength: config.length?.min,
    mode: config.mode,
    unlocked: false,
  }),
  interactive: true,
  isActionable: (state) => !state.exhausted,
  scope: 'user',
  stateSchema: codeStateSchema,
  update: (state, action, context) => {
    const isCorrect = resolveIsCorrect(state, action.value);
    const attemptsCount = state.attemptsCount + 1;
    const exhausted =
      !isCorrect &&
      state.maxAttempts !== undefined &&
      attemptsCount >= state.maxAttempts;

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
      attemptsCount,
      caseSensitive: state.caseSensitive,
      exhausted,
      expected: state.expected,
      lastSubmittedAt: submittedAt,
      maxAttempts: state.maxAttempts,
      maxLength: state.maxLength,
      minLength: state.minLength,
      mode: state.mode,
      unlocked: state.unlocked || isCorrect,
    };
  },
});
