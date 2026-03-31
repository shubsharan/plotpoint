ALTER TABLE "stories" RENAME COLUMN "draft_bundle_uri" TO "draft_package_uri";--> statement-breakpoint
ALTER TABLE "stories" RENAME COLUMN "current_published_snapshot_id" TO "current_published_package_version_id";--> statement-breakpoint
ALTER TABLE "story_published_snapshots" RENAME TO "story_published_package_versions";--> statement-breakpoint
ALTER TABLE "story_published_package_versions" RENAME COLUMN "published_bundle_uri" TO "published_package_uri";--> statement-breakpoint
ALTER TABLE "stories" RENAME CONSTRAINT "stories_Y8P6Di7fgJCk_fkey" TO "stories_current_published_package_version_id_story_published_package_versions_id_fkey";--> statement-breakpoint
ALTER TABLE "story_published_package_versions" RENAME CONSTRAINT "story_published_snapshots_story_id_stories_id_fkey" TO "story_published_package_versions_story_id_stories_id_fkey";--> statement-breakpoint
ALTER TABLE "story_published_package_versions" RENAME CONSTRAINT "story_published_snapshots_pkey" TO "story_published_package_versions_pkey";
