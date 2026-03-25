import { z } from 'zod';

const storyIdSchema = z.string().trim().min(1);

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

export const deleteStoryResponseSchema = z.object({
  deleted: z.literal(true),
});

export type CreateStoryRequest = z.infer<typeof createStoryRequestSchema>;
export type PutStoryRequest = z.infer<typeof putStoryRequestSchema>;
export type PatchStoryRequest = z.infer<typeof patchStoryRequestSchema>;
export type ValidationIssue = z.infer<typeof validationIssueSchema>;
