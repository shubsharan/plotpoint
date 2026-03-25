import { createStory } from "@plotpoint/db";
import { Hono } from "hono";
import { z } from "zod";
import { toStoryResponse } from "./story-response.js";

const createStoryRequestSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summary: z.string().optional(),
  draftBundleUri: z.url(),
});

const validationIssueSchema = z.object({
  code: z.string(),
  message: z.string(),
  path: z.array(z.union([z.string(), z.number()])),
});

const validationErrorResponseSchema = z.object({
  error: z.object({
    code: z.literal("validation_error"),
    issues: z.array(validationIssueSchema),
  }),
});

const storyIdConflictResponseSchema = z.object({
  error: z.object({
    code: z.literal("story_id_conflict"),
    storyId: z.string(),
  }),
});

const storyResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  status: z.enum(["draft", "published", "archived"]),
  draftBundleUri: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

const mapIssues = (issues: z.ZodIssue[]) =>
  issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path.map((segment) =>
      typeof segment === "number" ? segment : String(segment),
    ),
  }));

const isUniqueViolationError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  return "code" in error && error.code === "23505";
};

export const createStoryRoute = new Hono();

createStoryRoute.post("/stories", async (context) => {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    return context.json(
      validationErrorResponseSchema.parse({
        error: {
          code: "validation_error",
          issues: [
            {
              code: "invalid_json",
              message: "Request body must be valid JSON.",
              path: [],
            },
          ],
        },
      }),
      400,
    );
  }

  const parsedBody = createStoryRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return context.json(
      validationErrorResponseSchema.parse({
        error: {
          code: "validation_error",
          issues: mapIssues(parsedBody.error.issues),
        },
      }),
      400,
    );
  }

  try {
    const story = await createStory({
      storyId: parsedBody.data.id,
      title: parsedBody.data.title,
      summary: parsedBody.data.summary ?? null,
      draftBundleUri: parsedBody.data.draftBundleUri,
    });

    return context.json(storyResponseSchema.parse(toStoryResponse(story)), 201);
  } catch (error) {
    if (isUniqueViolationError(error)) {
      return context.json(
        storyIdConflictResponseSchema.parse({
          error: {
            code: "story_id_conflict",
            storyId: parsedBody.data.id,
          },
        }),
        409,
      );
    }

    throw error;
  }
});
