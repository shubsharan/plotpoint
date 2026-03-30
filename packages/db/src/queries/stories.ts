import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type { PgAsyncDatabase } from 'drizzle-orm/pg-core/async/db';
import {
  type StoryRow,
  stories,
  storyPublishedSnapshots,
} from '../schema/stories.js';

const storyCrudReadModelProjection = {
  createdAt: stories.createdAt,
  currentPublishedSnapshotId: stories.currentPublishedSnapshotId,
  draftBundleUri: stories.draftBundleUri,
  id: stories.id,
  lastPublishedAt: stories.lastPublishedAt,
  status: stories.status,
  summary: stories.summary,
  title: stories.title,
  updatedAt: stories.updatedAt,
};

const storyPublishedCatalogProjection = {
  engineMajor: storyPublishedSnapshots.engineMajor,
  id: storyPublishedSnapshots.storyId,
  publishedAt: storyPublishedSnapshots.publishedAt,
  publishedBundleUri: storyPublishedSnapshots.publishedBundleUri,
  summary: storyPublishedSnapshots.summary,
  title: storyPublishedSnapshots.title,
};

const currentPublishedBundleProjection = {
  engineMajor: storyPublishedSnapshots.engineMajor,
  publishedAt: storyPublishedSnapshots.publishedAt,
  publishedBundleUri: storyPublishedSnapshots.publishedBundleUri,
  snapshotId: storyPublishedSnapshots.id,
  storyId: stories.id,
};

export type StoryCrudReadModel = Pick<
  StoryRow,
  | 'id'
  | 'title'
  | 'summary'
  | 'status'
  | 'draftBundleUri'
  | 'currentPublishedSnapshotId'
  | 'lastPublishedAt'
  | 'createdAt'
  | 'updatedAt'
>;

export type StoryPublishedCatalogReadModel = {
  id: string;
  publishedAt: Date;
  status: 'published';
  summary: string | null;
  title: string;
};

export type CreateStoryInput = {
  draftBundleUri: string;
  id: string;
  now?: Date;
  summary?: string | null;
  title: string;
};

export type UpdateStoryInput = {
  draftBundleUri: string;
  id: string;
  now?: Date;
  summary?: string | null;
  title: string;
};

export type PatchStoryInput = {
  draftBundleUri?: string;
  id: string;
  now?: Date;
  summary?: string | null;
  title?: string;
};

export type PublishStoryInput = {
  engineMajor: number;
  publishedAt?: Date;
  publishedBundleUri: string;
  snapshotId?: string;
  storyId: string;
  summary: string | null;
  title: string;
};

export type PublishStoryReadModel = {
  engineMajor: number;
  publishedAt: Date;
  publishedBundleUri: string;
  snapshotId: string;
  status: 'published';
  storyId: string;
};

export type CurrentPublishedStoryBundleRef = {
  engineMajor: number;
  publishedAt: Date;
  publishedBundleUri: string;
  snapshotId: string;
  storyId: string;
};

export type DeleteStoryResult = 'deleted' | 'has_published_snapshots' | 'not_found';

type StoryPublishedCatalogRow = {
  engineMajor: number;
  id: string;
  publishedAt: Date;
  publishedBundleUri: string;
  summary: string | null;
  title: string;
};

type StoryCrudDatabase = PgAsyncDatabase<any, any, any>;

const isForeignKeyViolation = (error: unknown): boolean => {
  const getCodeAndConstraint = (value: unknown): { code: string; constraint?: string } | null => {
    if (typeof value !== 'object' || value === null) {
      return null;
    }

    const candidate = value as { code?: unknown; constraint?: unknown };
    if (typeof candidate.code !== 'string') {
      return null;
    }

    return {
      code: candidate.code,
      ...(typeof candidate.constraint === 'string' ? { constraint: candidate.constraint } : {}),
    };
  };

  const details =
    getCodeAndConstraint(error) ??
    getCodeAndConstraint((error as { cause?: unknown }).cause);
  return details?.code === '23503';
};

export type StoryQueries = {
  createStory: (input: CreateStoryInput) => Promise<StoryCrudReadModel>;
  deleteStory: (storyId: string) => Promise<DeleteStoryResult>;
  getCurrentPublishedStoryBundleRef: (storyId: string) => Promise<CurrentPublishedStoryBundleRef | null>;
  getPublishedStory: (storyId: string) => Promise<StoryPublishedCatalogReadModel | null>;
  getStory: (storyId: string) => Promise<StoryCrudReadModel | null>;
  listPublishedStories: () => Promise<StoryPublishedCatalogReadModel[]>;
  listStories: () => Promise<StoryCrudReadModel[]>;
  patchStory: (input: PatchStoryInput) => Promise<StoryCrudReadModel | null>;
  publishStory: (input: PublishStoryInput) => Promise<PublishStoryReadModel | null>;
  updateStory: (input: UpdateStoryInput) => Promise<StoryCrudReadModel | null>;
};

