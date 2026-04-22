import { randomUUID } from 'node:crypto';
import type { StoryPackage, StoryPackageRepo } from '@plotpoint/engine';
import { and, eq } from 'drizzle-orm';
import type { PgAsyncDatabase } from 'drizzle-orm/pg-core/async/db';
import { publishedStoryPackageVersions } from '../schema/stories.js';
import {
  roleRunStates,
  runInvites,
  runParticipantBindings,
  runRoleSlots,
  storyRunSharedState,
  storyRuns,
  type RoleRunStateRecord,
  type RunInviteRecord,
  type RunParticipantBindingRecord,
  type RunRoleSlotRecord,
  type StoryRunRecord,
  type StoryRunSharedStateRecord,
} from '../schema/story-runs.js';
import { StoryRunPersistenceError } from '../story-runs/errors.js';
import type { RunResumeEnvelope } from '../story-runs/types.js';

type StoryRunDatabase = PgAsyncDatabase<any, any, any>;
type StoryRunTransaction = Parameters<Parameters<StoryRunDatabase['transaction']>[0]>[0];
type StoryRunReadExecutor = {
  select: StoryRunDatabase['select'];
};

export type CreateStoryRunQueriesDeps = {
  storyPackageRepo: StoryPackageRepo;
};

export type CreateRunInput = {
  adminParticipantId: string;
  now?: Date | undefined;
  runId: string;
  storyId: string;
};

export type CreateRunResult = {
  hostBinding: RunParticipantBindingRecord | null;
  roleSlots: RunRoleSlotRecord[];
  run: StoryRunRecord;
};

export type InviteParticipantToRoleInput = {
  inviteId?: string | undefined;
  now?: Date | undefined;
  participantId: string;
  roleId: string;
  runId: string;
};

export type CancelInviteInput = {
  inviteId: string;
  now?: Date | undefined;
  runId: string;
};

export type AcceptInviteInput = {
  inviteId: string;
  now?: Date | undefined;
  participantId?: string | undefined;
  runId: string;
};

export type AcceptInviteResult = {
  binding: RunParticipantBindingRecord;
  invite: RunInviteRecord;
};

export type AssignSelfToRoleInput = {
  bindingId?: string | undefined;
  now?: Date | undefined;
  participantId: string;
  roleId: string;
  runId: string;
};

export type ReplaceLobbyBindingInput = {
  bindingId?: string | undefined;
  now?: Date | undefined;
  participantId: string;
  roleId: string;
  runId: string;
};

export type StartRunInput = {
  now?: Date | undefined;
  participantId: string;
  runId: string;
};

export type ReplaceActiveBindingInput = {
  bindingId?: string | undefined;
  now?: Date | undefined;
  participantId: string;
  roleId: string;
  runId: string;
  sourceInviteId?: string | null | undefined;
};

export type ReplaceActiveBindingResult = {
  currentBinding: RunParticipantBindingRecord;
  replacedBinding: RunParticipantBindingRecord;
};

export type GetRunResumeEnvelopeInput = {
  participantId: string;
  runId: string;
};

export type StoryRunQueries = {
  acceptInvite: (input: AcceptInviteInput) => Promise<AcceptInviteResult | null>;
  assignSelfToRole: (input: AssignSelfToRoleInput) => Promise<RunParticipantBindingRecord>;
  cancelInvite: (input: CancelInviteInput) => Promise<RunInviteRecord | null>;
  createRun: (input: CreateRunInput) => Promise<CreateRunResult>;
  getRunResumeEnvelope: (input: GetRunResumeEnvelopeInput) => Promise<RunResumeEnvelope>;
  inviteParticipantToRole: (input: InviteParticipantToRoleInput) => Promise<RunInviteRecord>;
  replaceActiveBinding: (
    input: ReplaceActiveBindingInput,
  ) => Promise<ReplaceActiveBindingResult>;
  replaceLobbyBinding: (input: ReplaceLobbyBindingInput) => Promise<RunParticipantBindingRecord>;
  startRun: (input: StartRunInput) => Promise<RunResumeEnvelope>;
};

