import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

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
    listStories: vi.fn(),
    getStory: vi.fn(),
    createStory: vi.fn(),
    updateStory: vi.fn(),
    patchStory: vi.fn(),
    deleteStory: vi.fn(),
    storySelectSchema,
  };
});

describe('@plotpoint/api', () => {
  it('exports a createApp factory and prebuilt app', async () => {
    const { app, createApp } = await import('../index.js');

    expect(typeof createApp).toBe('function');
    expect(app).toBeDefined();
  });
});
