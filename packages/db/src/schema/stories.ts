import {
  type PgEnum,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const storyStatusEnum: PgEnum<["draft", "published", "archived"]> =
  pgEnum("story_status", ["draft", "published", "archived"]);

export const stories = pgTable("stories", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  summary: text("summary"),
  status: storyStatusEnum("status").notNull().default("draft"),
  draftBundleUri: text("draft_bundle_uri").notNull(),
  createdAt: timestamp("created_at", {
    mode: "date",
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", {
    mode: "date",
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
}).enableRLS();