const getPostgresError = (
  error: unknown,
): {
  code: string;
  constraint?: string | undefined;
} | null => {
  const parse = (
    candidate: unknown,
  ): {
    code: string;
    constraint?: string | undefined;
  } | null => {
    if (typeof candidate !== 'object' || candidate === null) {
      return null;
    }

    const postgresError = candidate as {
      code?: unknown;
      constraint?: unknown;
    };
    if (typeof postgresError.code !== 'string') {
      return null;
    }

    return {
      code: postgresError.code,
      ...(typeof postgresError.constraint === 'string'
        ? { constraint: postgresError.constraint }
        : {}),
    };
  };

  return parse(error) ?? parse((error as { cause?: unknown }).cause);
};

const mapPendingInviteConflictIfPresent = (
  error: unknown,
  input: {
    participantId?: string | undefined;
    roleId?: string | undefined;
    runId: string;
  },
): StoryRunPersistenceError | null => {
  const postgresError = getPostgresError(error);
  if (postgresError?.code !== '23505') {
    return null;
  }

  if (
    postgresError.constraint !== 'run_invites_one_pending_per_participant_idx' &&
    postgresError.constraint !== 'run_invites_one_pending_per_slot_idx'
  ) {
    return null;
  }

  return new StoryRunPersistenceError(
    'story_run_pending_invite_conflict',
    `Pending invite conflict for run "${input.runId}".`,
    {
      cause: error,
      details: {
        participantId: input.participantId,
        roleId: input.roleId,
        runId: input.runId,
      },
    },
  );
};

const mapActiveBindingConflictIfPresent = (
  error: unknown,
  input: {
    participantId?: string | undefined;
    roleId?: string | undefined;
    runId: string;
  },
): StoryRunPersistenceError | null => {
  const postgresError = getPostgresError(error);
  if (postgresError?.code !== '23505') {
    return null;
  }

  if (
    postgresError.constraint !== 'run_bindings_one_active_per_participant_idx' &&
    postgresError.constraint !== 'run_bindings_one_active_per_slot_idx'
  ) {
    return null;
  }

  return new StoryRunPersistenceError(
    'story_run_active_binding_conflict',
    `Active binding conflict for run "${input.runId}".`,
    {
      cause: error,
      details: {
        participantId: input.participantId,
        roleId: input.roleId,
        runId: input.runId,
      },
    },
  );
};

const loadCurrentPublishedStoryPackageOrThrow = async (
  storyPackageRepo: StoryPackageRepo,
  storyId: string,
): Promise<{
  storyPackage: StoryPackage;
  storyPackageVersionId: string;
}> => {
  try {
    return await storyPackageRepo.getCurrentPublishedPackage(storyId);
  } catch (error) {
    throw new StoryRunPersistenceError(
      'story_run_missing_published_package',
      `No current published package is available for story "${storyId}".`,
      {
        cause: error,
        details: {
          storyId,
        },
      },
    );
  }
};

const loadPinnedStoryPackageOrThrow = async (
  storyPackageRepo: StoryPackageRepo,
  storyId: string,
  storyPackageVersionId: string,
): Promise<StoryPackage> => {
  try {
    return await storyPackageRepo.getPublishedPackage(storyId, storyPackageVersionId);
  } catch (error) {
    throw new StoryRunPersistenceError(
      'story_run_pinned_package_load_failed',
      `Pinned story package "${storyPackageVersionId}" for story "${storyId}" could not be loaded.`,
      {
        cause: error,
        details: {
          storyId,
          storyPackageVersionId,
        },
      },
    );
  }
};

const readRunOrThrow = async (
  executor: StoryRunReadExecutor,
  runId: string,
): Promise<StoryRunRecord> => {
  const [run] = await executor
    .select()
    .from(storyRuns)
    .where(eq(storyRuns.runId, runId))
    .limit(1);

  if (!run) {
    throw new StoryRunPersistenceError(
      'story_run_run_not_found',
      `Story run "${runId}" was not found.`,
      {
        details: {
          runId,
        },
      },
    );
  }

  return run;
};

