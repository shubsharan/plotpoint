import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../index.js';
import type { StoriesRouteDeps } from '../routes/stories/route.js';

type FunctionStoryDeps = Omit<StoriesRouteDeps, 'currentEngineMajor'>;
type StoriesRouteDepsMocks = {
  currentEngineMajor: number;
} & {
  [Key in keyof FunctionStoryDeps]: ReturnType<typeof vi.fn<FunctionStoryDeps[Key]>>;
};

const createRouteDeps = (): StoriesRouteDepsMocks => ({
  currentEngineMajor: 0,
  createStory: vi.fn<StoriesRouteDeps['createStory']>(),
  deleteStory: vi.fn<StoriesRouteDeps['deleteStory']>(),
  getPublishedStory: vi.fn<StoriesRouteDeps['getPublishedStory']>(),
  getStory: vi.fn<StoriesRouteDeps['getStory']>(),
  listPublishedStories: vi.fn<StoriesRouteDeps['listPublishedStories']>(),
  listStories: vi.fn<StoriesRouteDeps['listStories']>(),
  patchStory: vi.fn<StoriesRouteDeps['patchStory']>(),
  publishStory: vi.fn<StoriesRouteDeps['publishStory']>(),
  deletePublishedStoryBundle: vi.fn<StoriesRouteDeps['deletePublishedStoryBundle']>(),
  readStoryBundle: vi.fn<StoriesRouteDeps['readStoryBundle']>(),
  updateStory: vi.fn<StoriesRouteDeps['updateStory']>(),
  writePublishedStoryBundle: vi.fn<StoriesRouteDeps['writePublishedStoryBundle']>(),
});

const buildStoryRow = (
  overrides?: Partial<{
    id: string;
    title: string;
    summary: string | null;
    status: 'draft' | 'published' | 'archived';
    draftBundleUri: string;
    createdAt: Date;
    updatedAt: Date;
  }>,
) => ({
  id: 'story-the-stolen-ledger',
  title: 'The Stolen Ledger',
  summary: 'Track the missing ledger.',
  status: 'draft' as const,
  draftBundleUri: 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v1.json',
  currentPublishedSnapshotId: null,
  lastPublishedAt: null,
  createdAt: new Date('2026-03-24T10:00:00.000Z'),
  updatedAt: new Date('2026-03-24T10:30:00.000Z'),
  ...overrides,
});

const buildPublishedStory = (
  overrides?: Partial<{
    id: string;
    publishedAt: Date;
    summary: string | null;
    title: string;
  }>,
) => ({
  id: 'story-the-stolen-ledger',
  publishedAt: new Date('2026-03-30T10:35:00.000Z'),
  status: 'published' as const,
  summary: 'Track the missing ledger.',
  title: 'The Stolen Ledger',
  ...overrides,
});

const buildValidStoryBundle = (storyId = 'story-the-stolen-ledger') => ({
  metadata: {
    storyId,
    title: 'The Stolen Ledger',
    summary: 'Track the missing ledger.',
  },
  roles: [],
  graph: {
    entryNodeId: 'foyer',
    nodes: [
      {
        id: 'foyer',
        title: 'Gallery Foyer',
        blocks: [
          {
            id: 'briefing',
            type: 'text',
            config: {
              document: {
                children: [
                  {
                    children: [
                      {
                        text: 'Briefing note',
                        type: 'text',
                      },
                    ],
                    type: 'paragraph',
                  },
                ],
                type: 'doc',
              },
            },
          },
        ],
        edges: [],
      },
    ],
  },
  version: {
    schemaVersion: 1,
    engineMajor: null,
  },
});

