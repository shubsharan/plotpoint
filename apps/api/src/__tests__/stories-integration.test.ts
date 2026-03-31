import { PGlite } from '@electric-sql/pglite';
import {
  createStoryQueries,
  publishedStoryPackageVersions as publishedStoryPackageVersionsTable,
  stories as storiesTable,
} from '@plotpoint/db';
import { currentEngineMajor } from '@plotpoint/engine';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../index.js';

const schema = {
  stories: storiesTable,
  publishedStoryPackageVersions: publishedStoryPackageVersionsTable,
} as const;
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = join(currentDirectory, '../../../../packages/db/supabase/migrations');

type TestDatabase = PgliteDatabase<typeof schema>;

const createValidStoryPackage = (storyId: string, title: string) => ({
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
    engineMajor: null,
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

describe('@plotpoint/api stories seam integration', () => {
  let client: PGlite;
  let database: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let bundleStorage: Map<string, unknown>;

  beforeAll(async () => {
    client = new PGlite();
    database = drizzle({ client, schema });
    const migrations = await loadMigrations();
    for (const migration of migrations) {
      await client.exec(migration);
    }

    bundleStorage = new Map<string, unknown>();
    const storyQueries = createStoryQueries(database);
    app = createApp({
      ...storyQueries,
      currentEngineMajor,
      readStoryPackage: async (packageUri: string) => {
        if (!bundleStorage.has(packageUri)) {
          throw new Error(`Package "${packageUri}" not found in test storage.`);
        }

        return bundleStorage.get(packageUri);
      },
      writePublishedStoryPackage: async ({ storyPackage, publishedAt, storyId }) => {
        const packageUri = `s3://plotpoint-stories/published/${storyId}/${publishedAt.toISOString()}.json`;
        bundleStorage.set(packageUri, storyPackage);
        return packageUri;
      },
      deletePublishedStoryPackage: async (packageUri: string) => {
        bundleStorage.delete(packageUri);
      },
    });
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    bundleStorage.clear();
    await database.delete(publishedStoryPackageVersionsTable);
    await database.delete(storiesTable);
  });

  it('creates a draft via api and reads it back', async () => {
    const draftPackageUri = 's3://plotpoint-stories/drafts/story-the-stolen-ledger/v1.json';
    bundleStorage.set(
      draftPackageUri,
      createValidStoryPackage('story-the-stolen-ledger', 'The Stolen Ledger'),
    );

    const createResponse = await app.request('/stories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: 'story-the-stolen-ledger',
        title: 'The Stolen Ledger',
        draftPackageUri,
      }),
    });

    expect(createResponse.status).toBe(201);
    await expect(createResponse.json()).resolves.toMatchObject({
      id: 'story-the-stolen-ledger',
      title: 'The Stolen Ledger',
      summary: null,
      status: 'draft',
      draftPackageUri,
      currentPublishedPackageVersionId: null,
      lastPublishedAt: null,
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
      draftPackageUri,
      currentPublishedPackageVersionId: null,
      lastPublishedAt: null,
    });
  });

  it('patches draft package uri via api and persists the change', async () => {
    const originalDraftPackageUri = 's3://plotpoint-stories/drafts/story-package-update/v1.json';
    const updatedDraftPackageUri = 's3://plotpoint-stories/drafts/story-package-update/v2.json';
    bundleStorage.set(
      originalDraftPackageUri,
      createValidStoryPackage('story-package-update', 'Package Update Story'),
    );
    bundleStorage.set(
      updatedDraftPackageUri,
      createValidStoryPackage('story-package-update', 'Package Update Story'),
    );

    await app.request('/stories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: 'story-package-update',
        title: 'Package Update Story',
        summary: 'Original summary',
        draftPackageUri: originalDraftPackageUri,
      }),
    });

    const patchResponse = await app.request('/stories/story-package-update', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        draftPackageUri: updatedDraftPackageUri,
      }),
    });

    expect(patchResponse.status).toBe(200);
    await expect(patchResponse.json()).resolves.toMatchObject({
      id: 'story-package-update',
      title: 'Package Update Story',
      summary: 'Original summary',
      draftPackageUri: updatedDraftPackageUri,
      status: 'draft',
      currentPublishedPackageVersionId: null,
      lastPublishedAt: null,
    });

    const listResponse = await app.request('/stories', {
      method: 'GET',
    });

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject([
      {
        id: 'story-package-update',
        draftPackageUri: updatedDraftPackageUri,
      },
    ]);
  });

  it('publishes and re-publishes a story and exposes catalog view', async () => {
    const storyId = 'story-publish-flow';
    const draftPackageUriV1 = `s3://plotpoint-stories/drafts/${storyId}/v1.json`;
    const draftPackageUriV2 = `s3://plotpoint-stories/drafts/${storyId}/v2.json`;

    bundleStorage.set(draftPackageUriV1, createValidStoryPackage(storyId, 'Publish Flow Story'));
    bundleStorage.set(
      draftPackageUriV2,
      createValidStoryPackage(storyId, 'Publish Flow Story (Updated Draft)'),
    );

    const createResponse = await app.request('/stories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: storyId,
        title: 'Publish Flow Story',
        draftPackageUri: draftPackageUriV1,
      }),
    });
    expect(createResponse.status).toBe(201);

    const firstPublish = await app.request(`/stories/${storyId}/publish`, {
      method: 'POST',
    });
    expect(firstPublish.status).toBe(201);
    const firstPublishBody = (await firstPublish.json()) as {
      engineMajor: number;
      publishedPackageUri: string;
      publishedAt: string;
      publishedStoryPackageVersionId: string;
      status: 'published';
      storyId: string;
    };
    expect(firstPublishBody).toMatchObject({
      storyId,
      status: 'published',
      engineMajor: currentEngineMajor,
      publishedStoryPackageVersionId: expect.any(String),
      publishedPackageUri: expect.stringContaining(`/published/${storyId}/`),
    });

    const patchResponse = await app.request(`/stories/${storyId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        draftPackageUri: draftPackageUriV2,
        title: 'Publish Flow Story (Updated Draft)',
      }),
    });
    expect(patchResponse.status).toBe(200);
    await expect(patchResponse.json()).resolves.toMatchObject({
      status: 'published',
      draftPackageUri: draftPackageUriV2,
    });

    const listPublishedBeforeRepublish = await app.request('/stories?view=published', {
      method: 'GET',
    });
    expect(listPublishedBeforeRepublish.status).toBe(200);
    await expect(listPublishedBeforeRepublish.json()).resolves.toMatchObject([
      {
        id: storyId,
        title: 'Publish Flow Story',
        status: 'published',
      },
    ]);

    const getPublishedBeforeRepublish = await app.request(`/stories/${storyId}?view=published`, {
      method: 'GET',
    });
    expect(getPublishedBeforeRepublish.status).toBe(200);
    await expect(getPublishedBeforeRepublish.json()).resolves.toMatchObject({
      id: storyId,
      title: 'Publish Flow Story',
      status: 'published',
    });

    const secondPublish = await app.request(`/stories/${storyId}/publish`, {
      method: 'POST',
    });
    expect(secondPublish.status).toBe(201);
    const secondPublishBody = (await secondPublish.json()) as {
      engineMajor: number;
      publishedPackageUri: string;
      publishedAt: string;
      publishedStoryPackageVersionId: string;
      status: 'published';
      storyId: string;
    };
    expect(secondPublishBody).toMatchObject({
      storyId,
      status: 'published',
      engineMajor: currentEngineMajor,
      publishedStoryPackageVersionId: expect.any(String),
      publishedPackageUri: expect.stringContaining(`/published/${storyId}/`),
    });
    expect(secondPublishBody.publishedStoryPackageVersionId).not.toBe(firstPublishBody.publishedStoryPackageVersionId);

    const listPublishedResponse = await app.request('/stories?view=published', {
      method: 'GET',
    });
    expect(listPublishedResponse.status).toBe(200);
    const listPublishedBody = await listPublishedResponse.json();
    expect(listPublishedBody).toMatchObject([
      {
        id: storyId,
        title: 'Publish Flow Story (Updated Draft)',
        status: 'published',
        publishedAt: expect.any(String),
      },
    ]);
    expect((listPublishedBody as Array<Record<string, unknown>>)[0]).not.toHaveProperty(
      'draftPackageUri',
    );

    const getPublishedResponse = await app.request(`/stories/${storyId}?view=published`, {
      method: 'GET',
    });
    expect(getPublishedResponse.status).toBe(200);
    await expect(getPublishedResponse.json()).resolves.toMatchObject({
      id: storyId,
      status: 'published',
      publishedAt: expect.any(String),
    });
  });

  it('rejects publish when draft package metadata storyId differs from route story id', async () => {
    const storyId = 'story-publish-mismatch';
    const draftPackageUri = `s3://plotpoint-stories/drafts/${storyId}/v1.json`;
    bundleStorage.set(draftPackageUri, createValidStoryPackage('story-other', 'Other Story Package'));

    const createResponse = await app.request('/stories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: storyId,
        title: 'Publish Mismatch Story',
        draftPackageUri,
      }),
    });
    expect(createResponse.status).toBe(201);

    const publishResponse = await app.request(`/stories/${storyId}/publish`, {
      method: 'POST',
    });
    expect(publishResponse.status).toBe(422);
    await expect(publishResponse.json()).resolves.toMatchObject({
      error: {
        code: 'publish_validation_failed',
        issues: [
          {
            code: 'story-id-mismatch',
            layer: 'structure',
            path: ['metadata', 'storyId'],
          },
        ],
        storyId,
      },
    });

    const getDraftResponse = await app.request(`/stories/${storyId}`, {
      method: 'GET',
    });
    expect(getDraftResponse.status).toBe(200);
    await expect(getDraftResponse.json()).resolves.toMatchObject({
      id: storyId,
      status: 'draft',
      currentPublishedPackageVersionId: null,
      lastPublishedAt: null,
    });
  });
});
