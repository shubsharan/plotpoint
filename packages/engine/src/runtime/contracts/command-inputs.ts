import { z } from 'zod';
import type { SessionState } from './session-state.js';
import { nonEmptyStringSchema, sessionStateSchema } from './session-state.js';

export type LoadSessionInput = {
  state: SessionState;
};

export type StartSessionInput = {
  gameId: string;
  playerId: string;
  roleId: string;
  storyId: string;
};

export type SubmitActionInput = {
  action: unknown;
  blockId: string;
  state: SessionState;
};

export type TraverseInput = {
  edgeId: string;
  state: SessionState;
};

const requiredUnknownSchema: z.ZodType<unknown> = z.unknown().refine(
  (value) => value !== undefined,
);

export const loadSessionInputSchema: z.ZodType<LoadSessionInput> = z
  .object({
    state: sessionStateSchema,
  })
  .strict();

export const startSessionInputSchema: z.ZodType<StartSessionInput> = z
  .object({
    gameId: nonEmptyStringSchema,
    playerId: nonEmptyStringSchema,
    roleId: nonEmptyStringSchema,
    storyId: nonEmptyStringSchema,
  })
  .strict();

export const submitActionInputSchema: z.ZodType<SubmitActionInput> = z
  .object({
    action: requiredUnknownSchema,
    blockId: nonEmptyStringSchema,
    state: sessionStateSchema,
  })
  .strict();

export const traverseInputSchema: z.ZodType<TraverseInput> = z
  .object({
    edgeId: nonEmptyStringSchema,
    state: sessionStateSchema,
  })
  .strict();
