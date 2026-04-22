import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  type PgEnum,
  foreignKey,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-orm/zod';
import { publishedStoryPackageVersions, stories } from './stories.js';

export const storyRunStatusEnum: PgEnum<['lobby', 'active', 'completed']> = pgEnum(
  'story_run_status',
  ['lobby', 'active', 'completed'],
);

export const runRoleSlotStatusEnum: PgEnum<['pending', 'assigned', 'active', 'completed']> = pgEnum(
  'run_role_slot_status',
  ['pending', 'assigned', 'active', 'completed'],
);

export const runInviteStatusEnum: PgEnum<['pending', 'accepted', 'cancelled']> = pgEnum(
  'run_invite_status',
  ['pending', 'accepted', 'cancelled'],
);

export const runParticipantBindingStatusEnum: PgEnum<['bound', 'replaced']> = pgEnum(
  'run_participant_binding_status',
  ['bound', 'replaced'],
);

export const storyRuns = pgTable.withRLS('story_runs', {
  runId: text('run_id').primaryKey(),
  storyId: text('story_id')
    .notNull()
    .references((): AnyPgColumn => stories.id, { onDelete: 'restrict' }),
  storyPackageVersionId: text('story_package_version_id').references(
    (): AnyPgColumn => publishedStoryPackageVersions.id,
    { onDelete: 'set null' },
  ),
  status: storyRunStatusEnum('status').notNull().default('lobby'),
  adminParticipantId: text('admin_participant_id').notNull(),
  createdAt: timestamp('created_at', {
    mode: 'date',
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
  startedAt: timestamp('started_at', {
    mode: 'date',
    withTimezone: true,
  }),
  completedAt: timestamp('completed_at', {
    mode: 'date',
    withTimezone: true,
  }),
});

export const runRoleSlots = pgTable.withRLS(
  'run_role_slots',
  {
    runId: text('run_id')
      .notNull()
      .references((): AnyPgColumn => storyRuns.runId, { onDelete: 'cascade' }),
    roleId: text('role_id').notNull(),
    status: runRoleSlotStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', {
      mode: 'date',
      withTimezone: true,
    }),
  },
  (table) => [primaryKey({ columns: [table.runId, table.roleId] })],
);

export const runInvites = pgTable.withRLS(
  'run_invites',
  {
    inviteId: text('invite_id').primaryKey(),
    runId: text('run_id').notNull(),
    roleId: text('role_id').notNull(),
    participantId: text('participant_id').notNull(),
    status: runInviteStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    acceptedAt: timestamp('accepted_at', {
      mode: 'date',
      withTimezone: true,
    }),
  },
  (table) => [
    foreignKey({
      columns: [table.runId, table.roleId],
      foreignColumns: [runRoleSlots.runId, runRoleSlots.roleId],
      name: 'run_invites_run_id_role_id_fkey',
    }).onDelete('restrict'),
    uniqueIndex('run_invites_one_pending_per_slot_idx')
      .on(table.runId, table.roleId)
      .where(sql`${table.status} = 'pending'`),
    uniqueIndex('run_invites_one_pending_per_participant_idx')
      .on(table.runId, table.participantId)
      .where(sql`${table.status} = 'pending'`),
  ],
);

export const runParticipantBindings = pgTable.withRLS(
  'run_participant_bindings',
  {
    bindingId: text('binding_id').primaryKey(),
    runId: text('run_id').notNull(),
    roleId: text('role_id').notNull(),
    participantId: text('participant_id').notNull(),
    sourceInviteId: text('source_invite_id').references((): AnyPgColumn => runInvites.inviteId, {
      onDelete: 'set null',
    }),
    status: runParticipantBindingStatusEnum('status').notNull().default('bound'),
    boundAt: timestamp('bound_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    replacedAt: timestamp('replaced_at', {
      mode: 'date',
      withTimezone: true,
    }),
  },
  (table) => [
    foreignKey({
      columns: [table.runId, table.roleId],
      foreignColumns: [runRoleSlots.runId, runRoleSlots.roleId],
      name: 'run_participant_bindings_run_id_role_id_fkey',
    }).onDelete('restrict'),
    uniqueIndex('run_bindings_one_active_per_slot_idx')
      .on(table.runId, table.roleId)
      .where(sql`${table.status} = 'bound'`),
    uniqueIndex('run_bindings_one_active_per_participant_idx')
      .on(table.runId, table.participantId)
      .where(sql`${table.status} = 'bound'`),
  ],
);

