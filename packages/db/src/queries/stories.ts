import { desc, eq } from 'drizzle-orm';
import type { PgAsyncDatabase } from 'drizzle-orm/pg-core/async/db';
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

export type CreateStoryInput = {
  id: string;
  title: string;
  summary?: string | null;
  draftBundleUri: string;
  now?: Date;
};

export type UpdateStoryInput = {
  id: string;
  title: string;
  summary?: string | null;
  draftBundleUri: string;
  now?: Date;
};

export type PatchStoryInput = {
  id: string;
  title?: string;
  summary?: string | null;
  draftBundleUri?: string;
  now?: Date;
};

type StoryCrudDatabase = PgAsyncDatabase<any, any, any>;

export type StoryQueries = {
  createStory: (input: CreateStoryInput) => Promise<StoryCrudReadModel>;
  deleteStory: (storyId: string) => Promise<boolean>;
  getStory: (storyId: string) => Promise<StoryCrudReadModel | null>;
  listStories: () => Promise<StoryCrudReadModel[]>;
  patchStory: (input: PatchStoryInput) => Promise<StoryCrudReadModel | null>;
  updateStory: (input: UpdateStoryInput) => Promise<StoryCrudReadModel | null>;
};

export const createStoryQueries = (database: StoryCrudDatabase): StoryQueries => {
  const listStories = async () =>
    database
      .select(storyCrudReadModelProjection)
      .from(stories)
      .orderBy(desc(stories.updatedAt), desc(stories.id));

  const getStory = async (storyId: string) => {
    const [story] = await database
      .select(storyCrudReadModelProjection)
      .from(stories)
      .where(eq(stories.id, storyId))
      .limit(1);

    return story ?? null;
  };

  const createStory = async (input: CreateStoryInput) => {
    const timestamp = input.now ?? new Date();
    const [story] = await database
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

  const updateStory = async (input: UpdateStoryInput) => {
    const timestamp = input.now ?? new Date();
    const [story] = await database
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

  const patchStory = async (input: PatchStoryInput) => {
    const timestamp = input.now ?? new Date();
    const hasNoPatchFields =
      input.title === undefined && input.summary === undefined && input.draftBundleUri === undefined;
    if (hasNoPatchFields) {
      throw new Error('At least one story field must be provided for patch.');
    }

    const [story] = await database
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

  const deleteStory = async (storyId: string) => {
    const result = await database
      .delete(stories)
      .where(eq(stories.id, storyId))
      .returning({ id: stories.id });

    return result.length > 0;
  };

  return {
    createStory,
    deleteStory,
    getStory,
    listStories,
    patchStory,
    updateStory,
  };
};
