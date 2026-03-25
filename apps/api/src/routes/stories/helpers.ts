import type { StoryRow, createStory, patchStory, updateStory } from '@plotpoint/db';
import type { Context } from 'hono';
import { z } from 'zod';
import {
  pathParamsSchema,
  storyIdConflictResponseSchema,
  storyNotFoundResponseSchema,
  validationErrorResponseSchema,
} from './contracts.js';
import type {
  CreateStoryRequest,
  PatchStoryRequest,
  PutStoryRequest,
  StoryResponse,
  ValidationIssue,
} from './contracts.js';

export const mapIssues = (issues: z.core.$ZodIssue[]): ValidationIssue[] =>
  issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path.map((segment) => (typeof segment === 'number' ? segment : String(segment))),
  }));

export const validationError = (context: Context, issues: ValidationIssue[]) =>
  context.json(
    validationErrorResponseSchema.parse({
      error: {
        code: 'validation_error',
        issues,
      },
    }),
    400,
  );

export const parseStoryId = (context: Context) => {
  const result = pathParamsSchema.safeParse(context.req.param());

  if (!result.success) {
    return {
      success: false as const,
      response: validationError(context, mapIssues(result.error.issues)),
    };
  }

  return { success: true as const, storyId: result.data.id };
};

export const parseJsonBody = async <TSchema extends z.ZodTypeAny>(
  context: Context,
  schema: TSchema,
) => {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    return {
      success: false as const,
      response: validationError(context, [
        {
          code: 'invalid_json',
          message: 'Request body must be valid JSON.',
          path: [],
        },
      ]),
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      success: false as const,
      response: validationError(context, mapIssues(parsed.error.issues)),
    };
  }

  return { success: true as const, data: parsed.data };
};

export const toStoryResponse = (story: StoryRow): StoryResponse => ({
  id: story.id,
  title: story.title,
  summary: story.summary,
  status: story.status,
  draftBundleUri: story.draftBundleUri,
  createdAt: story.createdAt.toISOString(),
  updatedAt: story.updatedAt.toISOString(),
});

export const toCreateStoryInput = (
  request: CreateStoryRequest,
): Parameters<typeof createStory>[0] => ({
  storyId: request.id,
  title: request.title,
  summary: request.summary ?? null,
  draftBundleUri: request.draftBundleUri,
});

export const toPutStoryInput = (
  storyId: string,
  request: PutStoryRequest,
): Parameters<typeof updateStory>[0] => ({
  storyId,
  title: request.title,
  summary: request.summary ?? null,
  draftBundleUri: request.draftBundleUri,
});

export const toPatchStoryInput = (
  storyId: string,
  request: PatchStoryRequest,
): Parameters<typeof patchStory>[0] => ({
  storyId,
  ...(request.title !== undefined ? { title: request.title } : {}),
  ...(request.summary !== undefined ? { summary: request.summary } : {}),
  ...(request.draftBundleUri !== undefined ? { draftBundleUri: request.draftBundleUri } : {}),
});

export const isUniqueViolationError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  return 'code' in error && error.code === '23505';
};

export const storyNotFound = (context: Context, storyId: string) =>
  context.json(
    storyNotFoundResponseSchema.parse({
      error: {
        code: 'story_not_found',
        storyId,
      },
    }),
    404,
  );

export const storyIdConflict = (context: Context, storyId: string) =>
  context.json(
    storyIdConflictResponseSchema.parse({
      error: {
        code: 'story_id_conflict',
        storyId,
      },
    }),
    409,
  );
