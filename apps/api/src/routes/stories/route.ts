import type { Context } from 'hono';
import { Hono } from 'hono';
import {
  storyBundleSchema,
  type StoryBundle,
  type StoryBundleValidationIssue,
  validateStoryBundleCompatibility,
  validateStoryBundleStructure,
} from '@plotpoint/engine';
import type { StoryQueries } from '@plotpoint/db';
import { z } from 'zod';
import {
  type PublishValidationIssue,
  createStoryRequestSchema,
  deleteStoryResponseSchema,
  pathParamsSchema,
  patchStoryRequestSchema,
  publishStoryResponseSchema,
  publishValidationFailedResponseSchema,
  putStoryRequestSchema,
  storyDeleteConflictResponseSchema,
  storyIdConflictResponseSchema,
  storyNotFoundResponseSchema,
  storyViewQuerySchema,
  validationErrorResponseSchema,
} from './contracts.js';
import type { ValidationIssue } from './contracts.js';

export type StoriesRouteDeps = {
  currentEngineMajor: number;
  createStory: StoryQueries['createStory'];
  deleteStory: StoryQueries['deleteStory'];
  getPublishedStory: StoryQueries['getPublishedStory'];
  getStory: StoryQueries['getStory'];
  listPublishedStories: StoryQueries['listPublishedStories'];
  listStories: StoryQueries['listStories'];
  patchStory: StoryQueries['patchStory'];
  publishStory: StoryQueries['publishStory'];
  deletePublishedStoryBundle: (bundleUri: string) => Promise<void>;
  readStoryBundle: (bundleUri: string) => Promise<unknown>;
  updateStory: StoryQueries['updateStory'];
  writePublishedStoryBundle: (input: {
    bundle: StoryBundle;
    publishedAt: Date;
    storyId: string;
  }) => Promise<string>;
};

