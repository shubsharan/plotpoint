import { updateStory } from "@plotpoint/db";
import { Hono } from "hono";
import { z } from "zod";
import { toStoryResponse } from "./story-response.js";

const pathParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const updateStoryRequestSchema = z.object({
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

const storyNotFoundResponseSchema = z.object({
  error: z.object({
    code: z.literal("story_not_found"),
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

export const updateStoryRoute = new Hono();

updateStoryRoute.patch("/stories/:id", async (context) => {
  const pathParamsResult = pathParamsSchema.safeParse(context.req.param());

  if (!pathParamsResult.success) {
    return context.json(
      validationErrorResponseSchema.parse({
        error: {
          code: "validation_error",
          issues: mapIssues(pathParamsResult.error.issues),
        },
      }),
      400,
    );
  }

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

  const parsedBody = updateStoryRequestSchema.safeParse(body);
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

  const storyId = pathParamsResult.data.id;
  const story = await updateStory({
    storyId,
    title: parsedBody.data.title,
    summary: parsedBody.data.summary ?? null,
    draftBundleUri: parsedBody.data.draftBundleUri,
  });

  if (!story) {
    return context.json(
      storyNotFoundResponseSchema.parse({
        error: {
          code: "story_not_found",
          storyId,
        },
      }),
      404,
    );
  }

  return context.json(storyResponseSchema.parse(toStoryResponse(story)), 200);
});
