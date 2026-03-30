import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStoryRepo } from '../repos/story-repo.js';
import { createStoryQueries, type StoryQueries } from '../queries/stories.js';
import { storyPublishedSnapshots, stories } from '../schema/stories.js';

const schema = {
  stories,
  storyPublishedSnapshots,
} as const;
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = join(currentDirectory, '../../supabase/migrations');

type TestDatabase = PgliteDatabase<typeof schema>;

const createStoryBundle = (storyId: string, title: string, engineMajor: number | null) => ({
  metadata: {
    storyId,
    title,
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
    engineMajor,
  },
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

describe('@plotpoint/db story repo adapter', () => {
  let client: PGlite;
  let database: TestDatabase;
  let storyQueries: StoryQueries;
  let bundleStorage: Map<string, unknown>;

  beforeAll(async () => {
    client = new PGlite();
    database = drizzle({ client, schema });
    const migrations = await loadMigrations();

    for (const migration of migrations) {
      await client.exec(migration);
    }

    storyQueries = createStoryQueries(database);
    bundleStorage = new Map<string, unknown>();
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    bundleStorage.clear();
    await database.delete(storyPublishedSnapshots);
    await database.delete(stories);
  });

  it('reads only the current published bundle and ignores newer draft content', async () => {
    const storyId = 'story-the-stolen-ledger';
    const draftBundleUriV1 = 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v1.json';
    const draftBundleUriV2 = 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v2.json';
    const publishedBundleUriV1 = 's3://plotpoint-stories/published/story-the-stolen-ledger/v1.json';

    bundleStorage.set(draftBundleUriV1, createStoryBundle(storyId, 'Draft Bundle V1', null));
    bundleStorage.set(draftBundleUriV2, createStoryBundle(storyId, 'Draft Bundle V2', null));
    bundleStorage.set(publishedBundleUriV1, createStoryBundle(storyId, 'Published Bundle V1', 0));

    await storyQueries.createStory({
      draftBundleUri: draftBundleUriV1,
      id: storyId,
      title: 'The Stolen Ledger',
    });

    const storyRepo = createStoryRepo({
      readBundle: async (bundleUri: string) => {
        if (!bundleStorage.has(bundleUri)) {
          throw new Error(`Missing bundle "${bundleUri}".`);
        }

        return bundleStorage.get(bundleUri);
      },
      storyQueries,
    });

    await expect(storyRepo.getBundle(storyId)).rejects.toThrow(
      'Published bundle not found for story "story-the-stolen-ledger".',
    );

    await storyQueries.publishStory({
      engineMajor: 0,
      publishedAt: new Date('2026-03-30T10:00:00.000Z'),
      publishedBundleUri: publishedBundleUriV1,
      snapshotId: 'snapshot-v1',
      storyId,
      summary: 'Track the missing ledger.',
      title: 'Published Bundle V1',
    });

    await storyQueries.patchStory({
      draftBundleUri: draftBundleUriV2,
      id: storyId,
      title: 'The Stolen Ledger (Draft Updated)',
    });

    const publishedBundle = await storyRepo.getBundle(storyId);
    expect(publishedBundle.metadata.title).toBe('Published Bundle V1');
    expect(publishedBundle.version.engineMajor).toBe(0);
  });
});