const readPendingInviteForSlot = async (
  transaction: StoryRunTransaction,
  runId: string,
  roleId: string,
): Promise<RunInviteRecord | null> => {
  const [invite] = await transaction
    .select()
    .from(runInvites)
    .where(
      and(
        eq(runInvites.runId, runId),
        eq(runInvites.roleId, roleId),
        eq(runInvites.status, 'pending'),
      ),
    )
    .limit(1);

  return invite ?? null;
};

const assertNoPendingInviteForSlotOrThrow = async (
  transaction: StoryRunTransaction,
  runId: string,
  roleId: string,
): Promise<void> => {
  const pendingInvite = await readPendingInviteForSlot(transaction, runId, roleId);
  if (!pendingInvite) {
    return;
  }

  throw new StoryRunPersistenceError(
    'story_run_pending_invite_conflict',
    `Role slot "${roleId}" in run "${runId}" already has a pending invite.`,
    {
      details: {
        roleId,
        runId,
      },
    },
  );
};

const assertNoActiveBindingConflictOrThrow = async (
  transaction: StoryRunTransaction,
  input: {
    participantId: string;
    roleId: string;
    runId: string;
  },
): Promise<void> => {
  const [slotBinding] = await transaction
    .select({
      bindingId: runParticipantBindings.bindingId,
    })
    .from(runParticipantBindings)
    .where(
      and(
        eq(runParticipantBindings.runId, input.runId),
        eq(runParticipantBindings.roleId, input.roleId),
        eq(runParticipantBindings.status, 'bound'),
      ),
    )
    .limit(1);

  if (slotBinding) {
    throw new StoryRunPersistenceError(
      'story_run_active_binding_conflict',
      `Role slot "${input.roleId}" in run "${input.runId}" already has an active binding.`,
      {
        details: {
          roleId: input.roleId,
          runId: input.runId,
        },
      },
    );
  }

  const [participantBinding] = await transaction
    .select({
      bindingId: runParticipantBindings.bindingId,
    })
    .from(runParticipantBindings)
    .where(
      and(
        eq(runParticipantBindings.runId, input.runId),
        eq(runParticipantBindings.participantId, input.participantId),
        eq(runParticipantBindings.status, 'bound'),
      ),
    )
    .limit(1);

  if (!participantBinding) {
    return;
  }

  throw new StoryRunPersistenceError(
    'story_run_active_binding_conflict',
    `Participant "${input.participantId}" already has an active binding in run "${input.runId}".`,
    {
      details: {
        participantId: input.participantId,
        runId: input.runId,
      },
    },
  );
};

const buildRunResumeEnvelopeOrThrow = async (
  executor: StoryRunReadExecutor,
  input: {
    participantId: string;
    run: StoryRunRecord;
  },
): Promise<RunResumeEnvelope> => {
  const [binding] = await executor
    .select()
    .from(runParticipantBindings)
    .where(
      and(
        eq(runParticipantBindings.runId, input.run.runId),
        eq(runParticipantBindings.participantId, input.participantId),
        eq(runParticipantBindings.status, 'bound'),
      ),
    )
    .limit(1);

  if (!binding) {
    throw new StoryRunPersistenceError(
      'story_run_resume_binding_not_found',
      `Active binding for participant "${input.participantId}" was not found in run "${input.run.runId}".`,
      {
        details: {
          participantId: input.participantId,
          runId: input.run.runId,
        },
      },
    );
  }

  const [roleSlot] = await executor
    .select()
    .from(runRoleSlots)
    .where(
      and(
        eq(runRoleSlots.runId, input.run.runId),
        eq(runRoleSlots.roleId, binding.roleId),
      ),
    )
    .limit(1);
  const [sharedState] = await executor
    .select()
    .from(storyRunSharedState)
    .where(eq(storyRunSharedState.runId, input.run.runId))
    .limit(1);
  const [roleState] = await executor
    .select()
    .from(roleRunStates)
    .where(
      and(
        eq(roleRunStates.runId, input.run.runId),
        eq(roleRunStates.roleId, binding.roleId),
      ),
    )
    .limit(1);

  if (!roleSlot || !sharedState || !roleState) {
    throw new StoryRunPersistenceError(
      'story_run_resume_binding_not_found',
      `Resume records are incomplete for run "${input.run.runId}" and participant "${input.participantId}".`,
      {
        details: {
          participantId: input.participantId,
          runId: input.run.runId,
        },
      },
    );
  }

  return {
    binding,
    roleSlot,
    roleState,
    run: input.run,
    sharedState,
  };
};

