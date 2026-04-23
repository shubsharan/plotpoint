import { PGlite } from '@electric-sql/pglite';
import type { StoryPackage } from '@plotpoint/engine';
import { and, eq } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  StoryRunPersistenceError,
  assembleSessionStateFromRunResumeEnvelope,
  createStoryPackageRepo,
  createStoryQueries,
  createStoryRunQueries,
  publishedStoryPackageVersions,
  roleRunStates,
  runInvites,
  runParticipantBindings,
  runRoleSlots,
  stories,
  storyRunSharedState,
  storyRuns,
  type StoryQueries,
  type StoryRunQueries,
} from '../index.js';

const schema = {
  stories,
  publishedStoryPackageVersions,
  storyRuns,
  runRoleSlots,
  runInvites,
  runParticipantBindings,
  storyRunSharedState,
  roleRunStates,
} as const;
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = join(currentDirectory, '../../supabase/migrations');

type TestDatabase = PgliteDatabase<typeof schema>;

const createStoryPackage = (input: {
  entryNodeId?: string;
  roleIds: string[];
  storyId: string;
  title: string;
}): StoryPackage => {
  const entryNodeId = input.entryNodeId ?? 'foyer';

  return {
    metadata: {
      storyId: input.storyId,
      title: input.title,
      summary: `${input.title} summary`,
    },
    roles: input.roleIds.map((roleId) => ({
      id: roleId,
      title: roleId,
    })),
    graph: {
      entryNodeId,
      nodes: [
        {
          id: entryNodeId,
          title: 'Entry',
          blocks: [
            {
              id: `${entryNodeId}-briefing`,
              type: 'text',
              config: {
                document: {
                  children: [
                    {
                      children: [
                        {
                          text: 'Briefing',
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
      engineMajor: 1,
    },
  };
};

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

const TEST_TIMEOUT_MS = 30_000;

describe('@plotpoint/db story runs', () => {
  let client: PGlite;
  let database: TestDatabase;
  let storyQueries: StoryQueries;
  let storyRunQueries: StoryRunQueries;
  let packageStorage: Map<string, unknown>;

  const publishStoryVersion = async (input: {
    draftPackageUri: string;
    publishedAt: Date;
    publishedPackageUri: string;
    publishedStoryPackageVersionId: string;
    roleIds: string[];
    storyId: string;
    title: string;
  }): Promise<void> => {
    const story = await storyQueries.getStory(input.storyId);
    if (!story) {
      await storyQueries.createStory({
        draftPackageUri: input.draftPackageUri,
        id: input.storyId,
        summary: `${input.title} summary`,
        title: input.title,
      });
    } else {
      await storyQueries.patchStory({
        draftPackageUri: input.draftPackageUri,
        id: input.storyId,
      });
    }

    packageStorage.set(
      input.publishedPackageUri,
      createStoryPackage({
        roleIds: input.roleIds,
        storyId: input.storyId,
        title: input.title,
      }),
    );

    await storyQueries.publishStory({
      engineMajor: 1,
      publishedAt: input.publishedAt,
      publishedPackageUri: input.publishedPackageUri,
      publishedStoryPackageVersionId: input.publishedStoryPackageVersionId,
      storyId: input.storyId,
      summary: `${input.title} summary`,
      title: input.title,
    });
  };

  beforeAll(async () => {
    client = new PGlite();
    database = drizzle({ client, schema });
    const migrations = await loadMigrations();

    for (const migration of migrations) {
      await client.exec(migration);
    }

    packageStorage = new Map<string, unknown>();
    storyQueries = createStoryQueries(database);
    const storyPackageRepo = createStoryPackageRepo({
      readPackage: async (packageUri: string) => {
        if (!packageStorage.has(packageUri)) {
          throw new Error(`Missing package "${packageUri}".`);
        }

        return packageStorage.get(packageUri);
      },
      storyQueries,
    });
    storyRunQueries = createStoryRunQueries(database, {
      storyPackageRepo,
    });
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    packageStorage.clear();

    await database.delete(roleRunStates);
    await database.delete(storyRunSharedState);
    await database.delete(runParticipantBindings);
    await database.delete(runInvites);
    await database.delete(runRoleSlots);
    await database.delete(storyRuns);
    await database.delete(publishedStoryPackageVersions);
    await database.delete(stories);
  }, TEST_TIMEOUT_MS);

  it('createRun auto-binds host for one-role stories and leaves run in lobby', async () => {
    await publishStoryVersion({
      draftPackageUri: 's3://plotpoint-stories/drafts/story-one-role/v1.json',
      publishedAt: new Date('2026-04-22T17:00:00.000Z'),
      publishedPackageUri: 's3://plotpoint-stories/published/story-one-role/v1.json',
      publishedStoryPackageVersionId: 'snapshot-v1',
      roleIds: ['host'],
      storyId: 'story-one-role',
      title: 'One Role',
    });

    const created = await storyRunQueries.createRun({
      adminParticipantId: 'participant-admin',
      now: new Date('2026-04-22T18:00:00.000Z'),
      runId: 'run-one-role',
      storyId: 'story-one-role',
    });

    expect(created.run.status).toBe('lobby');
    expect(created.run.storyPackageVersionId).toBeNull();
    expect(created.roleSlots).toEqual([
      expect.objectContaining({
        roleId: 'host',
        runId: 'run-one-role',
        status: 'assigned',
      }),
    ]);
    expect(created.hostBinding).toMatchObject({
      participantId: 'participant-admin',
      roleId: 'host',
      runId: 'run-one-role',
      status: 'bound',
    });
  }, TEST_TIMEOUT_MS);

  it('enforces composite role-slot foreign keys for invites and role run states', async () => {
    await publishStoryVersion({
      draftPackageUri: 's3://plotpoint-stories/drafts/story-fk/v1.json',
      publishedAt: new Date('2026-04-22T17:00:00.000Z'),
      publishedPackageUri: 's3://plotpoint-stories/published/story-fk/v1.json',
      publishedStoryPackageVersionId: 'snapshot-v1',
      roleIds: ['detective'],
      storyId: 'story-fk',
      title: 'FK Story',
    });

    await storyRunQueries.createRun({
      adminParticipantId: 'participant-admin',
      runId: 'run-fk',
      storyId: 'story-fk',
    });

    await expect(
      database.insert(runInvites).values({
        inviteId: 'invite-invalid',
        runId: 'run-fk',
        roleId: 'missing-role',
        participantId: 'participant-a',
        status: 'pending',
        createdAt: new Date('2026-04-22T19:00:00.000Z'),
        acceptedAt: null,
      }),
    ).rejects.toThrow();

    await expect(
      database.insert(roleRunStates).values({
        runId: 'run-fk',
        roleId: 'missing-role',
        currentNodeId: 'foyer',
        blockStates: {},
        acceptedSharedRevision: 0,
        updatedAt: new Date('2026-04-22T19:00:00.000Z'),
      }),
    ).rejects.toThrow();
  }, TEST_TIMEOUT_MS);

  it('createRun leaves multi-role slots unbound and fails closed for unpublished stories', async () => {
    await publishStoryVersion({
      draftPackageUri: 's3://plotpoint-stories/drafts/story-multi-role/v1.json',
      publishedAt: new Date('2026-04-22T17:00:00.000Z'),
      publishedPackageUri: 's3://plotpoint-stories/published/story-multi-role/v1.json',
      publishedStoryPackageVersionId: 'snapshot-v1',
      roleIds: ['detective', 'historian'],
      storyId: 'story-multi-role',
      title: 'Multi Role',
    });

    const created = await storyRunQueries.createRun({
      adminParticipantId: 'participant-admin',
      runId: 'run-multi-role',
      storyId: 'story-multi-role',
    });

    expect(created.hostBinding).toBeNull();
    expect(created.roleSlots).toHaveLength(2);
    for (const roleSlot of created.roleSlots) {
      expect(roleSlot.status).toBe('pending');
    }

    await storyQueries.createStory({
      draftPackageUri: 's3://plotpoint-stories/drafts/story-unpublished/v1.json',
      id: 'story-unpublished',
      title: 'Unpublished Story',
    });

    await expect(
      storyRunQueries.createRun({
        adminParticipantId: 'participant-admin',
        runId: 'run-unpublished',
        storyId: 'story-unpublished',
      }),
    ).rejects.toMatchObject({
      code: 'story_run_missing_published_package',
    } satisfies Partial<StoryRunPersistenceError>);
  }, TEST_TIMEOUT_MS);

  it('enforces pending-invite uniqueness and accepts invites atomically into bindings', async () => {
    await publishStoryVersion({
      draftPackageUri: 's3://plotpoint-stories/drafts/story-invites/v1.json',
      publishedAt: new Date('2026-04-22T17:00:00.000Z'),
      publishedPackageUri: 's3://plotpoint-stories/published/story-invites/v1.json',
      publishedStoryPackageVersionId: 'snapshot-v1',
      roleIds: ['detective', 'historian'],
      storyId: 'story-invites',
      title: 'Invite Story',
    });

    await storyRunQueries.createRun({
      adminParticipantId: 'participant-admin',
      runId: 'run-invites',
      storyId: 'story-invites',
    });

    const invite = await storyRunQueries.inviteParticipantToRole({
      inviteId: 'invite-detective',
      participantId: 'participant-a',
      roleId: 'detective',
      runId: 'run-invites',
    });

    expect(invite.status).toBe('pending');

    await expect(
      storyRunQueries.inviteParticipantToRole({
        participantId: 'participant-b',
        roleId: 'detective',
        runId: 'run-invites',
      }),
    ).rejects.toMatchObject({
      code: 'story_run_pending_invite_conflict',
    } satisfies Partial<StoryRunPersistenceError>);

    await expect(
      storyRunQueries.inviteParticipantToRole({
        participantId: 'participant-a',
        roleId: 'historian',
        runId: 'run-invites',
      }),
    ).rejects.toMatchObject({
      code: 'story_run_pending_invite_conflict',
    } satisfies Partial<StoryRunPersistenceError>);

    const accepted = await storyRunQueries.acceptInvite({
      inviteId: 'invite-detective',
      participantId: 'participant-a',
      runId: 'run-invites',
    });
    expect(accepted).not.toBeNull();
    expect(accepted?.invite).toMatchObject({
      inviteId: 'invite-detective',
      status: 'accepted',
    });
    expect(accepted?.binding).toMatchObject({
      participantId: 'participant-a',
      roleId: 'detective',
      runId: 'run-invites',
      sourceInviteId: 'invite-detective',
      status: 'bound',
    });
  }, TEST_TIMEOUT_MS);

  it('replaces lobby bindings by deleting prior rows and blocks replacement when slot has pending invite', async () => {
    await publishStoryVersion({
      draftPackageUri: 's3://plotpoint-stories/drafts/story-lobby/v1.json',
      publishedAt: new Date('2026-04-22T17:00:00.000Z'),
      publishedPackageUri: 's3://plotpoint-stories/published/story-lobby/v1.json',
      publishedStoryPackageVersionId: 'snapshot-v1',
      roleIds: ['detective', 'historian'],
      storyId: 'story-lobby',
      title: 'Lobby Story',
    });

    await storyRunQueries.createRun({
      adminParticipantId: 'participant-admin',
      runId: 'run-lobby',
      storyId: 'story-lobby',
    });

    await storyRunQueries.assignSelfToRole({
      participantId: 'participant-admin',
      roleId: 'detective',
      runId: 'run-lobby',
    });

    const replaced = await storyRunQueries.replaceLobbyBinding({
      participantId: 'participant-new',
      roleId: 'detective',
      runId: 'run-lobby',
    });
    expect(replaced).toMatchObject({
      participantId: 'participant-new',
      roleId: 'detective',
      runId: 'run-lobby',
      status: 'bound',
    });

    const detectiveBindings = await database
      .select()
      .from(runParticipantBindings)
      .where(
        and(
          eq(runParticipantBindings.runId, 'run-lobby'),
          eq(runParticipantBindings.roleId, 'detective'),
        ),
      );
    expect(detectiveBindings).toHaveLength(1);
    expect(detectiveBindings[0]?.participantId).toBe('participant-new');

    await storyRunQueries.inviteParticipantToRole({
      participantId: 'participant-pending',
      roleId: 'historian',
      runId: 'run-lobby',
    });

    await expect(
      storyRunQueries.replaceLobbyBinding({
        participantId: 'participant-other',
        roleId: 'historian',
        runId: 'run-lobby',
      }),
    ).rejects.toMatchObject({
      code: 'story_run_pending_invite_conflict',
    } satisfies Partial<StoryRunPersistenceError>);
  }, TEST_TIMEOUT_MS);

  it('startRun fails on incomplete assignments, then seeds revision baselines and entry-node state', async () => {
    await publishStoryVersion({
      draftPackageUri: 's3://plotpoint-stories/drafts/story-start/v1.json',
      publishedAt: new Date('2026-04-22T17:00:00.000Z'),
      publishedPackageUri: 's3://plotpoint-stories/published/story-start/v1.json',
      publishedStoryPackageVersionId: 'snapshot-v1',
      roleIds: ['detective', 'historian'],
      storyId: 'story-start',
      title: 'Start Story',
    });

    await storyRunQueries.createRun({
      adminParticipantId: 'participant-admin',
      runId: 'run-start',
      storyId: 'story-start',
    });

    await storyRunQueries.assignSelfToRole({
      participantId: 'participant-admin',
      roleId: 'detective',
      runId: 'run-start',
    });

    await expect(
      storyRunQueries.startRun({
        participantId: 'participant-admin',
        runId: 'run-start',
      }),
    ).rejects.toMatchObject({
      code: 'story_run_incomplete_assignment_at_start',
    } satisfies Partial<StoryRunPersistenceError>);

    await storyRunQueries.assignSelfToRole({
      participantId: 'participant-b',
      roleId: 'historian',
      runId: 'run-start',
    });

    const startEnvelope = await storyRunQueries.startRun({
      participantId: 'participant-admin',
      runId: 'run-start',
    });

    expect(startEnvelope.run.status).toBe('active');
    expect(startEnvelope.run.storyPackageVersionId).toBe('snapshot-v1');
    expect(startEnvelope.roleState.currentNodeId).toBe('foyer');

    const [sharedState] = await database
      .select()
      .from(storyRunSharedState)
      .where(eq(storyRunSharedState.runId, 'run-start'))
      .limit(1);
    expect(sharedState).toMatchObject({
      revision: 0,
      runId: 'run-start',
    });

    const seededRoleStates = await database
      .select()
      .from(roleRunStates)
      .where(eq(roleRunStates.runId, 'run-start'));
    expect(seededRoleStates).toHaveLength(2);
    for (const roleState of seededRoleStates) {
      expect(roleState.acceptedSharedRevision).toBe(0);
      expect(roleState.currentNodeId).toBe('foyer');
    }
  }, TEST_TIMEOUT_MS);

  it('rejects lobby-only mutations once a run is active with consistent status error details', async () => {
    await publishStoryVersion({
      draftPackageUri: 's3://plotpoint-stories/drafts/story-lifecycle-gates/v1.json',
      publishedAt: new Date('2026-04-22T17:00:00.000Z'),
      publishedPackageUri: 's3://plotpoint-stories/published/story-lifecycle-gates/v1.json',
      publishedStoryPackageVersionId: 'snapshot-v1',
      roleIds: ['detective', 'historian'],
      storyId: 'story-lifecycle-gates',
      title: 'Lifecycle Gates Story',
    });

    await storyRunQueries.createRun({
      adminParticipantId: 'participant-admin',
      runId: 'run-lifecycle-gates',
      storyId: 'story-lifecycle-gates',
    });
    await storyRunQueries.assignSelfToRole({
      participantId: 'participant-a',
      roleId: 'detective',
      runId: 'run-lifecycle-gates',
    });
    await storyRunQueries.assignSelfToRole({
      participantId: 'participant-b',
      roleId: 'historian',
      runId: 'run-lifecycle-gates',
    });
    await storyRunQueries.startRun({
      participantId: 'participant-a',
      runId: 'run-lifecycle-gates',
    });

    await database.insert(runInvites).values({
      inviteId: 'invite-active-run',
      runId: 'run-lifecycle-gates',
      roleId: 'detective',
      participantId: 'participant-c',
      status: 'pending',
      createdAt: new Date('2026-04-22T17:30:00.000Z'),
      acceptedAt: null,
    });

    await expect(
      storyRunQueries.inviteParticipantToRole({
        participantId: 'participant-c',
        roleId: 'detective',
        runId: 'run-lifecycle-gates',
      }),
    ).rejects.toMatchObject({
      code: 'story_run_invalid_status_for_operation',
      details: {
        actualStatus: 'active',
        expectedStatus: 'lobby',
        operation: 'inviteParticipantToRole',
        runId: 'run-lifecycle-gates',
      },
    } satisfies Partial<StoryRunPersistenceError>);

    await expect(
      storyRunQueries.assignSelfToRole({
        participantId: 'participant-c',
        roleId: 'detective',
        runId: 'run-lifecycle-gates',
      }),
    ).rejects.toMatchObject({
      code: 'story_run_invalid_status_for_operation',
      details: {
        actualStatus: 'active',
        expectedStatus: 'lobby',
        operation: 'assignSelfToRole',
        runId: 'run-lifecycle-gates',
      },
    } satisfies Partial<StoryRunPersistenceError>);

    await expect(
      storyRunQueries.acceptInvite({
        inviteId: 'invite-active-run',
        runId: 'run-lifecycle-gates',
      }),
    ).rejects.toMatchObject({
      code: 'story_run_invalid_status_for_operation',
      details: {
        actualStatus: 'active',
        expectedStatus: 'lobby',
        operation: 'acceptInvite',
        runId: 'run-lifecycle-gates',
      },
    } satisfies Partial<StoryRunPersistenceError>);

    await expect(
      storyRunQueries.cancelInvite({
        inviteId: 'invite-active-run',
        runId: 'run-lifecycle-gates',
      }),
    ).rejects.toMatchObject({
      code: 'story_run_invalid_status_for_operation',
      details: {
        actualStatus: 'active',
        expectedStatus: 'lobby',
        operation: 'cancelInvite',
        runId: 'run-lifecycle-gates',
      },
    } satisfies Partial<StoryRunPersistenceError>);
  }, TEST_TIMEOUT_MS);

  it('rejects startRun re-entry and preserves pinned package and startedAt', async () => {
    await publishStoryVersion({
      draftPackageUri: 's3://plotpoint-stories/drafts/story-start-reentry/v1.json',
      publishedAt: new Date('2026-04-22T17:00:00.000Z'),
      publishedPackageUri: 's3://plotpoint-stories/published/story-start-reentry/v1.json',
      publishedStoryPackageVersionId: 'snapshot-v1',
      roleIds: ['detective', 'historian'],
      storyId: 'story-start-reentry',
      title: 'Start Reentry Story V1',
    });

    await storyRunQueries.createRun({
      adminParticipantId: 'participant-admin',
      runId: 'run-start-reentry',
      storyId: 'story-start-reentry',
    });
    await storyRunQueries.assignSelfToRole({
      participantId: 'participant-a',
      roleId: 'detective',
      runId: 'run-start-reentry',
    });
    await storyRunQueries.assignSelfToRole({
      participantId: 'participant-b',
      roleId: 'historian',
      runId: 'run-start-reentry',
    });

    const firstStartAt = new Date('2026-04-22T17:45:00.000Z');
    await storyRunQueries.startRun({
      now: firstStartAt,
      participantId: 'participant-a',
      runId: 'run-start-reentry',
    });

    await publishStoryVersion({
      draftPackageUri: 's3://plotpoint-stories/drafts/story-start-reentry/v2.json',
      publishedAt: new Date('2026-04-22T18:00:00.000Z'),
      publishedPackageUri: 's3://plotpoint-stories/published/story-start-reentry/v2.json',
      publishedStoryPackageVersionId: 'snapshot-v2',
      roleIds: ['detective', 'historian'],
      storyId: 'story-start-reentry',
      title: 'Start Reentry Story V2',
    });

    await expect(
      storyRunQueries.startRun({
        now: new Date('2026-04-22T19:00:00.000Z'),
        participantId: 'participant-a',
        runId: 'run-start-reentry',
      }),
    ).rejects.toMatchObject({
      code: 'story_run_invalid_status_for_operation',
      details: {
        actualStatus: 'active',
        expectedStatus: 'lobby',
        operation: 'startRun',
        runId: 'run-start-reentry',
      },
    } satisfies Partial<StoryRunPersistenceError>);

    const [run] = await database
      .select()
      .from(storyRuns)
      .where(eq(storyRuns.runId, 'run-start-reentry'))
      .limit(1);
    expect(run).toBeDefined();
    expect(run?.storyPackageVersionId).toBe('snapshot-v1');
    expect(run?.startedAt?.toISOString()).toBe(firstStartAt.toISOString());
  }, TEST_TIMEOUT_MS);

  it('fails closed on role-slot drift between createRun and startRun', async () => {
    await publishStoryVersion({
      draftPackageUri: 's3://plotpoint-stories/drafts/story-drift/v1.json',
      publishedAt: new Date('2026-04-22T17:00:00.000Z'),
      publishedPackageUri: 's3://plotpoint-stories/published/story-drift/v1.json',
      publishedStoryPackageVersionId: 'snapshot-v1',
      roleIds: ['detective', 'historian'],
      storyId: 'story-drift',
      title: 'Drift Story',
    });

    await storyRunQueries.createRun({
      adminParticipantId: 'participant-admin',
      runId: 'run-drift',
      storyId: 'story-drift',
    });
    await storyRunQueries.assignSelfToRole({
      participantId: 'participant-admin',
      roleId: 'detective',
      runId: 'run-drift',
    });
    await storyRunQueries.assignSelfToRole({
      participantId: 'participant-b',
      roleId: 'historian',
      runId: 'run-drift',
    });

    await publishStoryVersion({
      draftPackageUri: 's3://plotpoint-stories/drafts/story-drift/v2.json',
      publishedAt: new Date('2026-04-22T18:00:00.000Z'),
      publishedPackageUri: 's3://plotpoint-stories/published/story-drift/v2.json',
      publishedStoryPackageVersionId: 'snapshot-v2',
      roleIds: ['detective', 'historian', 'forger'],
      storyId: 'story-drift',
      title: 'Drift Story V2',
    });

    await expect(
      storyRunQueries.startRun({
        participantId: 'participant-admin',
        runId: 'run-drift',
      }),
    ).rejects.toMatchObject({
      code: 'story_run_role_slot_drift',
    } satisfies Partial<StoryRunPersistenceError>);
  }, TEST_TIMEOUT_MS);

  it('keeps post-start replacement append-only and marks previous binding as replaced', async () => {
    await publishStoryVersion({
      draftPackageUri: 's3://plotpoint-stories/drafts/story-replace/v1.json',
      publishedAt: new Date('2026-04-22T17:00:00.000Z'),
      publishedPackageUri: 's3://plotpoint-stories/published/story-replace/v1.json',
      publishedStoryPackageVersionId: 'snapshot-v1',
      roleIds: ['detective', 'historian'],
      storyId: 'story-replace',
      title: 'Replace Story',
    });

    await storyRunQueries.createRun({
      adminParticipantId: 'participant-admin',
      runId: 'run-replace',
      storyId: 'story-replace',
    });
    await storyRunQueries.assignSelfToRole({
      participantId: 'participant-a',
      roleId: 'detective',
      runId: 'run-replace',
    });
    await storyRunQueries.assignSelfToRole({
      participantId: 'participant-b',
      roleId: 'historian',
      runId: 'run-replace',
    });
    await storyRunQueries.startRun({
      participantId: 'participant-a',
      runId: 'run-replace',
    });

    const replacement = await storyRunQueries.replaceActiveBinding({
      participantId: 'participant-c',
      roleId: 'detective',
      runId: 'run-replace',
    });

    expect(replacement.replacedBinding.status).toBe('replaced');
    expect(replacement.currentBinding.status).toBe('bound');
    expect(replacement.currentBinding.participantId).toBe('participant-c');

    const detectiveBindings = await database
      .select()
      .from(runParticipantBindings)
      .where(
        and(
          eq(runParticipantBindings.runId, 'run-replace'),
          eq(runParticipantBindings.roleId, 'detective'),
        ),
      );
    expect(detectiveBindings).toHaveLength(2);
    expect(detectiveBindings.some((binding) => binding.status === 'replaced')).toBe(true);
    expect(detectiveBindings.some((binding) => binding.status === 'bound')).toBe(true);
  }, TEST_TIMEOUT_MS);

  it('reconstructs deterministic SessionState from pinned resume envelope after newer publishes', async () => {
    await publishStoryVersion({
      draftPackageUri: 's3://plotpoint-stories/drafts/story-pinned/v1.json',
      publishedAt: new Date('2026-04-22T17:00:00.000Z'),
      publishedPackageUri: 's3://plotpoint-stories/published/story-pinned/v1.json',
      publishedStoryPackageVersionId: 'snapshot-v1',
      roleIds: ['detective', 'historian'],
      storyId: 'story-pinned',
      title: 'Pinned Story V1',
    });

    await storyRunQueries.createRun({
      adminParticipantId: 'participant-admin',
      runId: 'run-pinned',
      storyId: 'story-pinned',
    });
    await storyRunQueries.assignSelfToRole({
      participantId: 'participant-a',
      roleId: 'detective',
      runId: 'run-pinned',
    });
    await storyRunQueries.assignSelfToRole({
      participantId: 'participant-b',
      roleId: 'historian',
      runId: 'run-pinned',
    });
    await storyRunQueries.startRun({
      participantId: 'participant-a',
      runId: 'run-pinned',
    });

    await publishStoryVersion({
      draftPackageUri: 's3://plotpoint-stories/drafts/story-pinned/v2.json',
      publishedAt: new Date('2026-04-22T18:00:00.000Z'),
      publishedPackageUri: 's3://plotpoint-stories/published/story-pinned/v2.json',
      publishedStoryPackageVersionId: 'snapshot-v2',
      roleIds: ['detective', 'historian'],
      storyId: 'story-pinned',
      title: 'Pinned Story V2',
    });

    const resumeEnvelope = await storyRunQueries.getRunResumeEnvelope({
      participantId: 'participant-a',
      runId: 'run-pinned',
    });
    expect(resumeEnvelope.run.storyPackageVersionId).toBe('snapshot-v1');

    const assembledA = assembleSessionStateFromRunResumeEnvelope(resumeEnvelope);
    const assembledB = assembleSessionStateFromRunResumeEnvelope(resumeEnvelope);
    expect(assembledA).toEqual(assembledB);
    expect(assembledA).toMatchObject({
      currentNodeId: 'foyer',
      playerId: 'participant-a',
      roleId: 'detective',
      sessionId: 'run-pinned',
      storyId: 'story-pinned',
      storyPackageVersionId: 'snapshot-v1',
    });
  }, TEST_TIMEOUT_MS);

  it('fails resume when the pinned package cannot be loaded', async () => {
    await publishStoryVersion({
      draftPackageUri: 's3://plotpoint-stories/drafts/story-missing-pinned/v1.json',
      publishedAt: new Date('2026-04-22T17:00:00.000Z'),
      publishedPackageUri: 's3://plotpoint-stories/published/story-missing-pinned/v1.json',
      publishedStoryPackageVersionId: 'snapshot-v1',
      roleIds: ['detective'],
      storyId: 'story-missing-pinned',
      title: 'Pinned Missing Story',
    });

    await storyRunQueries.createRun({
      adminParticipantId: 'participant-admin',
      runId: 'run-missing-pinned',
      storyId: 'story-missing-pinned',
    });
    await storyRunQueries.startRun({
      participantId: 'participant-admin',
      runId: 'run-missing-pinned',
    });

    packageStorage.delete('s3://plotpoint-stories/published/story-missing-pinned/v1.json');

    await expect(
      storyRunQueries.getRunResumeEnvelope({
        participantId: 'participant-admin',
        runId: 'run-missing-pinned',
      }),
    ).rejects.toMatchObject({
      code: 'story_run_pinned_package_load_failed',
    } satisfies Partial<StoryRunPersistenceError>);
  }, TEST_TIMEOUT_MS);
});
