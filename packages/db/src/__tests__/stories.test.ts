import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStoryQueries, type StoryQueries } from '../index.js';
import { publishedStoryPackageVersions, stories } from '../schema/stories.js';

const schema = {
  stories,
  publishedStoryPackageVersions,
} as const;
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = join(currentDirectory, '../../supabase/migrations');

type TestDatabase = PgliteDatabase<typeof schema>;

const createStoryInput = () => ({
  draftPackageUri: 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v1.json',
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

  const migrations = await Promise.all(
    migrationFolders.map(async (migrationFolder) => {
      try {
        return await readFile(join(migrationsDirectory, migrationFolder, 'migration.sql'), 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return null;
        }

        throw error;
      }
    }),
  );
  const sqlMigrations = migrations.filter((migration): migration is string => migration !== null);
  if (sqlMigrations.length === 0) {
    throw new Error('Expected at least one migration.sql in packages/db/supabase/migrations.');
  }

  return sqlMigrations;
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
    await testDatabase.delete(publishedStoryPackageVersions);
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
    expect(story?.draftPackageUri).toBe(input.draftPackageUri);
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
    olderInput.draftPackageUri = 's3://plotpoint-stories/drafts/story-older/v1.json';
    newerInput.id = 'story-newer';
    newerInput.title = 'Newer Story';
    newerInput.draftPackageUri = 's3://plotpoint-stories/drafts/story-newer/v1.json';

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
      draftPackageUri: 's3://plotpoint-stories/drafts/story-a/v1.json',
      title: 'Story A',
    });
    await storyQueries.createStory({
      ...createStoryInput(),
      id: 'story-z',
      now: new Date('2026-03-23T09:00:00.000Z'),
      draftPackageUri: 's3://plotpoint-stories/drafts/story-z/v1.json',
      title: 'Story Z',
    });

    await expect(storyQueries.listStories()).resolves.toMatchObject([
      { id: 'story-z' },
      { id: 'story-a' },
    ]);
  });

  it('replaces a story including null summary and updated package uri', async () => {
    const input = createStoryInput();

    await storyQueries.createStory(input);

    const result = await storyQueries.updateStory({
      draftPackageUri: 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v2.json',
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

    expect(story?.draftPackageUri).toBe('s3://plotpoint-stories/drafts/story-the-stolen-ledger/v2.json');
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
    expect(story?.draftPackageUri).toBe(input.draftPackageUri);
    expect(story?.updatedAt.toISOString()).toBe('2026-03-23T14:00:00.000Z');
  });

  it('patches only draft package uri when provided', async () => {
    await storyQueries.createStory(createStoryInput());

    const patched = await storyQueries.patchStory({
      draftPackageUri: 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v2.json',
      id: 'story-the-stolen-ledger',
      now: new Date('2026-03-23T15:00:00.000Z'),
    });

    expect(patched?.draftPackageUri).toBe('s3://plotpoint-stories/drafts/story-the-stolen-ledger/v2.json');
    await expect(storyQueries.getStory('story-the-stolen-ledger')).resolves.toMatchObject({
      draftPackageUri: 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v2.json',
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

  it('returns null/not_found for not-found reads, updates, and deletes', async () => {
    const missingStory = await storyQueries.getStory('story-missing');

    expect(missingStory).toBeNull();

    await expect(
      storyQueries.updateStory({
        draftPackageUri: 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v1.json',
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

    await expect(storyQueries.deleteStory('story-missing')).resolves.toBe('not_found');
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

    await expect(storyQueries.deleteStory('story-the-stolen-ledger')).resolves.toBe('deleted');
    await expect(storyQueries.getStory('story-the-stolen-ledger')).resolves.toBeNull();
  });

  it('publishes stories by creating immutable published package versions and advancing current pointer', async () => {
    await storyQueries.createStory(createStoryInput());

    const firstPublish = await storyQueries.publishStory({
      engineMajor: 1,
      publishedAt: new Date('2026-03-23T16:00:00.000Z'),
      publishedPackageUri: 's3://plotpoint-stories/published/story-the-stolen-ledger/v1.json',
      publishedStoryPackageVersionId: 'snapshot-v1',
      storyId: 'story-the-stolen-ledger',
      summary: 'Track the missing ledger from the gallery foyer to the archive vault.',
      title: 'The Stolen Ledger',
    });

    expect(firstPublish).toMatchObject({
      storyId: 'story-the-stolen-ledger',
      status: 'published',
      publishedStoryPackageVersionId: 'snapshot-v1',
      engineMajor: 1,
      publishedPackageUri: 's3://plotpoint-stories/published/story-the-stolen-ledger/v1.json',
    });

    const secondPublish = await storyQueries.publishStory({
      engineMajor: 1,
      publishedAt: new Date('2026-03-23T17:00:00.000Z'),
      publishedPackageUri: 's3://plotpoint-stories/published/story-the-stolen-ledger/v2.json',
      publishedStoryPackageVersionId: 'snapshot-v2',
      storyId: 'story-the-stolen-ledger',
      summary: 'Updated published summary',
      title: 'The Stolen Ledger Updated',
    });

    expect(secondPublish).toMatchObject({
      publishedStoryPackageVersionId: 'snapshot-v2',
      publishedPackageUri: 's3://plotpoint-stories/published/story-the-stolen-ledger/v2.json',
      status: 'published',
    });

    const story = await storyQueries.getStory('story-the-stolen-ledger');
    expect(story).toMatchObject({
      status: 'published',
      currentPublishedPackageVersionId: 'snapshot-v2',
    });
    expect(story?.lastPublishedAt?.toISOString()).toBe('2026-03-23T17:00:00.000Z');

    const publishedList = await storyQueries.listPublishedStories();
    expect(publishedList).toMatchObject([
      {
        id: 'story-the-stolen-ledger',
        status: 'published',
        title: 'The Stolen Ledger Updated',
        summary: 'Updated published summary',
        publishedAt: new Date('2026-03-23T17:00:00.000Z'),
      },
    ]);
  });

  it('returns published-catalog reads only for published stories', async () => {
    await storyQueries.createStory({
      ...createStoryInput(),
      id: 'story-draft-only',
      title: 'Draft Only Story',
      draftPackageUri: 's3://plotpoint-stories/drafts/story-draft-only/v1.json',
    });
    await storyQueries.createStory({
      ...createStoryInput(),
      id: 'story-published',
      title: 'Published Story',
      draftPackageUri: 's3://plotpoint-stories/drafts/story-published/v1.json',
    });

    await storyQueries.publishStory({
      engineMajor: 1,
      publishedAt: new Date('2026-03-23T18:00:00.000Z'),
      publishedPackageUri: 's3://plotpoint-stories/published/story-published/v1.json',
      publishedStoryPackageVersionId: 'snapshot-published',
      storyId: 'story-published',
      summary: 'Track the missing ledger from the gallery foyer to the archive vault.',
      title: 'Published Story',
    });

    await expect(storyQueries.getPublishedStory('story-draft-only')).resolves.toBeNull();
    await expect(storyQueries.getPublishedStory('story-published')).resolves.toMatchObject({
      id: 'story-published',
      status: 'published',
      publishedAt: new Date('2026-03-23T18:00:00.000Z'),
    });
    await expect(storyQueries.listPublishedStories()).resolves.toMatchObject([
      {
        id: 'story-published',
        status: 'published',
      },
    ]);
  });

  it('keeps published status on draft edits after publish', async () => {
    await storyQueries.createStory(createStoryInput());
    await storyQueries.publishStory({
      engineMajor: 1,
      publishedAt: new Date('2026-03-23T19:00:00.000Z'),
      publishedPackageUri: 's3://plotpoint-stories/published/story-the-stolen-ledger/v1.json',
      publishedStoryPackageVersionId: 'snapshot-v1',
      storyId: 'story-the-stolen-ledger',
      summary: 'Published summary v1',
      title: 'Published title v1',
    });

    await storyQueries.updateStory({
      draftPackageUri: 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v2.json',
      id: 'story-the-stolen-ledger',
      summary: 'Updated summary',
      title: 'Updated title',
    });

    const patched = await storyQueries.patchStory({
      id: 'story-the-stolen-ledger',
      title: 'Updated title again',
    });
    expect(patched).toMatchObject({
      status: 'published',
      currentPublishedPackageVersionId: 'snapshot-v1',
    });

    await expect(storyQueries.getPublishedStory('story-the-stolen-ledger')).resolves.toMatchObject({
      id: 'story-the-stolen-ledger',
      title: 'Published title v1',
      summary: 'Published summary v1',
      status: 'published',
    });
    await expect(storyQueries.listPublishedStories()).resolves.toMatchObject([
      {
        id: 'story-the-stolen-ledger',
        title: 'Published title v1',
        summary: 'Published summary v1',
        status: 'published',
      },
    ]);
  });

  it('exposes current published package reference for runtime lookup', async () => {
    await storyQueries.createStory(createStoryInput());

    await expect(
      storyQueries.getCurrentPublishedStoryPackageVersion('story-the-stolen-ledger'),
    ).resolves.toBeNull();

    await storyQueries.publishStory({
      engineMajor: 1,
      publishedAt: new Date('2026-03-23T20:00:00.000Z'),
      publishedPackageUri: 's3://plotpoint-stories/published/story-the-stolen-ledger/v1.json',
      publishedStoryPackageVersionId: 'snapshot-runtime',
      storyId: 'story-the-stolen-ledger',
      summary: 'Track the missing ledger from the gallery foyer to the archive vault.',
      title: 'The Stolen Ledger',
    });

    await expect(
      storyQueries.getCurrentPublishedStoryPackageVersion('story-the-stolen-ledger'),
    ).resolves.toMatchObject({
      storyId: 'story-the-stolen-ledger',
      publishedStoryPackageVersionId: 'snapshot-runtime',
      engineMajor: 1,
      publishedPackageUri: 's3://plotpoint-stories/published/story-the-stolen-ledger/v1.json',
      publishedAt: new Date('2026-03-23T20:00:00.000Z'),
    });

    await expect(
      storyQueries.getPublishedStoryPackageVersion('story-the-stolen-ledger', 'snapshot-runtime'),
    ).resolves.toMatchObject({
      storyId: 'story-the-stolen-ledger',
      publishedStoryPackageVersionId: 'snapshot-runtime',
      engineMajor: 1,
      publishedPackageUri: 's3://plotpoint-stories/published/story-the-stolen-ledger/v1.json',
      publishedAt: new Date('2026-03-23T20:00:00.000Z'),
    });
  });

  it('reads non-current published package versions for pinned runtime resume', async () => {
    await storyQueries.createStory(createStoryInput());
    await storyQueries.publishStory({
      engineMajor: 1,
      publishedAt: new Date('2026-03-23T20:30:00.000Z'),
      publishedPackageUri: 's3://plotpoint-stories/published/story-the-stolen-ledger/v1.json',
      publishedStoryPackageVersionId: 'snapshot-v1',
      storyId: 'story-the-stolen-ledger',
      summary: 'Summary v1',
      title: 'Title v1',
    });
    await storyQueries.publishStory({
      engineMajor: 1,
      publishedAt: new Date('2026-03-23T20:45:00.000Z'),
      publishedPackageUri: 's3://plotpoint-stories/published/story-the-stolen-ledger/v2.json',
      publishedStoryPackageVersionId: 'snapshot-v2',
      storyId: 'story-the-stolen-ledger',
      summary: 'Summary v2',
      title: 'Title v2',
    });

    await expect(
      storyQueries.getCurrentPublishedStoryPackageVersion('story-the-stolen-ledger'),
    ).resolves.toMatchObject({
      publishedStoryPackageVersionId: 'snapshot-v2',
    });

    await expect(
      storyQueries.getPublishedStoryPackageVersion('story-the-stolen-ledger', 'snapshot-v1'),
    ).resolves.toMatchObject({
      publishedStoryPackageVersionId: 'snapshot-v1',
      publishedPackageUri: 's3://plotpoint-stories/published/story-the-stolen-ledger/v1.json',
      publishedAt: new Date('2026-03-23T20:30:00.000Z'),
    });

    await expect(
      storyQueries.getPublishedStoryPackageVersion('story-the-stolen-ledger', 'snapshot-missing'),
    ).resolves.toBeNull();
  });

  it('blocks deleting stories with published package versions', async () => {
    await storyQueries.createStory(createStoryInput());
    await storyQueries.publishStory({
      engineMajor: 1,
      publishedAt: new Date('2026-03-23T21:00:00.000Z'),
      publishedPackageUri: 's3://plotpoint-stories/published/story-the-stolen-ledger/v1.json',
      publishedStoryPackageVersionId: 'snapshot-delete-guard',
      storyId: 'story-the-stolen-ledger',
      summary: 'Track the missing ledger from the gallery foyer to the archive vault.',
      title: 'The Stolen Ledger',
    });

    await expect(storyQueries.deleteStory('story-the-stolen-ledger')).resolves.toBe(
      'has_published_package_versions',
    );
  });
});
