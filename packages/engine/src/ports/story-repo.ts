import type { StoryBundle } from '../story-bundles/schema.js';

export type StoryRepo = {
  getBundle: (storyId: string) => Promise<StoryBundle>;
};
