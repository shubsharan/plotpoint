import { desc, eq } from "drizzle-orm";
import { db } from "../client.js";
import { stories } from "../schema/stories.js";

type CreateStoryInput = {
  storyId: string;
  title: string;
  summary?: string | null;
  draftBundleUri: string;
  now?: Date;
};

type UpdateStoryInput = {
  storyId: string;
  title: string;
  summary?: string | null;
  draftBundleUri: string;
  now?: Date;
};

export const listStories = async () =>
  db.select().from(stories).orderBy(desc(stories.updatedAt), desc(stories.id));

export const getStory = async (storyId: string) => {
  const [story] = await db
    .select()
    .from(stories)
    .where(eq(stories.id, storyId))
    .limit(1);

  return story ?? null;
};

export const createStory = async (
  input: CreateStoryInput,
) => {
  const timestamp = input.now ?? new Date();
  const [story] = await db
    .insert(stories)
    .values({
      id: input.storyId,
      title: input.title,
      summary: input.summary ?? null,
      status: "draft",
      draftBundleUri: input.draftBundleUri,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning();

  if (!story) {
    throw new Error(`Failed to create story "${input.storyId}".`);
  }

  return story;
};

export const updateStory = async (
  input: UpdateStoryInput,
) => {
  const timestamp = input.now ?? new Date();
  const [story] = await db
    .update(stories)
    .set({
      draftBundleUri: input.draftBundleUri,
      status: "draft",
      summary: input.summary ?? null,
      title: input.title,
      updatedAt: timestamp,
    })
    .where(eq(stories.id, input.storyId))
    .returning();

  return story ?? null;
};

export const deleteStory = async (storyId: string) => {
  const result = await db
    .delete(stories)
    .where(eq(stories.id, storyId))
    .returning({ id: stories.id });

  return result.length > 0;
};
