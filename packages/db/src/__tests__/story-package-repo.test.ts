import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStoryPackageRepo } from '../repos/story-package-repo.js';
import { createStoryQueries, type StoryQueries } from '../queries/stories.js';
import { publishedStoryPackageVersions, stories } from '../schema/stories.js';

const schema = {
  stories,
  publishedStoryPackageVersions,
} as const;
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = join(currentDirectory, '../../supabase/migrations');

type TestDatabase = PgliteDatabase<typeof schema>;

const createStoryPackage = (storyId: string, title: string, engineMajor: number | null) => ({
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
  let packageStorage: Map<string, unknown>;

  beforeAll(async () => {
    client = new PGlite();
    database = drizzle({ client, schema });
    const migrations = await loadMigrations();

    for (const migration of migrations) {
      await client.exec(migration);
    }

    storyQueries = createStoryQueries(database);
    packageStorage = new Map<string, unknown>();
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    packageStorage.clear();
    await database.delete(publishedStoryPackageVersions);
    await database.delete(stories);
  });

  it('reads current published package and allows version-pinned package lookup', async () => {
    const storyId = 'story-the-stolen-ledger';
    const draftPackageUriV1 = 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v1.json';
    const draftPackageUriV2 = 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v2.json';
    const publishedPackageUriV1 = 's3://plotpoint-stories/published/story-the-stolen-ledger/v1.json';

    packageStorage.set(draftPackageUriV1, createStoryPackage(storyId, 'Draft Package V1', null));
    packageStorage.set(draftPackageUriV2, createStoryPackage(storyId, 'Draft Package V2', null));
    packageStorage.set(
      publishedPackageUriV1,
      createStoryPackage(storyId, 'Published Package V1', 1),
    );

    await storyQueries.createStory({
      draftPackageUri: draftPackageUriV1,
      id: storyId,
      title: 'The Stolen Ledger',
    });

    const storyRepo = createStoryPackageRepo({
      readPackage: async (packageUri: string) => {
        if (!packageStorage.has(packageUri)) {
          throw new Error(`Missing package "${packageUri}".`);
        }

        return packageStorage.get(packageUri);
      },
      storyQueries,
    });

    await expect(storyRepo.getCurrentPublishedPackage(storyId)).rejects.toThrow(
      'Published story package not found for story "story-the-stolen-ledger".',
    );

    await storyQueries.publishStory({
      engineMajor: 1,
      publishedAt: new Date('2026-03-30T10:00:00.000Z'),
      publishedPackageUri: publishedPackageUriV1,
      publishedStoryPackageVersionId: 'snapshot-v1',
      storyId,
      summary: 'Track the missing ledger.',
      title: 'Published Package V1',
    });

    await storyQueries.patchStory({
      draftPackageUri: draftPackageUriV2,
      id: storyId,
      title: 'The Stolen Ledger (Draft Updated)',
    });

    const currentPublishedPackage = await storyRepo.getCurrentPublishedPackage(storyId);
    expect(currentPublishedPackage.storyPackageVersionId).toBe('snapshot-v1');
    expect(currentPublishedPackage.storyPackage.metadata.title).toBe('Published Package V1');
    expect(currentPublishedPackage.storyPackage.version.engineMajor).toBe(1);

    const pinnedPackage = await storyRepo.getPublishedPackage(storyId, 'snapshot-v1');
    expect(pinnedPackage.metadata.title).toBe('Published Package V1');
    expect(pinnedPackage.version.engineMajor).toBe(1);
  });

  it('rejects version-pinned lookups when the requested version does not exist', async () => {
    const storyId = 'story-the-stolen-ledger';
    const draftPackageUriV1 = 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v1.json';
    const publishedPackageUriV1 = 's3://plotpoint-stories/published/story-the-stolen-ledger/v1.json';

    packageStorage.set(draftPackageUriV1, createStoryPackage(storyId, 'Draft Package V1', null));
    packageStorage.set(
      publishedPackageUriV1,
      createStoryPackage(storyId, 'Published Package V1', 1),
    );

    await storyQueries.createStory({
      draftPackageUri: draftPackageUriV1,
      id: storyId,
      title: 'The Stolen Ledger',
    });
    await storyQueries.publishStory({
      engineMajor: 1,
      publishedAt: new Date('2026-03-30T11:00:00.000Z'),
      publishedPackageUri: publishedPackageUriV1,
      publishedStoryPackageVersionId: 'snapshot-v1',
      storyId,
      summary: 'Track the missing ledger.',
      title: 'Published Package V1',
    });

    const storyRepo = createStoryPackageRepo({
      readPackage: async (packageUri: string) => {
        if (!packageStorage.has(packageUri)) {
          throw new Error(`Missing package "${packageUri}".`);
        }

        return packageStorage.get(packageUri);
      },
      storyQueries,
    });

    await expect(storyRepo.getPublishedPackage(storyId, 'snapshot-missing')).rejects.toThrow(
      'Published story package version "snapshot-missing" not found for story "story-the-stolen-ledger".',
    );
  });
});