export const storyRunSharedState = pgTable.withRLS('story_run_shared_state', {
  runId: text('run_id')
    .primaryKey()
    .references((): AnyPgColumn => storyRuns.runId, { onDelete: 'cascade' }),
  blockStates: jsonb('block_states')
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  revision: integer('revision').notNull(),
  updatedAt: timestamp('updated_at', {
    mode: 'date',
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
});

export const roleRunStates = pgTable.withRLS(
  'role_run_states',
  {
    runId: text('run_id').notNull(),
    roleId: text('role_id').notNull(),
    currentNodeId: text('current_node_id').notNull(),
    blockStates: jsonb('block_states')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    acceptedSharedRevision: integer('accepted_shared_revision').notNull(),
    updatedAt: timestamp('updated_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.runId, table.roleId],
    }),
    foreignKey({
      columns: [table.runId, table.roleId],
      foreignColumns: [runRoleSlots.runId, runRoleSlots.roleId],
      name: 'role_run_states_run_id_role_id_fkey',
    }).onDelete('restrict'),
  ],
);

export type StoryRunRecord = typeof storyRuns.$inferSelect;
export type StoryRunInsert = typeof storyRuns.$inferInsert;
export type RunRoleSlotRecord = typeof runRoleSlots.$inferSelect;
export type RunRoleSlotInsert = typeof runRoleSlots.$inferInsert;
export type RunInviteRecord = typeof runInvites.$inferSelect;
export type RunInviteInsert = typeof runInvites.$inferInsert;
export type RunParticipantBindingRecord = typeof runParticipantBindings.$inferSelect;
export type RunParticipantBindingInsert = typeof runParticipantBindings.$inferInsert;
export type StoryRunSharedStateRecord = typeof storyRunSharedState.$inferSelect;
export type StoryRunSharedStateInsert = typeof storyRunSharedState.$inferInsert;
export type RoleRunStateRecord = typeof roleRunStates.$inferSelect;
export type RoleRunStateInsert = typeof roleRunStates.$inferInsert;

export const storyRunSelectSchema = createSelectSchema(storyRuns);
export const storyRunInsertSchema = createInsertSchema(storyRuns);
export const storyRunUpdateSchema = createUpdateSchema(storyRuns);

export const runRoleSlotSelectSchema = createSelectSchema(runRoleSlots);
export const runRoleSlotInsertSchema = createInsertSchema(runRoleSlots);
export const runRoleSlotUpdateSchema = createUpdateSchema(runRoleSlots);

export const runInviteSelectSchema = createSelectSchema(runInvites);
export const runInviteInsertSchema = createInsertSchema(runInvites);
export const runInviteUpdateSchema = createUpdateSchema(runInvites);

export const runParticipantBindingSelectSchema = createSelectSchema(runParticipantBindings);
export const runParticipantBindingInsertSchema = createInsertSchema(runParticipantBindings);
export const runParticipantBindingUpdateSchema = createUpdateSchema(runParticipantBindings);

export const storyRunSharedStateSelectSchema = createSelectSchema(storyRunSharedState);
export const storyRunSharedStateInsertSchema = createInsertSchema(storyRunSharedState);
export const storyRunSharedStateUpdateSchema = createUpdateSchema(storyRunSharedState);

export const roleRunStateSelectSchema = createSelectSchema(roleRunStates);
export const roleRunStateInsertSchema = createInsertSchema(roleRunStates);
export const roleRunStateUpdateSchema = createUpdateSchema(roleRunStates);
