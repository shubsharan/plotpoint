import { type PgEnum, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
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

export type StoryRow = typeof stories.$inferSelect;
export type StoryInsert = typeof stories.$inferInsert;

export const storySelectSchema = createSelectSchema(stories);
export const storyInsertSchema = createInsertSchema(stories);
export const storyUpdateSchema = createUpdateSchema(stories);
