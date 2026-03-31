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
  draftPackageUri: text('draft_package_uri').notNull(),
  currentPublishedPackageVersionId: text('current_published_package_version_id').references(
    (): AnyPgColumn => publishedStoryPackageVersions.id,
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

export const publishedStoryPackageVersions = pgTable.withRLS('story_published_package_versions', {
  id: text('id').primaryKey(),
  storyId: text('story_id')
    .notNull()
    .references((): AnyPgColumn => stories.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  summary: text('summary'),
  publishedPackageUri: text('published_package_uri').notNull(),
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
export type PublishedStoryPackageVersionRow = typeof publishedStoryPackageVersions.$inferSelect;
export type PublishedStoryPackageVersionInsert = typeof publishedStoryPackageVersions.$inferInsert;

export const storySelectSchema = createSelectSchema(stories);
export const storyInsertSchema = createInsertSchema(stories);
export const storyUpdateSchema = createUpdateSchema(stories);
export const publishedStoryPackageVersionSelectSchema = createSelectSchema(publishedStoryPackageVersions);
export const publishedStoryPackageVersionInsertSchema = createInsertSchema(publishedStoryPackageVersions);
export const publishedStoryPackageVersionUpdateSchema = createUpdateSchema(publishedStoryPackageVersions);