const createJsonRequest = (
  deps: StoriesRouteDeps,
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
) => {
  const app = createApp(deps);
  if (body === undefined) {
    return app.request(path, { method });
  }

  return app.request(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
};

describe('@plotpoint/api story routes', () => {
  let deps: StoriesRouteDepsMocks;

  beforeEach(() => {
    deps = createRouteDeps();
    vi.clearAllMocks();
  });

  it('creates a story and returns the persisted record', async () => {
    const story = buildStoryRow();
    deps.createStory.mockResolvedValueOnce(story);

    const response = await createJsonRequest(deps, '/stories', 'POST', {
      id: story.id,
      title: story.title,
      summary: story.summary,
      draftBundleUri: story.draftBundleUri,
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      id: story.id,
      title: story.title,
      summary: story.summary,
      status: 'draft',
      draftBundleUri: story.draftBundleUri,
      currentPublishedSnapshotId: null,
      lastPublishedAt: null,
      createdAt: '2026-03-24T10:00:00.000Z',
      updatedAt: '2026-03-24T10:30:00.000Z',
    });
    expect(deps.createStory).toHaveBeenCalledWith({
      id: story.id,
      title: story.title,
      summary: story.summary,
      draftBundleUri: story.draftBundleUri,
    });
  });

  it('returns 400 for malformed json bodies', async () => {
    const app = createApp(deps);
    const response = await app.request('/stories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"id":"broken"',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'validation_error',
      },
    });
  });

  it('returns 400 for invalid create payloads', async () => {
    const response = await createJsonRequest(deps, '/stories', 'POST', {
      id: 'story-invalid-uri',
      title: 'Invalid URI Story',
      draftBundleUri: 'not-a-uri',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'validation_error',
      },
    });
  });

  it('returns 409 when create collides with an existing story id', async () => {
    deps.createStory.mockRejectedValueOnce({ code: '23505' });

    const response = await createJsonRequest(deps, '/stories', 'POST', {
      id: 'story-the-stolen-ledger',
      title: 'The Stolen Ledger',
      draftBundleUri: 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v1.json',
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'story_id_conflict',
        storyId: 'story-the-stolen-ledger',
      },
    });
  });

  it('lists stories in api response format', async () => {
    deps.listStories.mockResolvedValueOnce([
      buildStoryRow({
        id: 'story-2',
        updatedAt: new Date('2026-03-24T12:00:00.000Z'),
      }),
      buildStoryRow({
        id: 'story-1',
        updatedAt: new Date('2026-03-24T11:00:00.000Z'),
      }),
    ]);

    const response = await createJsonRequest(deps, '/stories', 'GET');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        id: 'story-2',
        title: 'The Stolen Ledger',
        summary: 'Track the missing ledger.',
        status: 'draft',
        draftBundleUri: 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v1.json',
        currentPublishedSnapshotId: null,
        lastPublishedAt: null,
        createdAt: '2026-03-24T10:00:00.000Z',
        updatedAt: '2026-03-24T12:00:00.000Z',
      },
      {
        id: 'story-1',
        title: 'The Stolen Ledger',
        summary: 'Track the missing ledger.',
        status: 'draft',
        draftBundleUri: 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v1.json',
        currentPublishedSnapshotId: null,
        lastPublishedAt: null,
        createdAt: '2026-03-24T10:00:00.000Z',
        updatedAt: '2026-03-24T11:00:00.000Z',
      },
    ]);
  });

  it('returns 500 on unexpected dependency failures', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    deps.listStories.mockRejectedValueOnce(new Error('database unavailable'));

    try {
      const response = await createJsonRequest(deps, '/stories', 'GET');
      expect(response.status).toBe(500);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('gets one story and returns 404 when missing', async () => {
    deps.getStory.mockResolvedValueOnce(buildStoryRow({ id: 'story-a' }));
    let response = await createJsonRequest(deps, '/stories/story-a', 'GET');
    expect(response.status).toBe(200);

    deps.getStory.mockResolvedValueOnce(null);
    response = await createJsonRequest(deps, '/stories/story-missing', 'GET');
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'story_not_found',
        storyId: 'story-missing',
      },
    });
  });

  it('lists and gets published catalog view via query param', async () => {
    deps.listPublishedStories.mockResolvedValueOnce([
      buildPublishedStory({
        id: 'story-published',
      }),
    ]);
    deps.getPublishedStory.mockResolvedValueOnce(
      buildPublishedStory({
        id: 'story-published',
      }),
    );

    let response = await createJsonRequest(deps, '/stories?view=published', 'GET');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        id: 'story-published',
        publishedAt: '2026-03-30T10:35:00.000Z',
        status: 'published',
        summary: 'Track the missing ledger.',
        title: 'The Stolen Ledger',
      },
    ]);
    expect(deps.listPublishedStories).toHaveBeenCalledOnce();

    response = await createJsonRequest(deps, '/stories/story-published?view=published', 'GET');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: 'story-published',
      publishedAt: '2026-03-30T10:35:00.000Z',
      status: 'published',
      summary: 'Track the missing ledger.',
      title: 'The Stolen Ledger',
    });
    expect(deps.getPublishedStory).toHaveBeenCalledWith('story-published');
  });

  it('returns 400 for invalid story view query', async () => {
    const response = await createJsonRequest(deps, '/stories?view=invalid', 'GET');

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'validation_error',
      },
    });
  });

  it('validates path ids for read routes', async () => {
    const response = await createJsonRequest(deps, '/stories/%20', 'GET');

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'validation_error',
      },
    });
  });

  it('replaces a story via put and allows null summary', async () => {
    deps.updateStory.mockResolvedValueOnce(
      buildStoryRow({
        id: 'story-update',
        title: 'Updated Story',
        summary: null,
      }),
    );

    const response = await createJsonRequest(deps, '/stories/story-update', 'PUT', {
      title: 'Updated Story',
      summary: null,
      draftBundleUri: 's3://plotpoint-stories/drafts/story-update/v2.json',
    });

    expect(response.status).toBe(200);
    expect(deps.updateStory).toHaveBeenCalledWith({
      id: 'story-update',
      title: 'Updated Story',
      summary: null,
      draftBundleUri: 's3://plotpoint-stories/drafts/story-update/v2.json',
    });
  });

  it('returns 400 for invalid put payloads', async () => {
    const response = await createJsonRequest(deps, '/stories/story-update', 'PUT', {
      title: '',
      draftBundleUri: 'not-a-uri',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'validation_error',
      },
    });
  });

  it('patches draft bundle uri only', async () => {
    deps.patchStory.mockResolvedValueOnce(
      buildStoryRow({
        id: 'story-patch',
        draftBundleUri: 's3://plotpoint-stories/drafts/story-patch/v2.json',
      }),
    );

    const response = await createJsonRequest(deps, '/stories/story-patch', 'PATCH', {
      draftBundleUri: 's3://plotpoint-stories/drafts/story-patch/v2.json',
    });

    expect(response.status).toBe(200);
    expect(deps.patchStory).toHaveBeenCalledWith({
      id: 'story-patch',
      draftBundleUri: 's3://plotpoint-stories/drafts/story-patch/v2.json',
    });
  });

  it('returns 404 when patch target is missing', async () => {
    deps.patchStory.mockResolvedValueOnce(null);

    const response = await createJsonRequest(deps, '/stories/story-missing', 'PATCH', {
      title: 'Missing Story',
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'story_not_found',
        storyId: 'story-missing',
      },
    });
  });

  it('returns 400 for invalid patch payloads', async () => {
    let response = await createJsonRequest(deps, '/stories/story-update', 'PATCH', {
      title: '',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'validation_error',
      },
    });

    response = await createJsonRequest(deps, '/stories/story-update', 'PATCH', {});
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'validation_error',
      },
    });
  });

  it('publishes a story from draft bundle and returns snapshot metadata', async () => {
    deps.getStory.mockResolvedValueOnce(
      buildStoryRow({
        draftBundleUri: 's3://plotpoint-stories/drafts/story-publish/v1.json',
        id: 'story-publish',
      }),
    );
    deps.readStoryBundle.mockResolvedValueOnce(buildValidStoryBundle('story-publish'));
    deps.writePublishedStoryBundle.mockResolvedValueOnce(
      's3://plotpoint-stories/published/story-publish/v1.json',
    );
    deps.publishStory.mockResolvedValueOnce({
      engineMajor: 0,
      publishedAt: new Date('2026-03-30T10:35:00.000Z'),
      publishedBundleUri: 's3://plotpoint-stories/published/story-publish/v1.json',
      snapshotId: 'snapshot-1',
      status: 'published',
      storyId: 'story-publish',
    });

    const response = await createJsonRequest(deps, '/stories/story-publish/publish', 'POST');

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      engineMajor: 0,
      publishedAt: '2026-03-30T10:35:00.000Z',
      publishedBundleUri: 's3://plotpoint-stories/published/story-publish/v1.json',
      snapshotId: 'snapshot-1',
      status: 'published',
      storyId: 'story-publish',
    });
    expect(deps.readStoryBundle).toHaveBeenCalledWith(
      's3://plotpoint-stories/drafts/story-publish/v1.json',
    );
    expect(deps.writePublishedStoryBundle).toHaveBeenCalledWith({
      bundle: expect.objectContaining({
        version: {
          schemaVersion: 1,
          engineMajor: 0,
        },
      }),
      publishedAt: expect.any(Date),
      storyId: 'story-publish',
    });
    expect(deps.publishStory).toHaveBeenCalledWith({
      engineMajor: 0,
      publishedAt: expect.any(Date),
      publishedBundleUri: 's3://plotpoint-stories/published/story-publish/v1.json',
      storyId: 'story-publish',
      summary: 'Track the missing ledger.',
      title: 'The Stolen Ledger',
    });
    expect(deps.deletePublishedStoryBundle).not.toHaveBeenCalled();
  });

  it('returns 422 when publish validation fails', async () => {
    deps.getStory.mockResolvedValueOnce(buildStoryRow());
    deps.readStoryBundle.mockResolvedValueOnce({});

    const response = await createJsonRequest(
      deps,
      '/stories/story-the-stolen-ledger/publish',
      'POST',
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'publish_validation_failed',
        storyId: 'story-the-stolen-ledger',
      },
    });
    expect(deps.writePublishedStoryBundle).not.toHaveBeenCalled();
    expect(deps.publishStory).not.toHaveBeenCalled();
  });

  it('returns 422 when bundle metadata storyId does not match route story id', async () => {
    deps.getStory.mockResolvedValueOnce(
      buildStoryRow({
        draftBundleUri: 's3://plotpoint-stories/drafts/story-publish/v1.json',
        id: 'story-publish',
      }),
    );
    deps.readStoryBundle.mockResolvedValueOnce(buildValidStoryBundle('story-other'));

    const response = await createJsonRequest(deps, '/stories/story-publish/publish', 'POST');

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'publish_validation_failed',
        issues: [
          {
            code: 'story-id-mismatch',
            layer: 'structure',
            path: ['metadata', 'storyId'],
          },
        ],
        storyId: 'story-publish',
      },
    });
    expect(deps.writePublishedStoryBundle).not.toHaveBeenCalled();
    expect(deps.publishStory).not.toHaveBeenCalled();
  });

  it('rolls back uploaded bundle and returns 404 when publish persistence returns null', async () => {
    deps.getStory.mockResolvedValueOnce(
      buildStoryRow({
        draftBundleUri: 's3://plotpoint-stories/drafts/story-publish/v1.json',
        id: 'story-publish',
      }),
    );
    deps.readStoryBundle.mockResolvedValueOnce(buildValidStoryBundle('story-publish'));
    deps.writePublishedStoryBundle.mockResolvedValueOnce(
      's3://plotpoint-stories/published/story-publish/v1.json',
    );
    deps.publishStory.mockResolvedValueOnce(null);

    const response = await createJsonRequest(deps, '/stories/story-publish/publish', 'POST');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'story_not_found',
        storyId: 'story-publish',
      },
    });
    expect(deps.deletePublishedStoryBundle).toHaveBeenCalledWith(
      's3://plotpoint-stories/published/story-publish/v1.json',
    );
  });

  it('rolls back uploaded bundle and surfaces 500 when publish persistence throws', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    deps.getStory.mockResolvedValueOnce(
      buildStoryRow({
        draftBundleUri: 's3://plotpoint-stories/drafts/story-publish/v1.json',
        id: 'story-publish',
      }),
    );
    deps.readStoryBundle.mockResolvedValueOnce(buildValidStoryBundle('story-publish'));
    deps.writePublishedStoryBundle.mockResolvedValueOnce(
      's3://plotpoint-stories/published/story-publish/v1.json',
    );
    deps.publishStory.mockRejectedValueOnce(new Error('database write failed'));

    try {
      const response = await createJsonRequest(deps, '/stories/story-publish/publish', 'POST');
      expect(response.status).toBe(500);
    } finally {
      consoleErrorSpy.mockRestore();
    }

    expect(deps.deletePublishedStoryBundle).toHaveBeenCalledWith(
      's3://plotpoint-stories/published/story-publish/v1.json',
    );
  });

  it('surfaces rollback failures instead of returning 404', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    deps.getStory.mockResolvedValueOnce(
      buildStoryRow({
        draftBundleUri: 's3://plotpoint-stories/drafts/story-publish/v1.json',
        id: 'story-publish',
      }),
    );
    deps.readStoryBundle.mockResolvedValueOnce(buildValidStoryBundle('story-publish'));
    deps.writePublishedStoryBundle.mockResolvedValueOnce(
      's3://plotpoint-stories/published/story-publish/v1.json',
    );
    deps.publishStory.mockResolvedValueOnce(null);
    deps.deletePublishedStoryBundle.mockRejectedValueOnce(new Error('storage cleanup failed'));

    try {
      const response = await createJsonRequest(deps, '/stories/story-publish/publish', 'POST');
      expect(response.status).toBe(500);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('surfaces rollback failures when publish persistence throws', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    deps.getStory.mockResolvedValueOnce(
      buildStoryRow({
        draftBundleUri: 's3://plotpoint-stories/drafts/story-publish/v1.json',
        id: 'story-publish',
      }),
    );
    deps.readStoryBundle.mockResolvedValueOnce(buildValidStoryBundle('story-publish'));
    deps.writePublishedStoryBundle.mockResolvedValueOnce(
      's3://plotpoint-stories/published/story-publish/v1.json',
    );
    deps.publishStory.mockRejectedValueOnce(new Error('database write failed'));
    deps.deletePublishedStoryBundle.mockRejectedValueOnce(new Error('storage cleanup failed'));

    try {
      const response = await createJsonRequest(deps, '/stories/story-publish/publish', 'POST');
      expect(response.status).toBe(500);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('deletes a story and returns 404 when missing', async () => {
    deps.deleteStory.mockResolvedValueOnce('deleted');
    let response = await createJsonRequest(deps, '/stories/story-a', 'DELETE');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: true });
    expect(deps.deleteStory).toHaveBeenCalledWith('story-a');

    deps.deleteStory.mockResolvedValueOnce('not_found');
    response = await createJsonRequest(deps, '/stories/story-missing', 'DELETE');
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'story_not_found',
        storyId: 'story-missing',
      },
    });
  });

  it('returns 409 when deleting a story with published snapshots', async () => {
    deps.deleteStory.mockResolvedValueOnce('has_published_snapshots');

    const response = await createJsonRequest(deps, '/stories/story-live', 'DELETE');

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'story_delete_conflict',
        reason: 'published_snapshots_exist',
        storyId: 'story-live',
      },
    });
  });
});
