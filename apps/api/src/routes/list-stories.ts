import { listStories } from "@plotpoint/db";
import { Hono } from "hono";
import { z } from "zod";
import { toStoryResponse } from "./story-response.js";

const storyResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  status: z.enum(["draft", "published", "archived"]),
  draftBundleUri: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

const listStoriesResponseSchema = z.array(storyResponseSchema);

export const listStoriesRoute = new Hono();

listStoriesRoute.get("/stories", async (context) => {
  const stories = await listStories();
  const response = stories.map(toStoryResponse);

  return context.json(listStoriesResponseSchema.parse(response), 200);
});
