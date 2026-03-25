import { describe, expect, it, vi } from 'vitest';

vi.mock('@plotpoint/db', () => {
  return {
    listStories: vi.fn(),
    getStory: vi.fn(),
    createStory: vi.fn(),
    updateStory: vi.fn(),
    patchStory: vi.fn(),
    deleteStory: vi.fn(),
  };
});

describe('@plotpoint/api', () => {
  it('exports a createApp factory and prebuilt app', async () => {
    const { app, createApp } = await import('../index.js');

    expect(typeof createApp).toBe('function');
    expect(app).toBeDefined();
  });
});
