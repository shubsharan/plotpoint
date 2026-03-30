ALTER TABLE "story_published_snapshots" ADD COLUMN "title" text;
--> statement-breakpoint
ALTER TABLE "story_published_snapshots" ADD COLUMN "summary" text;
--> statement-breakpoint
UPDATE "story_published_snapshots" AS "snapshots"
SET
  "title" = "stories"."title",
  "summary" = "stories"."summary"
FROM "stories"
WHERE "stories"."id" = "snapshots"."story_id";
--> statement-breakpoint
ALTER TABLE "story_published_snapshots" ALTER COLUMN "title" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_Y8P6Di7fgJCk_fkey" FOREIGN KEY ("current_published_snapshot_id") REFERENCES "story_published_snapshots"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "story_published_snapshots" ADD CONSTRAINT "story_published_snapshots_story_id_stories_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE RESTRICT;
