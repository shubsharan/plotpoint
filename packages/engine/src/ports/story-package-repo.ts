import type { StoryPackage } from '../story-packages/schema.js';

export type StoryPackageRepo = {
  getPublishedPackage: (storyId: string) => Promise<StoryPackage>;
};
