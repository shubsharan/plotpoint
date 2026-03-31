import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type { PgAsyncDatabase } from 'drizzle-orm/pg-core/async/db';
import {
  type StoryRow,
  stories,
  publishedStoryPackageVersions,
} from '../schema/stories.js';

const storyCrudReadModelProjection = {
  createdAt: stories.createdAt,
  currentPublishedPackageVersionId: stories.currentPublishedPackageVersionId,
  draftPackageUri: stories.draftPackageUri,
  id: stories.id,
  lastPublishedAt: stories.lastPublishedAt,
  status: stories.status,
  summary: stories.summary,
  title: stories.title,
  updatedAt: stories.updatedAt,
};

const storyPublishedCatalogProjection = {
  engineMajor: publishedStoryPackageVersions.engineMajor,
  id: publishedStoryPackageVersions.storyId,
  publishedAt: publishedStoryPackageVersions.publishedAt,
  publishedPackageUri: publishedStoryPackageVersions.publishedPackageUri,
  summary: publishedStoryPackageVersions.summary,
  title: publishedStoryPackageVersions.title,
};

const currentPublishedPackageVersionProjection = {
  engineMajor: publishedStoryPackageVersions.engineMajor,
  publishedAt: publishedStoryPackageVersions.publishedAt,
  publishedPackageUri: publishedStoryPackageVersions.publishedPackageUri,
  publishedStoryPackageVersionId: publishedStoryPackageVersions.id,
  storyId: stories.id,
};

export type StoryCrudReadModel = Pick<
  StoryRow,
  | 'id'
  | 'title'
  | 'summary'
  | 'status'
  | 'draftPackageUri'
  | 'currentPublishedPackageVersionId'
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
  draftPackageUri: string;
  id: string;
  now?: Date;
  summary?: string | null;
  title: string;
};

export type UpdateStoryInput = {
  draftPackageUri: string;
  id: string;
  now?: Date;
  summary?: string | null;
  title: string;
};

export type PatchStoryInput = {
  draftPackageUri?: string;
  id: string;
  now?: Date;
  summary?: string | null;
  title?: string;
};

export type PublishStoryInput = {
  engineMajor: number;
  publishedAt?: Date;
  publishedPackageUri: string;
  publishedStoryPackageVersionId?: string;
  storyId: string;
  summary: string | null;
  title: string;
};

export type PublishedStoryPackageVersionRef = {
  engineMajor: number;
  publishedAt: Date;
  publishedPackageUri: string;
  publishedStoryPackageVersionId: string;
  storyId: string;
};

export type PublishStoryReadModel = PublishedStoryPackageVersionRef & {
  status: 'published';
};

export type CurrentPublishedStoryPackageVersionRef = PublishedStoryPackageVersionRef;

export type DeleteStoryResult = 'deleted' | 'has_published_package_versions' | 'not_found';

type StoryPublishedCatalogRow = {
  engineMajor: number;
  id: string;
  publishedAt: Date;
  publishedPackageUri: string;
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
  getCurrentPublishedStoryPackageVersion: (
    storyId: string,
  ) => Promise<CurrentPublishedStoryPackageVersionRef | null>;
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
        publishedStoryPackageVersions,
        eq(stories.currentPublishedPackageVersionId, publishedStoryPackageVersions.id),
      )
      .where(eq(stories.status, 'published'))
      .orderBy(desc(publishedStoryPackageVersions.publishedAt), desc(stories.id));

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
        publishedStoryPackageVersions,
        eq(stories.currentPublishedPackageVersionId, publishedStoryPackageVersions.id),
      )
      .where(and(eq(stories.id, storyId), eq(stories.status, 'published')))
      .limit(1);

    if (!story) {
      return null;
    }

    return mapPublishedCatalogRow(story);
  };

  const getCurrentPublishedStoryPackageVersion = async (
    storyId: string,
  ): Promise<CurrentPublishedStoryPackageVersionRef | null> => {
    const [packageVersion] = await database
      .select(currentPublishedPackageVersionProjection)
      .from(stories)
      .innerJoin(
        publishedStoryPackageVersions,
        eq(stories.currentPublishedPackageVersionId, publishedStoryPackageVersions.id),
      )
      .where(and(eq(stories.id, storyId), eq(stories.status, 'published')))
      .limit(1);

    return packageVersion ?? null;
  };

  const createStory = async (input: CreateStoryInput) => {
    const timestamp = input.now ?? new Date();
    const [story] = await database
      .insert(stories)
      .values({
        currentPublishedPackageVersionId: null,
        id: input.id,
        lastPublishedAt: null,
        title: input.title,
        summary: input.summary ?? null,
        status: 'draft',
        draftPackageUri: input.draftPackageUri,
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
        draftPackageUri: input.draftPackageUri,
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
      input.title === undefined && input.summary === undefined && input.draftPackageUri === undefined;
    if (hasNoPatchFields) {
      throw new Error('At least one story field must be provided for patch.');
    }

    const [story] = await database
      .update(stories)
      .set({
        ...(input.draftPackageUri !== undefined ? { draftPackageUri: input.draftPackageUri } : {}),
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
    const publishedStoryPackageVersionId = input.publishedStoryPackageVersionId ?? randomUUID();

    return database.transaction(async (transaction) => {
      const [existingStory] = await transaction
        .select({ id: stories.id })
        .from(stories)
        .where(eq(stories.id, input.storyId))
        .limit(1);

      if (!existingStory) {
        return null;
      }

      const [publishedPackageVersion] = await transaction
        .insert(publishedStoryPackageVersions)
        .values({
          engineMajor: input.engineMajor,
          id: publishedStoryPackageVersionId,
          publishedPackageUri: input.publishedPackageUri,
          createdAt: timestamp,
          publishedAt: timestamp,
          storyId: input.storyId,
          summary: input.summary,
          title: input.title,
        })
        .returning({
          engineMajor: publishedStoryPackageVersions.engineMajor,
          id: publishedStoryPackageVersions.id,
          publishedAt: publishedStoryPackageVersions.publishedAt,
          publishedPackageUri: publishedStoryPackageVersions.publishedPackageUri,
        });

      if (!publishedPackageVersion) {
        throw new Error(
          `Failed to create published story package version for story "${input.storyId}".`,
        );
      }

      const [story] = await transaction
        .update(stories)
        .set({
          currentPublishedPackageVersionId: publishedPackageVersion.id,
          lastPublishedAt: publishedPackageVersion.publishedAt,
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

      const packageVersionRef: PublishedStoryPackageVersionRef = {
        engineMajor: publishedPackageVersion.engineMajor,
        publishedAt: publishedPackageVersion.publishedAt,
        publishedPackageUri: publishedPackageVersion.publishedPackageUri,
        publishedStoryPackageVersionId: publishedPackageVersion.id,
        storyId: story.id,
      };

      return {
        ...packageVersionRef,
        status: 'published',
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
        return 'has_published_package_versions' as const;
      }

      throw error;
    }

    return result.length > 0 ? ('deleted' as const) : ('not_found' as const);
  };

  return {
    createStory,
    deleteStory,
    getCurrentPublishedStoryPackageVersion,
    getPublishedStory,
    getStory,
    listPublishedStories,
    listStories,
    patchStory,
    publishStory,
    updateStory,
  };
};
