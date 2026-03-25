import { storySelectSchema } from '@plotpoint/db';
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

export const createStoryRequestSchema = storyWriteFieldsSchema.extend({
  id: storyIdSchema,
});

export const putStoryRequestSchema = storyWriteFieldsSchema.extend({
  summary: z.string().nullable().optional(),
});

export const patchStoryRequestSchema = patchStoryWriteFieldsSchema;

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

const storyResponseFieldsSchema = storySelectSchema.pick({
  draftBundleUri: true,
  id: true,
  status: true,
  summary: true,
  title: true,
});

export const storyResponseSchema = storyResponseFieldsSchema.extend({
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const listStoriesResponseSchema = z.array(storyResponseSchema);

export type CreateStoryRequest = z.infer<typeof createStoryRequestSchema>;
export type PutStoryRequest = z.infer<typeof putStoryRequestSchema>;
export type PatchStoryRequest = z.infer<typeof patchStoryRequestSchema>;
export type ValidationIssue = z.infer<typeof validationIssueSchema>;
export type StoryResponse = z.infer<typeof storyResponseSchema>;
