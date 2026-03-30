import { storyBundleSchema, type StoryBundle, type StoryRepo } from '@plotpoint/engine';
import type { StoryQueries } from '../queries/stories.js';

export type StoryBundleReader = (bundleUri: string) => Promise<unknown>;

export type CreateStoryRepoDeps = {
  readBundle: StoryBundleReader;
  storyQueries: Pick<StoryQueries, 'getCurrentPublishedStoryBundleRef'>;
};

export const createStoryRepo = (deps: CreateStoryRepoDeps): StoryRepo => ({
  getBundle: async (storyId: string): Promise<StoryBundle> => {
    const publishedBundle = await deps.storyQueries.getCurrentPublishedStoryBundleRef(storyId);
    if (!publishedBundle) {
      throw new Error(`Published bundle not found for story "${storyId}".`);
    }

    const rawBundle = await deps.readBundle(publishedBundle.publishedBundleUri);
    const parsed = storyBundleSchema.safeParse(rawBundle);
    if (!parsed.success) {
      throw new Error(
        `Published bundle at "${publishedBundle.publishedBundleUri}" is invalid for story "${storyId}".`,
      );
    }

    return parsed.data;
  },
});
