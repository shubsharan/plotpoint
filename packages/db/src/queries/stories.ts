import { desc, eq } from 'drizzle-orm';
import { db } from '../client.js';
import { type StoryRow, stories } from '../schema/stories.js';

const storyCrudReadModelProjection = {
  createdAt: stories.createdAt,
  draftBundleUri: stories.draftBundleUri,
  id: stories.id,
  status: stories.status,
  summary: stories.summary,
  title: stories.title,
  updatedAt: stories.updatedAt,
};

export type StoryCrudReadModel = Pick<
  StoryRow,
  'id' | 'title' | 'summary' | 'status' | 'draftBundleUri' | 'createdAt' | 'updatedAt'
>;

type CreateStoryInput = {
  id: string;
  title: string;
  summary?: string | null;
  draftBundleUri: string;
  now?: Date;
};

type UpdateStoryInput = {
  id: string;
  title: string;
  summary?: string | null;
  draftBundleUri: string;
  now?: Date;
};

type PatchStoryInput = {
  id: string;
  title?: string;
  summary?: string | null;
  draftBundleUri?: string;
  now?: Date;
};

export const listStories = async () =>
  db
    .select(storyCrudReadModelProjection)
    .from(stories)
    .orderBy(desc(stories.updatedAt), desc(stories.id));

export const getStory = async (storyId: string) => {
  const [story] = await db
    .select(storyCrudReadModelProjection)
    .from(stories)
    .where(eq(stories.id, storyId))
    .limit(1);

  return story ?? null;
};

export const createStory = async (input: CreateStoryInput) => {
  const timestamp = input.now ?? new Date();
  const [story] = await db
    .insert(stories)
    .values({
      id: input.id,
      title: input.title,
      summary: input.summary ?? null,
      status: 'draft',
      draftBundleUri: input.draftBundleUri,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning(storyCrudReadModelProjection);

  if (!story) {
    throw new Error(`Failed to create story "${input.id}".`);
  }

  return story;
};

export const updateStory = async (input: UpdateStoryInput) => {
  const timestamp = input.now ?? new Date();
  const [story] = await db
    .update(stories)
    .set({
      draftBundleUri: input.draftBundleUri,
      status: 'draft',
      summary: input.summary ?? null,
      title: input.title,
      updatedAt: timestamp,
    })
    .where(eq(stories.id, input.id))
    .returning(storyCrudReadModelProjection);

  return story ?? null;
};

export const patchStory = async (input: PatchStoryInput) => {
  const timestamp = input.now ?? new Date();
  const hasNoPatchFields =
    input.title === undefined && input.summary === undefined && input.draftBundleUri === undefined;
  if (hasNoPatchFields) {
    throw new Error('At least one story field must be provided for patch.');
  }

  const [story] = await db
    .update(stories)
    .set({
      ...(input.draftBundleUri !== undefined ? { draftBundleUri: input.draftBundleUri } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      status: 'draft',
      updatedAt: timestamp,
    })
    .where(eq(stories.id, input.id))
    .returning(storyCrudReadModelProjection);

  return story ?? null;
};

export const deleteStory = async (storyId: string) => {
  const result = await db
    .delete(stories)
    .where(eq(stories.id, storyId))
    .returning({ id: stories.id });

  return result.length > 0;
};
