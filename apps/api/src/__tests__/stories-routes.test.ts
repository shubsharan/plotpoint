import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createApp } from '../index.js';

const dbMocks = vi.hoisted(() => ({
  listStories: vi.fn(),
  getStory: vi.fn(),
  createStory: vi.fn(),
  updateStory: vi.fn(),
  patchStory: vi.fn(),
  deleteStory: vi.fn(),
}));

vi.mock('@plotpoint/db', () => {
  const storySelectSchema = z.object({
    id: z.string(),
    title: z.string(),
    summary: z.string().nullable(),
    status: z.enum(['draft', 'published', 'archived']),
    draftBundleUri: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
  });

  return {
    listStories: dbMocks.listStories,
    getStory: dbMocks.getStory,
    createStory: dbMocks.createStory,
    updateStory: dbMocks.updateStory,
    patchStory: dbMocks.patchStory,
    deleteStory: dbMocks.deleteStory,
    storySelectSchema,
  };
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
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
) => {
  if (body === undefined) {
    return createApp().request(path, { method });
  }

  return createApp().request(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
};

describe('@plotpoint/api story routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a story and returns the persisted record', async () => {
    const story = buildStoryRow();
    dbMocks.createStory.mockResolvedValueOnce(story);

    const response = await createJsonRequest('/stories', 'POST', {
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
    expect(dbMocks.createStory).toHaveBeenCalledWith({
      storyId: story.id,
      title: story.title,
      summary: story.summary,
      draftBundleUri: story.draftBundleUri,
    });
  });

  it('returns 400 for invalid create payloads', async () => {
    const response = await createJsonRequest('/stories', 'POST', {
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
    dbMocks.createStory.mockRejectedValueOnce({ code: '23505' });

    const response = await createJsonRequest('/stories', 'POST', {
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

  it('lists stories in API response format', async () => {
    dbMocks.listStories.mockResolvedValueOnce([
      buildStoryRow({
        id: 'story-2',
        updatedAt: new Date('2026-03-24T12:00:00.000Z'),
      }),
      buildStoryRow({
        id: 'story-1',
        updatedAt: new Date('2026-03-24T11:00:00.000Z'),
      }),
    ]);

    const response = await createJsonRequest('/stories', 'GET');

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

  it('gets one story and returns 404 when missing', async () => {
    dbMocks.getStory.mockResolvedValueOnce(buildStoryRow({ id: 'story-a' }));
    let response = await createJsonRequest('/stories/story-a', 'GET');
    expect(response.status).toBe(200);

    dbMocks.getStory.mockResolvedValueOnce(null);
    response = await createJsonRequest('/stories/story-missing', 'GET');
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'story_not_found',
        storyId: 'story-missing',
      },
    });
  });

  it('replaces a story via put and returns 404 when missing', async () => {
    dbMocks.updateStory.mockResolvedValueOnce(
      buildStoryRow({
        id: 'story-update',
        title: 'Updated Story',
        summary: 'Updated summary.',
      }),
    );

    let response = await createJsonRequest('/stories/story-update', 'PUT', {
      title: 'Updated Story',
      summary: 'Updated summary.',
      draftBundleUri: 's3://plotpoint-stories/drafts/story-update/v2.json',
    });

    expect(response.status).toBe(200);
    expect(dbMocks.updateStory).toHaveBeenCalledWith({
      storyId: 'story-update',
      title: 'Updated Story',
      summary: 'Updated summary.',
      draftBundleUri: 's3://plotpoint-stories/drafts/story-update/v2.json',
    });

    dbMocks.updateStory.mockResolvedValueOnce(null);
    response = await createJsonRequest('/stories/story-missing', 'PUT', {
      title: 'Missing Story',
      draftBundleUri: 's3://plotpoint-stories/drafts/story-missing/v2.json',
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'story_not_found',
        storyId: 'story-missing',
      },
    });
  });

  it('applies partial patch updates and supports summary clearing', async () => {
    dbMocks.patchStory.mockResolvedValueOnce(
      buildStoryRow({
        id: 'story-patch',
        title: 'Partially Updated Story',
        summary: 'Track the missing ledger.',
      }),
    );

    let response = await createJsonRequest('/stories/story-patch', 'PATCH', {
      title: 'Partially Updated Story',
    });

    expect(response.status).toBe(200);
    expect(dbMocks.patchStory).toHaveBeenCalledWith({
      storyId: 'story-patch',
      title: 'Partially Updated Story',
    });

    dbMocks.patchStory.mockResolvedValueOnce(
      buildStoryRow({
        id: 'story-patch',
        summary: null,
      }),
    );
    response = await createJsonRequest('/stories/story-patch', 'PATCH', {
      summary: null,
    });

    expect(response.status).toBe(200);
    expect(dbMocks.patchStory).toHaveBeenLastCalledWith({
      storyId: 'story-patch',
      summary: null,
    });
  });

  it('returns 404 when patch target is missing', async () => {
    dbMocks.patchStory.mockResolvedValueOnce(null);

    const response = await createJsonRequest('/stories/story-missing', 'PATCH', {
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

  it('returns 400 for invalid put payloads', async () => {
    const response = await createJsonRequest('/stories/story-update', 'PUT', {
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

  it('returns 400 for invalid patch payloads', async () => {
    let response = await createJsonRequest('/stories/story-update', 'PATCH', {
      title: '',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'validation_error',
      },
    });

    response = await createJsonRequest('/stories/story-update', 'PATCH', {});
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'validation_error',
      },
    });
  });

  it('deletes a story and returns 404 when missing', async () => {
    dbMocks.deleteStory.mockResolvedValueOnce(true);
    let response = await createJsonRequest('/stories/story-a', 'DELETE');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: true });
    expect(dbMocks.deleteStory).toHaveBeenCalledWith('story-a');

    dbMocks.deleteStory.mockResolvedValueOnce(false);
    response = await createJsonRequest('/stories/story-missing', 'DELETE');
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'story_not_found',
        storyId: 'story-missing',
      },
    });
  });
});
