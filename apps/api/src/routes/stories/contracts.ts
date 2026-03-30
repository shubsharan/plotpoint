import { z } from 'zod';

const storyIdSchema = z.string().trim().min(1);
const storyViewSchema = z.enum(['draft', 'published']);

const storyWriteFieldsSchema = z.object({
  draftBundleUri: z.url(),
  summary: z.string().optional(),
  title: z.string().trim().min(1),
});

const patchStoryWriteFieldsSchema = storyWriteFieldsSchema
  .extend({
    summary: z.string().nullable().optional(),
  })
  .partial()
  .refine(
    (value) =>
      value.title !== undefined ||
      value.summary !== undefined ||
      value.draftBundleUri !== undefined,
    {
      message: 'At least one field must be provided.',
    },
  );

export const createStoryRequestSchema = storyWriteFieldsSchema
  .extend({
    id: storyIdSchema,
  })
  .transform((value) => ({
    ...value,
    summary: value.summary ?? null,
  }));

export const putStoryRequestSchema = storyWriteFieldsSchema
  .extend({
    summary: z.string().nullable().optional(),
  })
  .transform((value) => ({
    ...value,
    summary: value.summary ?? null,
  }));

export const patchStoryRequestSchema = patchStoryWriteFieldsSchema.transform((value) => {
  const normalized: {
    draftBundleUri?: string;
    summary?: string | null;
    title?: string;
  } = {};

  if (value.draftBundleUri !== undefined) {
    normalized.draftBundleUri = value.draftBundleUri;
  }
  if (value.summary !== undefined) {
    normalized.summary = value.summary;
  }
  if (value.title !== undefined) {
    normalized.title = value.title;
  }

  return normalized;
});

export const pathParamsSchema = z.object({
  id: storyIdSchema,
});

export const storyViewQuerySchema = z
  .object({
    view: storyViewSchema.optional(),
  })
  .transform((value) => ({
    view: value.view ?? 'draft',
  }));

export const validationIssueSchema = z.object({
  code: z.string(),
  message: z.string(),
  path: z.array(z.union([z.string(), z.number()])),
});

export const validationErrorResponseSchema = z.object({
  error: z.object({
    code: z.literal('validation_error'),
    issues: z.array(validationIssueSchema),
  }),
});

export const storyNotFoundResponseSchema = z.object({
  error: z.object({
    code: z.literal('story_not_found'),
    storyId: z.string(),
  }),
});

export const storyIdConflictResponseSchema = z.object({
  error: z.object({
    code: z.literal('story_id_conflict'),
    storyId: z.string(),
  }),
});

export const storyDeleteConflictResponseSchema = z.object({
  error: z.object({
    code: z.literal('story_delete_conflict'),
    reason: z.literal('published_snapshots_exist'),
    storyId: z.string(),
  }),
});

const publishValidationIssueDetailsSchema = z.record(
  z.string(),
  z.union([z.boolean(), z.null(), z.number(), z.string()]),
);

export const publishValidationIssueSchema = z.object({
  code: z.string(),
  details: publishValidationIssueDetailsSchema.optional(),
  layer: z.enum(['schema', 'structure', 'compatibility']),
  message: z.string(),
  path: z.array(z.union([z.string(), z.number()])),
});

export const publishValidationFailedResponseSchema = z.object({
  error: z.object({
    code: z.literal('publish_validation_failed'),
    issues: z.array(publishValidationIssueSchema),
    storyId: z.string(),
  }),
});

export const publishStoryResponseSchema = z.object({
  engineMajor: z.number().int().nonnegative(),
  publishedAt: z.date(),
  publishedBundleUri: z.url(),
  snapshotId: z.string(),
  status: z.literal('published'),
  storyId: z.string(),
});

export const deleteStoryResponseSchema = z.object({
  deleted: z.literal(true),
});

export type CreateStoryRequest = z.infer<typeof createStoryRequestSchema>;
export type PutStoryRequest = z.infer<typeof putStoryRequestSchema>;
export type PatchStoryRequest = z.infer<typeof patchStoryRequestSchema>;
export type StoryView = z.infer<typeof storyViewSchema>;
export type StoryViewQuery = z.infer<typeof storyViewQuerySchema>;
export type PublishValidationIssue = z.infer<typeof publishValidationIssueSchema>;
export type ValidationIssue = z.infer<typeof validationIssueSchema>;
