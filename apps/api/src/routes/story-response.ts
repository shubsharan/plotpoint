export type StoryRow = {
  id: string;
  title: string;
  summary: string | null;
  status: "draft" | "published" | "archived";
  draftBundleUri: string;
  createdAt: Date;
  updatedAt: Date;
};

export type StoryResponse = {
  id: string;
  title: string;
  summary: string | null;
  status: "draft" | "published" | "archived";
  draftBundleUri: string;
  createdAt: string;
  updatedAt: string;
};

export const toStoryResponse = (story: StoryRow): StoryResponse => ({
  id: story.id,
  title: story.title,
  summary: story.summary,
  status: story.status,
  draftBundleUri: story.draftBundleUri,
  createdAt: story.createdAt.toISOString(),
  updatedAt: story.updatedAt.toISOString(),
});
