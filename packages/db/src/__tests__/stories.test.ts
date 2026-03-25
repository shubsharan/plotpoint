import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createStory,
  deleteStory,
  getStory,
  listStories,
  patchStory,
  updateStory,
} from '../index.js';
import { stories } from '../schema/stories.js';

const schema = { stories } as const;
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = join(currentDirectory, '../../supabase/migrations');

type TestDatabase = PgliteDatabase<typeof schema>;
let testDatabase: TestDatabase | null = null;

vi.mock('../client.js', () => ({
  get db() {
    if (!testDatabase) {
      throw new Error('Test database not initialized.');
    }

    return testDatabase;
  },
}));

const createStoryInput = () => ({
  draftBundleUri: 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v1.json',
  id: 'story-the-stolen-ledger',
  summary: 'Track the missing ledger from the gallery foyer to the archive vault.',
  title: 'The Stolen Ledger',
});

const loadMigrations = async (): Promise<string[]> => {
  const migrationFolders = (
    await readdir(migrationsDirectory, {
      withFileTypes: true,
    })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (migrationFolders.length === 0) {
    throw new Error('Expected at least one Drizzle SQL migration in packages/db/drizzle.');
  }

  return Promise.all(
    migrationFolders.map((migrationFolder) =>
      readFile(join(migrationsDirectory, migrationFolder, 'migration.sql'), 'utf8'),
    ),
  );
};

const setupDatabase = async (): Promise<{
  client: PGlite;
  database: TestDatabase;
}> => {
  const client = new PGlite();
  const database = drizzle({ client, schema });
  const migrations = await loadMigrations();

  for (const migration of migrations) {
    await client.exec(migration);
  }

  return {
    client,
    database,
  };
};

describe('@plotpoint/db stories', () => {
  let client: PGlite;

  beforeEach(async () => {
    const setup = await setupDatabase();

    client = setup.client;
    testDatabase = setup.database;
  });

  afterEach(async () => {
    testDatabase = null;
    await client.close();
  });

  it('creates and fetches a draft story', async () => {
    const input = createStoryInput();
    const result = await createStory({
      ...input,
      now: new Date('2026-03-23T12:00:00.000Z'),
    });

    expect(result).toMatchObject({
      id: 'story-the-stolen-ledger',
      status: 'draft',
      summary: 'Track the missing ledger from the gallery foyer to the archive vault.',
      title: 'The Stolen Ledger',
    });

    const story = await getStory('story-the-stolen-ledger');

    expect(story).toMatchObject({
      id: 'story-the-stolen-ledger',
      status: 'draft',
    });
    expect(story?.draftBundleUri).toBe(input.draftBundleUri);
  });

  it('rejects duplicate story ids at the database layer', async () => {
    const input = createStoryInput();

    await createStory(input);

    await expect(createStory(input)).rejects.toThrow();
  });

  it('lists stories by updated timestamp descending', async () => {
    const olderInput = createStoryInput();
    const newerInput = createStoryInput();

    olderInput.id = 'story-older';
    olderInput.title = 'Older Story';
    olderInput.draftBundleUri = 's3://plotpoint-stories/drafts/story-older/v1.json';
    newerInput.id = 'story-newer';
    newerInput.title = 'Newer Story';
    newerInput.draftBundleUri = 's3://plotpoint-stories/drafts/story-newer/v1.json';

    await createStory({
      ...olderInput,
      now: new Date('2026-03-23T08:00:00.000Z'),
    });
    await createStory({
      ...newerInput,
      now: new Date('2026-03-23T09:00:00.000Z'),
    });

    await expect(listStories()).resolves.toMatchObject([
      {
        id: 'story-newer',
      },
      {
        id: 'story-older',
      },
    ]);
  });

  it('updates the stored metadata and bundle together', async () => {
    const input = createStoryInput();

    await createStory(input);

    input.summary = 'Updated story summary.';
    input.title = 'The Stolen Ledger Revised';
    input.draftBundleUri = 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v2.json';

    const result = await updateStory({
      draftBundleUri: input.draftBundleUri,
      id: 'story-the-stolen-ledger',
      now: new Date('2026-03-23T13:00:00.000Z'),
      summary: input.summary,
      title: input.title,
    });

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      summary: 'Updated story summary.',
      title: 'The Stolen Ledger Revised',
    });

    const story = await getStory('story-the-stolen-ledger');

    expect(story?.draftBundleUri).toBe(input.draftBundleUri);
    expect(story?.updatedAt.toISOString()).toBe('2026-03-23T13:00:00.000Z');
  });

  it('updates by path story id', async () => {
    await createStory(createStoryInput());

    const updated = await updateStory({
      draftBundleUri: 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v3.json',
      id: 'story-the-stolen-ledger',
      summary: 'Track the missing ledger from the gallery foyer to the archive vault.',
      title: 'The Stolen Ledger',
    });

    expect(updated).toMatchObject({
      id: 'story-the-stolen-ledger',
      title: 'The Stolen Ledger',
    });
    expect(updated?.draftBundleUri).toBe(
      's3://plotpoint-stories/drafts/story-the-stolen-ledger/v3.json',
    );
  });

  it('patches only provided fields and keeps omitted fields unchanged', async () => {
    const input = createStoryInput();
    await createStory(input);

    const patched = await patchStory({
      id: 'story-the-stolen-ledger',
      now: new Date('2026-03-23T14:00:00.000Z'),
      title: "The Stolen Ledger: Director's Cut",
    });

    expect(patched).toMatchObject({
      title: "The Stolen Ledger: Director's Cut",
    });

    const story = await getStory('story-the-stolen-ledger');
    expect(story?.title).toBe("The Stolen Ledger: Director's Cut");
    expect(story?.summary).toBe(input.summary);
    expect(story?.draftBundleUri).toBe(input.draftBundleUri);
    expect(story?.updatedAt.toISOString()).toBe('2026-03-23T14:00:00.000Z');
  });

  it('clears summary when patch receives explicit null', async () => {
    await createStory(createStoryInput());

    const patched = await patchStory({
      id: 'story-the-stolen-ledger',
      summary: null,
    });

    expect(patched?.summary).toBeNull();
    await expect(getStory('story-the-stolen-ledger')).resolves.toMatchObject({
      summary: null,
    });
  });

  it('returns null/false for not-found reads, updates, and deletes', async () => {
    const missingStory = await getStory('story-missing');

    expect(missingStory).toBeNull();

    await expect(
      updateStory({
        draftBundleUri: 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v1.json',
        id: 'story-the-stolen-ledger',
        summary: 'Track the missing ledger from the gallery foyer to the archive vault.',
        title: 'The Stolen Ledger',
      }),
    ).resolves.toBeNull();
    await expect(
      patchStory({
        id: 'story-the-stolen-ledger',
        title: 'Does Not Exist',
      }),
    ).resolves.toBeNull();

    await expect(deleteStory('story-missing')).resolves.toBe(false);
  });

  it('rejects patch requests with no writable fields', async () => {
    await expect(
      patchStory({
        id: 'story-the-stolen-ledger',
      }),
    ).rejects.toThrow('At least one story field must be provided for patch.');
  });

  it('deletes existing stories explicitly', async () => {
    await createStory(createStoryInput());

    await expect(deleteStory('story-the-stolen-ledger')).resolves.toBe(true);
    await expect(getStory('story-the-stolen-ledger')).resolves.toBeNull();
  });
});
