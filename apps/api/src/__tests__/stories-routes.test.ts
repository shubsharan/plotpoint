import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../index.js';
import type { StoriesRouteDeps } from '../routes/stories/route.js';

type StoriesRouteDepsMocks = {
  [Key in keyof StoriesRouteDeps]: ReturnType<typeof vi.fn<StoriesRouteDeps[Key]>>;
};

const createRouteDeps = (): StoriesRouteDepsMocks => ({
  createStory: vi.fn<StoriesRouteDeps['createStory']>(),
  deleteStory: vi.fn<StoriesRouteDeps['deleteStory']>(),
  getStory: vi.fn<StoriesRouteDeps['getStory']>(),
  listStories: vi.fn<StoriesRouteDeps['listStories']>(),
  patchStory: vi.fn<StoriesRouteDeps['patchStory']>(),
  updateStory: vi.fn<StoriesRouteDeps['updateStory']>(),
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
  createdAt: new Date('2026-03-24T10:00:00.000Z'),
  updatedAt: new Date('2026-03-24T10:30:00.000Z'),
  ...overrides,
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
        createdAt: '2026-03-24T10:00:00.000Z',
        updatedAt: '2026-03-24T12:00:00.000Z',
      },
      {
        id: 'story-1',
        title: 'The Stolen Ledger',
        summary: 'Track the missing ledger.',
        status: 'draft',
        draftBundleUri: 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v1.json',
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

  it('deletes a story and returns 404 when missing', async () => {
    deps.deleteStory.mockResolvedValueOnce(true);
    let response = await createJsonRequest(deps, '/stories/story-a', 'DELETE');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: true });
    expect(deps.deleteStory).toHaveBeenCalledWith('story-a');

    deps.deleteStory.mockResolvedValueOnce(false);
    response = await createJsonRequest(deps, '/stories/story-missing', 'DELETE');
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'story_not_found',
        storyId: 'story-missing',
      },
    });
  });
});