export const createStoryRunQueries = (
  database: StoryRunDatabase,
  deps?: CreateStoryRunQueriesDeps,
): StoryRunQueries => {
  const getStoryPackageRepoOrThrow = (): StoryPackageRepo => {
    if (deps?.storyPackageRepo) {
      return deps.storyPackageRepo;
    }

    throw new Error(
      'createStoryRunQueries requires deps.storyPackageRepo for package-backed run operations.',
    );
  };

  const createRun = async (input: CreateRunInput): Promise<CreateRunResult> => {
    const now = input.now ?? new Date();
    const currentPublishedPackage = await loadCurrentPublishedStoryPackageOrThrow(
      getStoryPackageRepoOrThrow(),
      input.storyId,
    );
    const roleIds = currentPublishedPackage.storyPackage.roles.map((role) => role.id);

    return database.transaction(async (transaction) => {

      const [createdRun] = await transaction
        .insert(storyRuns)
        .values({
          runId: input.runId,
          storyId: input.storyId,
          storyPackageVersionId: null,
          status: 'lobby',
          adminParticipantId: input.adminParticipantId,
          createdAt: now,
          startedAt: null,
          completedAt: null,
        })
        .returning();

      if (!createdRun) {
        throw new Error(`Failed to create story run "${input.runId}".`);
      }

      const createdSlots =
        roleIds.length === 0
          ? []
          : await transaction
              .insert(runRoleSlots)
              .values(
                roleIds.map((roleId) => {
                  const slotStatus: 'assigned' | 'pending' =
                    roleIds.length === 1 && roleId === roleIds[0] ? 'assigned' : 'pending';

                  return {
                    runId: input.runId,
                    roleId,
                    status: slotStatus,
                    createdAt: now,
                    completedAt: null,
                  };
                }),
              )
              .returning();

      let hostBinding: RunParticipantBindingRecord | null = null;
      if (roleIds.length === 1 && roleIds[0]) {
        const [createdBinding] = await transaction
          .insert(runParticipantBindings)
          .values({
            bindingId: randomUUID(),
            runId: input.runId,
            roleId: roleIds[0],
            participantId: input.adminParticipantId,
            sourceInviteId: null,
            status: 'bound',
            boundAt: now,
            replacedAt: null,
          })
          .returning();

        if (!createdBinding) {
          throw new Error(`Failed to create host binding for run "${input.runId}".`);
        }

        hostBinding = createdBinding;
      }

      return {
        hostBinding,
        roleSlots: createdSlots,
        run: createdRun,
      };
    });
  };

  const inviteParticipantToRole = async (
    input: InviteParticipantToRoleInput,
  ): Promise<RunInviteRecord> =>
    database.transaction(async (transaction) => {
      await readRunOrThrow(transaction, input.runId);
      await assertNoPendingInviteForSlotOrThrow(transaction, input.runId, input.roleId);
      await assertNoActiveBindingConflictOrThrow(transaction, {
        participantId: input.participantId,
        roleId: input.roleId,
        runId: input.runId,
      });

      try {
        const [invite] = await transaction
          .insert(runInvites)
          .values({
            inviteId: input.inviteId ?? randomUUID(),
            runId: input.runId,
            roleId: input.roleId,
            participantId: input.participantId,
            status: 'pending',
            createdAt: input.now ?? new Date(),
            acceptedAt: null,
          })
          .returning();

        if (!invite) {
          throw new Error(`Failed to create invite for run "${input.runId}" role "${input.roleId}".`);
        }

        return invite;
      } catch (error) {
        const pendingInviteConflict = mapPendingInviteConflictIfPresent(error, {
          participantId: input.participantId,
          roleId: input.roleId,
          runId: input.runId,
        });
        if (pendingInviteConflict) {
          throw pendingInviteConflict;
        }

        throw error;
      }
    });

  const cancelInvite = async (input: CancelInviteInput): Promise<RunInviteRecord | null> => {
    const [invite] = await database
      .update(runInvites)
      .set({
        status: 'cancelled',
      })
      .where(
        and(
          eq(runInvites.inviteId, input.inviteId),
          eq(runInvites.runId, input.runId),
          eq(runInvites.status, 'pending'),
        ),
      )
      .returning();

    return invite ?? null;
  };

  const acceptInvite = async (input: AcceptInviteInput): Promise<AcceptInviteResult | null> =>
    database.transaction(async (transaction) => {
      const [invite] = await transaction
        .select()
        .from(runInvites)
        .where(
          and(
            eq(runInvites.inviteId, input.inviteId),
            eq(runInvites.runId, input.runId),
          ),
        )
        .limit(1);

      if (!invite || invite.status !== 'pending') {
        return null;
      }

      if (input.participantId && input.participantId !== invite.participantId) {
        throw new StoryRunPersistenceError(
          'story_run_active_binding_conflict',
          `Invite "${invite.inviteId}" is not for participant "${input.participantId}".`,
          {
            details: {
              inviteId: invite.inviteId,
              participantId: input.participantId,
              runId: input.runId,
            },
          },
        );
      }

      await assertNoActiveBindingConflictOrThrow(transaction, {
        participantId: invite.participantId,
        roleId: invite.roleId,
        runId: invite.runId,
      });

      const timestamp = input.now ?? new Date();

      let binding: RunParticipantBindingRecord;
      try {
        const [createdBinding] = await transaction
          .insert(runParticipantBindings)
          .values({
            bindingId: randomUUID(),
            runId: invite.runId,
            roleId: invite.roleId,
            participantId: invite.participantId,
            sourceInviteId: invite.inviteId,
            status: 'bound',
            boundAt: timestamp,
            replacedAt: null,
          })
          .returning();

        if (!createdBinding) {
          throw new Error(`Failed to create binding for invite "${invite.inviteId}".`);
        }

        binding = createdBinding;
      } catch (error) {
        const activeBindingConflict = mapActiveBindingConflictIfPresent(error, {
          participantId: invite.participantId,
          roleId: invite.roleId,
          runId: invite.runId,
        });
        if (activeBindingConflict) {
          throw activeBindingConflict;
        }

        throw error;
      }

      const [acceptedInvite] = await transaction
        .update(runInvites)
        .set({
          status: 'accepted',
          acceptedAt: timestamp,
        })
        .where(
          and(
            eq(runInvites.inviteId, invite.inviteId),
            eq(runInvites.status, 'pending'),
          ),
        )
        .returning();

      if (!acceptedInvite) {
        throw new Error(`Failed to mark invite "${invite.inviteId}" as accepted.`);
      }

      await transaction
        .update(runRoleSlots)
        .set({
          status: 'assigned',
        })
        .where(
          and(
            eq(runRoleSlots.runId, invite.runId),
            eq(runRoleSlots.roleId, invite.roleId),
          ),
        );

      return {
        binding,
        invite: acceptedInvite,
      };
    });

  const assignSelfToRole = async (
    input: AssignSelfToRoleInput,
  ): Promise<RunParticipantBindingRecord> =>
    database.transaction(async (transaction) => {
      await readRunOrThrow(transaction, input.runId);
      await assertNoPendingInviteForSlotOrThrow(transaction, input.runId, input.roleId);
      await assertNoActiveBindingConflictOrThrow(transaction, {
        participantId: input.participantId,
        roleId: input.roleId,
        runId: input.runId,
      });

      const timestamp = input.now ?? new Date();
      try {
        const [binding] = await transaction
          .insert(runParticipantBindings)
          .values({
            bindingId: input.bindingId ?? randomUUID(),
            runId: input.runId,
            roleId: input.roleId,
            participantId: input.participantId,
            sourceInviteId: null,
            status: 'bound',
            boundAt: timestamp,
            replacedAt: null,
          })
          .returning();

        if (!binding) {
          throw new Error(
            `Failed to assign participant "${input.participantId}" to role "${input.roleId}" in run "${input.runId}".`,
          );
        }

        await transaction
          .update(runRoleSlots)
          .set({
            status: 'assigned',
          })
          .where(
            and(
              eq(runRoleSlots.runId, input.runId),
              eq(runRoleSlots.roleId, input.roleId),
            ),
          );

        return binding;
      } catch (error) {
        const activeBindingConflict = mapActiveBindingConflictIfPresent(error, {
          participantId: input.participantId,
          roleId: input.roleId,
          runId: input.runId,
        });
        if (activeBindingConflict) {
          throw activeBindingConflict;
        }

        throw error;
      }
    });

  const replaceLobbyBinding = async (
    input: ReplaceLobbyBindingInput,
  ): Promise<RunParticipantBindingRecord> =>
    database.transaction(async (transaction) => {
      const run = await readRunOrThrow(transaction, input.runId);
      if (run.status !== 'lobby') {
        throw new StoryRunPersistenceError(
          'story_run_active_binding_conflict',
          `Run "${input.runId}" is not in lobby.`,
          {
            details: {
              runId: input.runId,
              status: run.status,
            },
          },
        );
      }

      await assertNoPendingInviteForSlotOrThrow(transaction, input.runId, input.roleId);

      await transaction
        .delete(runParticipantBindings)
        .where(
          and(
            eq(runParticipantBindings.runId, input.runId),
            eq(runParticipantBindings.roleId, input.roleId),
            eq(runParticipantBindings.status, 'bound'),
          ),
        );

      const [participantBinding] = await transaction
        .select({
          bindingId: runParticipantBindings.bindingId,
          roleId: runParticipantBindings.roleId,
        })
        .from(runParticipantBindings)
        .where(
          and(
            eq(runParticipantBindings.runId, input.runId),
            eq(runParticipantBindings.participantId, input.participantId),
            eq(runParticipantBindings.status, 'bound'),
          ),
        )
        .limit(1);

      if (participantBinding && participantBinding.roleId !== input.roleId) {
        throw new StoryRunPersistenceError(
          'story_run_active_binding_conflict',
          `Participant "${input.participantId}" already has an active binding in run "${input.runId}".`,
          {
            details: {
              participantId: input.participantId,
              runId: input.runId,
            },
          },
        );
      }

      const timestamp = input.now ?? new Date();
      const [binding] = await transaction
        .insert(runParticipantBindings)
        .values({
          bindingId: input.bindingId ?? randomUUID(),
          runId: input.runId,
          roleId: input.roleId,
          participantId: input.participantId,
          sourceInviteId: null,
          status: 'bound',
          boundAt: timestamp,
          replacedAt: null,
        })
        .returning();

      if (!binding) {
        throw new Error(
          `Failed to replace lobby binding for role "${input.roleId}" in run "${input.runId}".`,
        );
      }

      await transaction
        .update(runRoleSlots)
        .set({
          status: 'assigned',
        })
        .where(
          and(
            eq(runRoleSlots.runId, input.runId),
            eq(runRoleSlots.roleId, input.roleId),
          ),
        );

      return binding;
    });

  const startRun = async (input: StartRunInput): Promise<RunResumeEnvelope> => {
    const now = input.now ?? new Date();
    const run = await readRunOrThrow(database, input.runId);
    const currentPublishedPackage = await loadCurrentPublishedStoryPackageOrThrow(
      getStoryPackageRepoOrThrow(),
      run.storyId,
    );

    return database.transaction(async (transaction) => {
      const runInTransaction = await readRunOrThrow(transaction, input.runId);
      const publishedRoleIds = currentPublishedPackage.storyPackage.roles
        .map((role) => role.id)
        .sort();

      const roleSlots = await transaction
        .select()
        .from(runRoleSlots)
        .where(eq(runRoleSlots.runId, runInTransaction.runId));
      const roleSlotIds = roleSlots.map((slot) => slot.roleId).sort();

      if (
        roleSlots.length !== publishedRoleIds.length ||
        publishedRoleIds.some((roleId, index) => roleSlotIds[index] !== roleId)
      ) {
        throw new StoryRunPersistenceError(
          'story_run_role_slot_drift',
          `Published role set drifted for run "${run.runId}" between createRun and startRun.`,
          {
            details: {
              publishedRoleIds,
              roleSlotIds,
              runId: runInTransaction.runId,
              storyId: runInTransaction.storyId,
            },
          },
        );
      }

      const activeBindings = await transaction
        .select()
        .from(runParticipantBindings)
        .where(
          and(
            eq(runParticipantBindings.runId, runInTransaction.runId),
            eq(runParticipantBindings.status, 'bound'),
          ),
        );
      const activeBindingRoleSet = new Set(activeBindings.map((binding) => binding.roleId));

      if (
        activeBindings.length !== roleSlots.length ||
        roleSlots.some((slot) => !activeBindingRoleSet.has(slot.roleId))
      ) {
        throw new StoryRunPersistenceError(
          'story_run_incomplete_assignment_at_start',
          `Run "${run.runId}" is missing finalized active bindings for required role slots.`,
          {
            details: {
              boundRoleIds: [...activeBindingRoleSet],
              requiredRoleIds: roleSlotIds,
              runId: runInTransaction.runId,
            },
          },
        );
      }

      const [updatedRun] = await transaction
        .update(storyRuns)
        .set({
          status: 'active',
          storyPackageVersionId: currentPublishedPackage.storyPackageVersionId,
          startedAt: now,
        })
        .where(eq(storyRuns.runId, runInTransaction.runId))
        .returning();

      if (!updatedRun) {
        throw new Error(`Failed to activate run "${runInTransaction.runId}".`);
      }

      await transaction
        .update(runRoleSlots)
        .set({
          status: 'active',
        })
        .where(eq(runRoleSlots.runId, runInTransaction.runId));

      const [sharedState] = await transaction
        .insert(storyRunSharedState)
        .values({
          runId: runInTransaction.runId,
          blockStates: {},
          revision: 0,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning();
      const resolvedSharedState =
        sharedState ??
        (await transaction
          .select()
          .from(storyRunSharedState)
          .where(eq(storyRunSharedState.runId, runInTransaction.runId))
          .limit(1))[0];

      if (!resolvedSharedState) {
        throw new Error(`Failed to seed shared run state for run "${runInTransaction.runId}".`);
      }

      await transaction
        .insert(roleRunStates)
        .values(
          activeBindings.map((binding) => ({
            runId: binding.runId,
            roleId: binding.roleId,
            currentNodeId: currentPublishedPackage.storyPackage.graph.entryNodeId,
            blockStates: {},
            acceptedSharedRevision: 0,
            updatedAt: now,
          })),
        )
        .onConflictDoNothing();

      return buildRunResumeEnvelopeOrThrow(transaction, {
        participantId: input.participantId,
        run: updatedRun,
      });
    });
  };

  const replaceActiveBinding = async (
    input: ReplaceActiveBindingInput,
  ): Promise<ReplaceActiveBindingResult> =>
    database.transaction(async (transaction) => {
      const run = await readRunOrThrow(transaction, input.runId);
      if (run.status !== 'active') {
        throw new StoryRunPersistenceError(
          'story_run_active_binding_conflict',
          `Run "${run.runId}" is not active.`,
          {
            details: {
              runId: run.runId,
              status: run.status,
            },
          },
        );
      }

      const [replacedBinding] = await transaction
        .select()
        .from(runParticipantBindings)
        .where(
          and(
            eq(runParticipantBindings.runId, input.runId),
            eq(runParticipantBindings.roleId, input.roleId),
            eq(runParticipantBindings.status, 'bound'),
          ),
        )
        .limit(1);

      if (!replacedBinding) {
        throw new StoryRunPersistenceError(
          'story_run_active_binding_conflict',
          `No active binding exists for role "${input.roleId}" in run "${input.runId}".`,
          {
            details: {
              roleId: input.roleId,
              runId: input.runId,
            },
          },
        );
      }

      const [existingParticipantBinding] = await transaction
        .select({
          bindingId: runParticipantBindings.bindingId,
        })
        .from(runParticipantBindings)
        .where(
          and(
            eq(runParticipantBindings.runId, input.runId),
            eq(runParticipantBindings.participantId, input.participantId),
            eq(runParticipantBindings.status, 'bound'),
          ),
        )
        .limit(1);

      if (existingParticipantBinding) {
        throw new StoryRunPersistenceError(
          'story_run_active_binding_conflict',
          `Participant "${input.participantId}" already has an active role in run "${input.runId}".`,
          {
            details: {
              participantId: input.participantId,
              runId: input.runId,
            },
          },
        );
      }

      const timestamp = input.now ?? new Date();
      const [resolvedReplacedBinding] = await transaction
        .update(runParticipantBindings)
        .set({
          status: 'replaced',
          replacedAt: timestamp,
        })
        .where(eq(runParticipantBindings.bindingId, replacedBinding.bindingId))
        .returning();

      if (!resolvedReplacedBinding) {
        throw new Error(
          `Failed to mark prior binding "${replacedBinding.bindingId}" as replaced for run "${input.runId}".`,
        );
      }

      let currentBinding: RunParticipantBindingRecord;
      try {
        const [insertedBinding] = await transaction
          .insert(runParticipantBindings)
          .values({
            bindingId: input.bindingId ?? randomUUID(),
            runId: input.runId,
            roleId: input.roleId,
            participantId: input.participantId,
            sourceInviteId: input.sourceInviteId ?? null,
            status: 'bound',
            boundAt: timestamp,
            replacedAt: null,
          })
          .returning();

        if (!insertedBinding) {
          throw new Error(
            `Failed to create replacement binding for role "${input.roleId}" in run "${input.runId}".`,
          );
        }

        currentBinding = insertedBinding;
      } catch (error) {
        const activeBindingConflict = mapActiveBindingConflictIfPresent(error, {
          participantId: input.participantId,
          roleId: input.roleId,
          runId: input.runId,
        });
        if (activeBindingConflict) {
          throw activeBindingConflict;
        }

        throw error;
      }

      return {
        currentBinding,
        replacedBinding: resolvedReplacedBinding,
      };
    });

  const getRunResumeEnvelope = async (
    input: GetRunResumeEnvelopeInput,
  ): Promise<RunResumeEnvelope> => {
    const run = await readRunOrThrow(database, input.runId);

    if (!run.storyPackageVersionId) {
      throw new StoryRunPersistenceError(
        'story_run_pinned_package_missing',
        `Run "${run.runId}" has not pinned a story package version.`,
        {
          details: {
            runId: run.runId,
          },
        },
      );
    }

    const [pinnedPackage] = await database
      .select({
        id: publishedStoryPackageVersions.id,
      })
      .from(publishedStoryPackageVersions)
      .where(
        and(
          eq(publishedStoryPackageVersions.id, run.storyPackageVersionId),
          eq(publishedStoryPackageVersions.storyId, run.storyId),
        ),
      )
      .limit(1);

    if (!pinnedPackage) {
      throw new StoryRunPersistenceError(
        'story_run_pinned_package_missing',
        `Pinned story package version "${run.storyPackageVersionId}" for run "${run.runId}" was not found.`,
        {
          details: {
            runId: run.runId,
            storyId: run.storyId,
            storyPackageVersionId: run.storyPackageVersionId,
          },
        },
      );
    }

    const storyPackage = await loadPinnedStoryPackageOrThrow(
      getStoryPackageRepoOrThrow(),
      run.storyId,
      run.storyPackageVersionId,
    );

    const envelope = await buildRunResumeEnvelopeOrThrow(database, {
      participantId: input.participantId,
      run,
    });
    const hasRole = storyPackage.roles.some((role) => role.id === envelope.binding.roleId);
    const hasNode = storyPackage.graph.nodes.some(
      (node) => node.id === envelope.roleState.currentNodeId,
    );

    if (!hasRole || !hasNode) {
      throw new StoryRunPersistenceError(
        'story_run_pinned_package_load_failed',
        `Pinned story package "${run.storyPackageVersionId}" is incompatible with resume records for run "${run.runId}".`,
        {
          details: {
            currentNodeId: envelope.roleState.currentNodeId,
            roleId: envelope.binding.roleId,
            runId: run.runId,
            storyPackageVersionId: run.storyPackageVersionId,
          },
        },
      );
    }

    return envelope;
  };

  return {
    acceptInvite,
    assignSelfToRole,
    cancelInvite,
    createRun,
    getRunResumeEnvelope,
    inviteParticipantToRole,
    replaceActiveBinding,
    replaceLobbyBinding,
    startRun,
  };
};
