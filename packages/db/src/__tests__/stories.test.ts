import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStoryQueries, type StoryQueries } from '../index.js';
import { stories } from '../schema/stories.js';

const schema = { stories } as const;
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = join(currentDirectory, '../../supabase/migrations');

type TestDatabase = PgliteDatabase<typeof schema>;

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
    throw new Error('Expected at least one Drizzle SQL migration in packages/db/supabase/migrations.');
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
  let testDatabase: TestDatabase;
  let storyQueries: StoryQueries;

  beforeAll(async () => {
    const setup = await setupDatabase();

    client = setup.client;
    testDatabase = setup.database;
    storyQueries = createStoryQueries(testDatabase);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await testDatabase.delete(stories);
  });

  it('creates and fetches a draft story', async () => {
    const input = createStoryInput();
    const result = await storyQueries.createStory({
      ...input,
      now: new Date('2026-03-23T12:00:00.000Z'),
    });

    expect(result).toMatchObject({
      id: 'story-the-stolen-ledger',
      status: 'draft',
      summary: 'Track the missing ledger from the gallery foyer to the archive vault.',
      title: 'The Stolen Ledger',
    });

    const story = await storyQueries.getStory('story-the-stolen-ledger');

    expect(story).toMatchObject({
      id: 'story-the-stolen-ledger',
      status: 'draft',
    });
    expect(story?.draftBundleUri).toBe(input.draftBundleUri);
  });

  it('rejects duplicate story ids at the database layer', async () => {
    const input = createStoryInput();

    await storyQueries.createStory(input);

    await expect(storyQueries.createStory(input)).rejects.toThrow();
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

    await storyQueries.createStory({
      ...olderInput,
      now: new Date('2026-03-23T08:00:00.000Z'),
    });
    await storyQueries.createStory({
      ...newerInput,
      now: new Date('2026-03-23T09:00:00.000Z'),
    });

    await expect(storyQueries.listStories()).resolves.toMatchObject([
      {
        id: 'story-newer',
      },
      {
        id: 'story-older',
      },
    ]);
  });

  it('applies deterministic tie-breaking when updated timestamps match', async () => {
    await storyQueries.createStory({
      ...createStoryInput(),
      id: 'story-a',
      now: new Date('2026-03-23T09:00:00.000Z'),
      draftBundleUri: 's3://plotpoint-stories/drafts/story-a/v1.json',
      title: 'Story A',
    });
    await storyQueries.createStory({
      ...createStoryInput(),
      id: 'story-z',
      now: new Date('2026-03-23T09:00:00.000Z'),
      draftBundleUri: 's3://plotpoint-stories/drafts/story-z/v1.json',
      title: 'Story Z',
    });

    await expect(storyQueries.listStories()).resolves.toMatchObject([
      { id: 'story-z' },
      { id: 'story-a' },
    ]);
  });

  it('replaces a story including null summary and updated bundle uri', async () => {
    const input = createStoryInput();

    await storyQueries.createStory(input);

    const result = await storyQueries.updateStory({
      draftBundleUri: 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v2.json',
      id: 'story-the-stolen-ledger',
      now: new Date('2026-03-23T13:00:00.000Z'),
      summary: null,
      title: 'The Stolen Ledger Revised',
    });

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      summary: null,
      title: 'The Stolen Ledger Revised',
    });

    const story = await storyQueries.getStory('story-the-stolen-ledger');

    expect(story?.draftBundleUri).toBe('s3://plotpoint-stories/drafts/story-the-stolen-ledger/v2.json');
    expect(story?.updatedAt.toISOString()).toBe('2026-03-23T13:00:00.000Z');
  });

  it('patches only provided fields and keeps omitted fields unchanged', async () => {
    const input = createStoryInput();
    await storyQueries.createStory(input);

    const patched = await storyQueries.patchStory({
      id: 'story-the-stolen-ledger',
      now: new Date('2026-03-23T14:00:00.000Z'),
      title: "The Stolen Ledger: Director's Cut",
    });

    expect(patched).toMatchObject({
      title: "The Stolen Ledger: Director's Cut",
    });

    const story = await storyQueries.getStory('story-the-stolen-ledger');
    expect(story?.title).toBe("The Stolen Ledger: Director's Cut");
    expect(story?.summary).toBe(input.summary);
    expect(story?.draftBundleUri).toBe(input.draftBundleUri);
    expect(story?.updatedAt.toISOString()).toBe('2026-03-23T14:00:00.000Z');
  });

  it('patches only draft bundle uri when provided', async () => {
    await storyQueries.createStory(createStoryInput());

    const patched = await storyQueries.patchStory({
      draftBundleUri: 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v2.json',
      id: 'story-the-stolen-ledger',
      now: new Date('2026-03-23T15:00:00.000Z'),
    });

    expect(patched?.draftBundleUri).toBe('s3://plotpoint-stories/drafts/story-the-stolen-ledger/v2.json');
    await expect(storyQueries.getStory('story-the-stolen-ledger')).resolves.toMatchObject({
      draftBundleUri: 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v2.json',
      summary: 'Track the missing ledger from the gallery foyer to the archive vault.',
      title: 'The Stolen Ledger',
    });
  });

  it('clears summary when patch receives explicit null', async () => {
    await storyQueries.createStory(createStoryInput());

    const patched = await storyQueries.patchStory({
      id: 'story-the-stolen-ledger',
      summary: null,
    });

    expect(patched?.summary).toBeNull();
    await expect(storyQueries.getStory('story-the-stolen-ledger')).resolves.toMatchObject({
      summary: null,
    });
  });

  it('returns null/false for not-found reads, updates, and deletes', async () => {
    const missingStory = await storyQueries.getStory('story-missing');

    expect(missingStory).toBeNull();

    await expect(
      storyQueries.updateStory({
        draftBundleUri: 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v1.json',
        id: 'story-the-stolen-ledger',
        summary: 'Track the missing ledger from the gallery foyer to the archive vault.',
        title: 'The Stolen Ledger',
      }),
    ).resolves.toBeNull();
    await expect(
      storyQueries.patchStory({
        id: 'story-the-stolen-ledger',
        title: 'Does Not Exist',
      }),
    ).resolves.toBeNull();

    await expect(storyQueries.deleteStory('story-missing')).resolves.toBe(false);
  });

  it('rejects patch requests with no writable fields', async () => {
    await expect(
      storyQueries.patchStory({
        id: 'story-the-stolen-ledger',
      }),
    ).rejects.toThrow('At least one story field must be provided for patch.');
  });

  it('deletes existing stories explicitly', async () => {
    await storyQueries.createStory(createStoryInput());

    await expect(storyQueries.deleteStory('story-the-stolen-ledger')).resolves.toBe(true);
    await expect(storyQueries.getStory('story-the-stolen-ledger')).resolves.toBeNull();
  });
});