export const createStoriesRoutes = (deps: StoriesRouteDeps) => {
  const stories = new Hono();

  stories.get('/', async (context) => {
    const view = parseStoryView(context);
    if (!view.success) {
      return view.response;
    }

    if (view.value.view === 'published') {
      return context.json(await deps.listPublishedStories(), 200);
    }

    return context.json(await deps.listStories(), 200);
  });

  stories.get('/:id', async (context) => {
    const path = parseStoryId(context);
    if (!path.success) {
      return path.response;
    }

    const view = parseStoryView(context);
    if (!view.success) {
      return view.response;
    }

    const story =
      view.value.view === 'published'
        ? await deps.getPublishedStory(path.storyId)
        : await deps.getStory(path.storyId);

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

  stories.post('/:id/publish', async (context) => {
    const path = parseStoryId(context);
    if (!path.success) {
      return path.response;
    }

    const story = await deps.getStory(path.storyId);
    if (!story) {
      return storyNotFound(context, path.storyId);
    }

    const rawBundle = await deps.readStoryBundle(story.draftBundleUri);
    const publishBundle = preparePublishBundle({
      currentEngineMajor: deps.currentEngineMajor,
      rawBundle,
      storyId: path.storyId,
    });
    if (!publishBundle.success) {
      return publishValidationFailed(context, path.storyId, publishBundle.issues);
    }

    const publishedAt = new Date();
    const publishedBundleUri = await deps.writePublishedStoryBundle({
      bundle: publishBundle.bundle,
      publishedAt,
      storyId: path.storyId,
    });
    let publishedStory: Awaited<ReturnType<StoriesRouteDeps['publishStory']>>;
    try {
      publishedStory = await deps.publishStory({
        engineMajor: deps.currentEngineMajor,
        publishedAt,
        publishedBundleUri,
        storyId: path.storyId,
        summary: story.summary,
        title: story.title,
      });
    } catch (error) {
      const publishError = asError(error);
      await rollbackPublishedBundleOrThrow({
        deps,
        publishedBundleUri,
        publishError,
      });
      throw publishError;
    }

    if (!publishedStory) {
      const publishError = new Error(
        `Story "${path.storyId}" no longer exists while finalizing publish.`,
      );
      await rollbackPublishedBundleOrThrow({
        deps,
        publishedBundleUri,
        publishError,
      });
      return storyNotFound(context, path.storyId);
    }

    return context.json(publishStoryResponseSchema.parse(publishedStory), 201);
  });

  stories.delete('/:id', async (context) => {
    const path = parseStoryId(context);
    if (!path.success) {
      return path.response;
    }

    const deleteResult = await deps.deleteStory(path.storyId);
    if (deleteResult === 'not_found') {
      return storyNotFound(context, path.storyId);
    }
    if (deleteResult === 'has_published_snapshots') {
      return storyDeleteConflict(context, path.storyId);
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

const mapSchemaIssues = (issues: z.core.$ZodIssue[]): PublishValidationIssue[] =>
  issues.map((issue) => ({
    code: issue.code,
    layer: 'schema',
    message: issue.message,
    path: issue.path.map((segment) => (typeof segment === 'number' ? segment : String(segment))),
  }));

const mapStoryBundleIssues = (
  issues: ReadonlyArray<StoryBundleValidationIssue>,
): PublishValidationIssue[] =>
  issues.map((issue) => ({
    code: issue.code,
    ...(issue.details === undefined ? {} : { details: issue.details }),
    layer: issue.layer,
    message: issue.message,
    path: [...issue.path],
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

const publishValidationFailed = (
  context: Context,
  storyId: string,
  issues: PublishValidationIssue[],
) =>
  context.json(
    publishValidationFailedResponseSchema.parse({
      error: {
        code: 'publish_validation_failed',
        issues,
        storyId,
      },
    }),
    422,
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

const parseStoryView = (context: Context) => {
  const result = storyViewQuerySchema.safeParse(context.req.query());
  if (!result.success) {
    return {
      success: false as const,
      response: validationError(context, mapIssues(result.error.issues)),
    };
  }

  return { success: true as const, value: result.data };
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

const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

const rollbackPublishedBundleOrThrow = async (input: {
  deps: Pick<StoriesRouteDeps, 'deletePublishedStoryBundle'>;
  publishedBundleUri: string;
  publishError: Error;
}) => {
  try {
    await input.deps.deletePublishedStoryBundle(input.publishedBundleUri);
  } catch (rollbackError) {
    const rollbackMessage =
      rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
    throw new Error(
      `Failed to rollback published bundle "${input.publishedBundleUri}": ${rollbackMessage}`,
      {
        cause: input.publishError,
      },
    );
  }
};

const parseDraftBundleForPublish = (
  rawBundle: unknown,
  currentEngineMajor: number,
):
  | { success: false; issues: PublishValidationIssue[] }
  | { success: true; bundle: StoryBundle } => {
  const schemaResult = storyBundleSchema.safeParse(rawBundle);
  if (!schemaResult.success) {
    return {
      success: false,
      issues: mapSchemaIssues(schemaResult.error.issues),
    };
  }

  const bundle = schemaResult.data;
  const issues = [
    ...mapStoryBundleIssues(validateStoryBundleStructure(bundle)),
    ...mapStoryBundleIssues(
      validateStoryBundleCompatibility(bundle, {
        currentEngineMajor,
        mode: 'draft',
      }),
    ),
  ];
  if (issues.length > 0) {
    return {
      success: false,
      issues,
    };
  }

  return {
    success: true,
    bundle,
  };
};

const preparePublishBundle = (input: {
  currentEngineMajor: number;
  rawBundle: unknown;
  storyId: string;
}):
  | { success: false; issues: PublishValidationIssue[] }
  | { success: true; bundle: StoryBundle } => {
  const draftBundle = parseDraftBundleForPublish(input.rawBundle, input.currentEngineMajor);
  if (!draftBundle.success) {
    return draftBundle;
  }

  const parsedBundle = draftBundle.bundle;
  if (parsedBundle.metadata.storyId !== input.storyId) {
    return {
      success: false,
      issues: [
        {
          code: 'story-id-mismatch',
          details: {
            bundleStoryId: parsedBundle.metadata.storyId,
            storyId: input.storyId,
          },
          layer: 'structure',
          message: `Bundle metadata storyId "${parsedBundle.metadata.storyId}" does not match requested story "${input.storyId}".`,
          path: ['metadata', 'storyId'],
        },
      ],
    };
  }

  const stampedBundle: StoryBundle = {
    ...parsedBundle,
    version: {
      ...parsedBundle.version,
      engineMajor: input.currentEngineMajor,
    },
  };

  const publishCompatibilityIssues = mapStoryBundleIssues(
    validateStoryBundleCompatibility(stampedBundle, {
      currentEngineMajor: input.currentEngineMajor,
      mode: 'published',
    }),
  );
  if (publishCompatibilityIssues.length > 0) {
    return {
      success: false,
      issues: publishCompatibilityIssues,
    };
  }

  return {
    success: true,
    bundle: stampedBundle,
  };
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

const storyDeleteConflict = (context: Context, storyId: string) =>
  context.json(
    storyDeleteConflictResponseSchema.parse({
      error: {
        code: 'story_delete_conflict',
        reason: 'published_snapshots_exist',
        storyId,
      },
    }),
    409,
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
