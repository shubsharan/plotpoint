import {
  storyPackageSchema,
  type PublishedStoryPackage,
  type StoryPackage,
  type StoryPackageRepo,
} from '@plotpoint/engine';
import type { PublishedStoryPackageVersionRef } from '../queries/stories.js';

export type StoryPackageReader = (packageUri: string) => Promise<unknown>;

export type CurrentPublishedStoryPackageVersionRefReader = (
  storyId: string,
) => Promise<PublishedStoryPackageVersionRef | null>;

export type PublishedStoryPackageVersionRefReader = (
  storyId: string,
  publishedStoryPackageVersionId: string,
) => Promise<PublishedStoryPackageVersionRef | null>;

export type CreateStoryPackageRepoDeps = {
  readPackage: StoryPackageReader;
  storyQueries: {
    getCurrentPublishedStoryPackageVersion: CurrentPublishedStoryPackageVersionRefReader;
    getPublishedStoryPackageVersion: PublishedStoryPackageVersionRefReader;
  };
};

const parseStoryPackageOrThrow = (
  rawPackage: unknown,
  storyId: string,
  packageUri: string,
): StoryPackage => {
  const parsed = storyPackageSchema.safeParse(rawPackage);
  if (!parsed.success) {
    throw new Error(
      `Published story package at "${packageUri}" is invalid for story "${storyId}".`,
    );
  }

  return parsed.data;
};

export const createStoryPackageRepo = (deps: CreateStoryPackageRepoDeps): StoryPackageRepo => ({
  getCurrentPublishedPackage: async (storyId: string): Promise<PublishedStoryPackage> => {
    const publishedPackageVersion = await deps.storyQueries.getCurrentPublishedStoryPackageVersion(
      storyId,
    );
    if (!publishedPackageVersion) {
      throw new Error(`Published story package not found for story "${storyId}".`);
    }

    const rawPackage = await deps.readPackage(publishedPackageVersion.publishedPackageUri);
    const storyPackage = parseStoryPackageOrThrow(
      rawPackage,
      storyId,
      publishedPackageVersion.publishedPackageUri,
    );
    return {
      storyPackage,
      storyPackageVersionId: publishedPackageVersion.publishedStoryPackageVersionId,
    };
  },
  getPublishedPackage: async (
    storyId: string,
    storyPackageVersionId: string,
  ): Promise<StoryPackage> => {
    const publishedPackageVersion = await deps.storyQueries.getPublishedStoryPackageVersion(
      storyId,
      storyPackageVersionId,
    );
    if (!publishedPackageVersion) {
      throw new Error(
        `Published story package version "${storyPackageVersionId}" not found for story "${storyId}".`,
      );
    }

    const rawPackage = await deps.readPackage(publishedPackageVersion.publishedPackageUri);
    return parseStoryPackageOrThrow(
      rawPackage,
      storyId,
      publishedPackageVersion.publishedPackageUri,
    );
  },
});
