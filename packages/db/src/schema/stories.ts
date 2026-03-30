import {
  type AnyPgColumn,
  type PgEnum,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-orm/zod';

export const storyStatusEnum: PgEnum<['draft', 'published', 'archived']> = pgEnum('story_status', [
  'draft',
  'published',
  'archived',
]);

export const stories = pgTable.withRLS('stories', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  summary: text('summary'),
  status: storyStatusEnum('status').notNull().default('draft'),
  draftBundleUri: text('draft_bundle_uri').notNull(),
  currentPublishedSnapshotId: text('current_published_snapshot_id').references(
    (): AnyPgColumn => storyPublishedSnapshots.id,
    { onDelete: 'set null' },
  ),
  lastPublishedAt: timestamp('last_published_at', {
    mode: 'date',
    withTimezone: true,
  }),
  createdAt: timestamp('created_at', {
    mode: 'date',
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', {
    mode: 'date',
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
});

export const storyPublishedSnapshots = pgTable.withRLS('story_published_snapshots', {
  id: text('id').primaryKey(),
  storyId: text('story_id')
    .notNull()
    .references((): AnyPgColumn => stories.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  summary: text('summary'),
  publishedBundleUri: text('published_bundle_uri').notNull(),
  engineMajor: integer('engine_major').notNull(),
  publishedAt: timestamp('published_at', {
    mode: 'date',
    withTimezone: true,
  }).notNull(),
  createdAt: timestamp('created_at', {
    mode: 'date',
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
});

export type StoryRow = typeof stories.$inferSelect;
export type StoryInsert = typeof stories.$inferInsert;
export type StoryPublishedSnapshotRow = typeof storyPublishedSnapshots.$inferSelect;
export type StoryPublishedSnapshotInsert = typeof storyPublishedSnapshots.$inferInsert;

export const storySelectSchema = createSelectSchema(stories);
export const storyInsertSchema = createInsertSchema(stories);
export const storyUpdateSchema = createUpdateSchema(stories);
export const storyPublishedSnapshotSelectSchema = createSelectSchema(storyPublishedSnapshots);
export const storyPublishedSnapshotInsertSchema = createInsertSchema(storyPublishedSnapshots);
export const storyPublishedSnapshotUpdateSchema = createUpdateSchema(storyPublishedSnapshots);
