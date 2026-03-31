import { storyPackageSchema, type StoryPackage, type StoryPackageRepo } from '@plotpoint/engine';
import type { PublishedStoryPackageVersionRef } from '../queries/stories.js';

export type StoryPackageReader = (packageUri: string) => Promise<unknown>;

export type CurrentPublishedStoryPackageVersionRefReader = (
  storyId: string,
) => Promise<PublishedStoryPackageVersionRef | null>;

export type CreateStoryPackageRepoDeps = {
  readPackage: StoryPackageReader;
  storyQueries: {
    getCurrentPublishedStoryPackageVersion: CurrentPublishedStoryPackageVersionRefReader;
  };
};

export const createStoryPackageRepo = (deps: CreateStoryPackageRepoDeps): StoryPackageRepo => ({
  getPublishedPackage: async (storyId: string): Promise<StoryPackage> => {
    const publishedPackageVersion = await deps.storyQueries.getCurrentPublishedStoryPackageVersion(
      storyId,
    );
    if (!publishedPackageVersion) {
      throw new Error(`Published story package not found for story "${storyId}".`);
    }

    const rawPackage = await deps.readPackage(publishedPackageVersion.publishedPackageUri);
    const parsed = storyPackageSchema.safeParse(rawPackage);
    if (!parsed.success) {
      throw new Error(
        `Published story package at "${publishedPackageVersion.publishedPackageUri}" is invalid for story "${storyId}".`,
      );
    }

    return parsed.data;
  },
});
