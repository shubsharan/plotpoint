import { getStory } from "@plotpoint/db";
import { Hono } from "hono";
import { z } from "zod";
import { toStoryResponse } from "./story-response.js";

const pathParamsSchema = z.object({
  id: z.string().trim().min(1),
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

export const getStoryRoute = new Hono();

getStoryRoute.get("/stories/:id", async (context) => {
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

  const storyId = pathParamsResult.data.id;
  const story = await getStory(storyId);

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
