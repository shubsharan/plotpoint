import type { StoryPackage } from '../story-packages/schema.js';

export type PublishedStoryPackage = {
  storyPackage: StoryPackage;
  storyPackageVersionId: string;
};

export type StoryPackageRepo = {
  getCurrentPublishedPackage: (storyId: string) => Promise<PublishedStoryPackage>;
  getPublishedPackage: (storyId: string, storyPackageVersionId: string) => Promise<StoryPackage>;
};
