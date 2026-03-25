import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  type CreateStoryRequest,
  type PatchStoryRequest,
  type PutStoryRequest,
  createStoryRequestSchema,
  deleteStoryResponseSchema,
  pathParamsSchema,
  patchStoryRequestSchema,
  putStoryRequestSchema,
  storyIdConflictResponseSchema,
  storyNotFoundResponseSchema,
  validationErrorResponseSchema,
} from './contracts.js';
import type { ValidationIssue } from './contracts.js';

type StoryCrudReadModel = {
  createdAt: Date;
  draftBundleUri: string;
  id: string;
  status: 'draft' | 'published' | 'archived';
  summary: string | null;
  title: string;
  updatedAt: Date;
};

export type StoriesRouteDeps = {
  createStory: (input: CreateStoryRequest) => Promise<StoryCrudReadModel>;
  deleteStory: (storyId: string) => Promise<boolean>;
  getStory: (storyId: string) => Promise<StoryCrudReadModel | null>;
  listStories: () => Promise<StoryCrudReadModel[]>;
  patchStory: (input: PatchStoryRequest & { id: string }) => Promise<StoryCrudReadModel | null>;
  updateStory: (input: PutStoryRequest & { id: string }) => Promise<StoryCrudReadModel | null>;
};

export const createStoriesRoutes = (deps: StoriesRouteDeps) => {
  const stories = new Hono();

  stories.get('/', async (context) => {
    return context.json(await deps.listStories(), 200);
  });

  stories.get('/:id', async (context) => {
    const path = parseStoryId(context);
    if (!path.success) {
      return path.response;
    }

    const story = await deps.getStory(path.storyId);
    if (!story) {
      return storyNotFound(context, path.storyId);
    }

    return context.json(story, 200);
  });

  stories.post('/', async (context) => {
    const parsedBody = await parseJsonBody(context, createStoryRequestSchema);
    if (!parsedBody.success) {
      return parsedBody.response;
    }

    try {
      const story = await deps.createStory(parsedBody.data);

      return context.json(story, 201);
    } catch (error) {
      if (isUniqueViolationError(error)) {
        return storyIdConflict(context, parsedBody.data.id);
      }

      throw error;
    }
  });

  stories.put('/:id', async (context) => {
    const path = parseStoryId(context);
    if (!path.success) {
      return path.response;
    }

    const parsedBody = await parseJsonBody(context, putStoryRequestSchema);
    if (!parsedBody.success) {
      return parsedBody.response;
    }

    const story = await deps.updateStory({
      id: path.storyId,
      ...parsedBody.data,
    });
    if (!story) {
      return storyNotFound(context, path.storyId);
    }

    return context.json(story, 200);
  });

  stories.patch('/:id', async (context) => {
    const path = parseStoryId(context);
    if (!path.success) {
      return path.response;
    }

    const parsedBody = await parseJsonBody(context, patchStoryRequestSchema);
    if (!parsedBody.success) {
      return parsedBody.response;
    }

    const story = await deps.patchStory({
      id: path.storyId,
      ...parsedBody.data,
    });
    if (!story) {
      return storyNotFound(context, path.storyId);
    }

    return context.json(story, 200);
  });

  stories.delete('/:id', async (context) => {
    const path = parseStoryId(context);
    if (!path.success) {
      return path.response;
    }

    const deleted = await deps.deleteStory(path.storyId);
    if (!deleted) {
      return storyNotFound(context, path.storyId);
    }

    return context.json(deleteStoryResponseSchema.parse({ deleted: true }), 200);
  });

  return stories;
};

const mapIssues = (issues: z.core.$ZodIssue[]): ValidationIssue[] =>
  issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path.map((segment) => (typeof segment === 'number' ? segment : String(segment))),
  }));

const validationError = (context: Context, issues: ValidationIssue[]) =>
  context.json(
    validationErrorResponseSchema.parse({
      error: {
        code: 'validation_error',
        issues,
      },
    }),
    400,
  );

const parseStoryId = (context: Context) => {
  const result = pathParamsSchema.safeParse(context.req.param());

  if (!result.success) {
    return {
      success: false as const,
      response: validationError(context, mapIssues(result.error.issues)),
    };
  }

  return { success: true as const, storyId: result.data.id };
};

const parseJsonBody = async <TSchema extends z.ZodTypeAny>(
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

const isUniqueViolationError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  return 'code' in error && error.code === '23505';
};

const storyNotFound = (context: Context, storyId: string) =>
  context.json(
    storyNotFoundResponseSchema.parse({
      error: {
        code: 'story_not_found',
        storyId,
      },
    }),
    404,
  );

const storyIdConflict = (context: Context, storyId: string) =>
  context.json(
    storyIdConflictResponseSchema.parse({
      error: {
        code: 'story_id_conflict',
        storyId,
      },
    }),
    409,
  );