export const createStoryQueries = (database: StoryCrudDatabase): StoryQueries => {
  const mapPublishedCatalogRow = (
    row: StoryPublishedCatalogRow,
  ): StoryPublishedCatalogReadModel => ({
    id: row.id,
    publishedAt: row.publishedAt,
    status: 'published',
    summary: row.summary,
    title: row.title,
  });

  const listStories = async () =>
    database
      .select(storyCrudReadModelProjection)
      .from(stories)
      .orderBy(desc(stories.updatedAt), desc(stories.id));

  const listPublishedStories = async () => {
    const rows = await database
      .select(storyPublishedCatalogProjection)
      .from(stories)
      .innerJoin(
        storyPublishedSnapshots,
        eq(stories.currentPublishedSnapshotId, storyPublishedSnapshots.id),
      )
      .where(eq(stories.status, 'published'))
      .orderBy(desc(storyPublishedSnapshots.publishedAt), desc(stories.id));

    return rows.map(mapPublishedCatalogRow);
  };

  const getStory = async (storyId: string) => {
    const [story] = await database
      .select(storyCrudReadModelProjection)
      .from(stories)
      .where(eq(stories.id, storyId))
      .limit(1);

    return story ?? null;
  };

  const getPublishedStory = async (storyId: string) => {
    const [story] = await database
      .select(storyPublishedCatalogProjection)
      .from(stories)
      .innerJoin(
        storyPublishedSnapshots,
        eq(stories.currentPublishedSnapshotId, storyPublishedSnapshots.id),
      )
      .where(and(eq(stories.id, storyId), eq(stories.status, 'published')))
      .limit(1);

    if (!story) {
      return null;
    }

    return mapPublishedCatalogRow(story);
  };

  const getCurrentPublishedStoryBundleRef = async (
    storyId: string,
  ): Promise<CurrentPublishedStoryBundleRef | null> => {
    const [bundleRef] = await database
      .select(currentPublishedBundleProjection)
      .from(stories)
      .innerJoin(
        storyPublishedSnapshots,
        eq(stories.currentPublishedSnapshotId, storyPublishedSnapshots.id),
      )
      .where(and(eq(stories.id, storyId), eq(stories.status, 'published')))
      .limit(1);

    return bundleRef ?? null;
  };

  const createStory = async (input: CreateStoryInput) => {
    const timestamp = input.now ?? new Date();
    const [story] = await database
      .insert(stories)
      .values({
        currentPublishedSnapshotId: null,
        id: input.id,
        lastPublishedAt: null,
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
        updatedAt: timestamp,
      })
      .where(eq(stories.id, input.id))
      .returning(storyCrudReadModelProjection);

    return story ?? null;
  };

  const publishStory = async (
    input: PublishStoryInput,
  ): Promise<PublishStoryReadModel | null> => {
    const timestamp = input.publishedAt ?? new Date();
    const snapshotId = input.snapshotId ?? randomUUID();

    return database.transaction(async (transaction) => {
      const [existingStory] = await transaction
        .select({ id: stories.id })
        .from(stories)
        .where(eq(stories.id, input.storyId))
        .limit(1);

      if (!existingStory) {
        return null;
      }

      const [publishedSnapshot] = await transaction
        .insert(storyPublishedSnapshots)
        .values({
          engineMajor: input.engineMajor,
          id: snapshotId,
          publishedBundleUri: input.publishedBundleUri,
          createdAt: timestamp,
          publishedAt: timestamp,
          storyId: input.storyId,
          summary: input.summary,
          title: input.title,
        })
        .returning({
          engineMajor: storyPublishedSnapshots.engineMajor,
          id: storyPublishedSnapshots.id,
          publishedAt: storyPublishedSnapshots.publishedAt,
          publishedBundleUri: storyPublishedSnapshots.publishedBundleUri,
        });

      if (!publishedSnapshot) {
        throw new Error(`Failed to create published snapshot for story "${input.storyId}".`);
      }

      const [story] = await transaction
        .update(stories)
        .set({
          currentPublishedSnapshotId: publishedSnapshot.id,
          lastPublishedAt: publishedSnapshot.publishedAt,
          status: 'published',
          updatedAt: timestamp,
        })
        .where(eq(stories.id, input.storyId))
        .returning({
          id: stories.id,
          status: stories.status,
        });

      if (!story) {
        throw new Error(`Failed to mark story "${input.storyId}" as published.`);
      }

      return {
        engineMajor: publishedSnapshot.engineMajor,
        publishedAt: publishedSnapshot.publishedAt,
        publishedBundleUri: publishedSnapshot.publishedBundleUri,
        snapshotId: publishedSnapshot.id,
        status: 'published',
        storyId: story.id,
      };
    });
  };

  const deleteStory = async (storyId: string) => {
    let result: Array<{ id: string }>;
    try {
      result = await database
        .delete(stories)
        .where(eq(stories.id, storyId))
        .returning({ id: stories.id });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        return 'has_published_snapshots' as const;
      }

      throw error;
    }

    return result.length > 0 ? ('deleted' as const) : ('not_found' as const);
  };

  return {
    createStory,
    deleteStory,
    getCurrentPublishedStoryBundleRef,
    getPublishedStory,
    getStory,
    listPublishedStories,
    listStories,
    patchStory,
    publishStory,
    updateStory,
  };
};
