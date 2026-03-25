import { PGlite } from '@electric-sql/pglite';
import { createStoryQueries, stories as storiesTable } from '@plotpoint/db';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../index.js';

const schema = { stories: storiesTable } as const;
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = join(currentDirectory, '../../../../packages/db/supabase/migrations');

type TestDatabase = PgliteDatabase<typeof schema>;

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

describe('@plotpoint/api stories seam integration', () => {
  let client: PGlite;
  let database: TestDatabase;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    client = new PGlite();
    database = drizzle({ client, schema });
    const migrations = await loadMigrations();
    for (const migration of migrations) {
      await client.exec(migration);
    }

    app = createApp(createStoryQueries(database));
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.delete(storiesTable);
  });

  it('creates a draft via api and reads it back', async () => {
    const createResponse = await app.request('/stories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: 'story-the-stolen-ledger',
        title: 'The Stolen Ledger',
        draftBundleUri: 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v1.json',
      }),
    });

    expect(createResponse.status).toBe(201);
    await expect(createResponse.json()).resolves.toMatchObject({
      id: 'story-the-stolen-ledger',
      title: 'The Stolen Ledger',
      summary: null,
      status: 'draft',
      draftBundleUri: 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v1.json',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const getResponse = await app.request('/stories/story-the-stolen-ledger', {
      method: 'GET',
    });

    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toMatchObject({
      id: 'story-the-stolen-ledger',
      summary: null,
      status: 'draft',
      draftBundleUri: 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v1.json',
    });
  });

  it('patches draft bundle uri via api and persists the change', async () => {
    await app.request('/stories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: 'story-bundle-update',
        title: 'Bundle Update Story',
        summary: 'Original summary',
        draftBundleUri: 's3://plotpoint-stories/drafts/story-bundle-update/v1.json',
      }),
    });

    const patchResponse = await app.request('/stories/story-bundle-update', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        draftBundleUri: 's3://plotpoint-stories/drafts/story-bundle-update/v2.json',
      }),
    });

    expect(patchResponse.status).toBe(200);
    await expect(patchResponse.json()).resolves.toMatchObject({
      id: 'story-bundle-update',
      title: 'Bundle Update Story',
      summary: 'Original summary',
      draftBundleUri: 's3://plotpoint-stories/drafts/story-bundle-update/v2.json',
      status: 'draft',
    });

    const listResponse = await app.request('/stories', {
      method: 'GET',
    });

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject([
      {
        id: 'story-bundle-update',
        draftBundleUri: 's3://plotpoint-stories/drafts/story-bundle-update/v2.json',
      },
    ]);
  });
});
