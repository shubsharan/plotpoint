CREATE TABLE "story_published_snapshots" (
	"id" text PRIMARY KEY,
	"story_id" text NOT NULL,
	"published_bundle_uri" text NOT NULL,
	"engine_major" integer NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "story_published_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "current_published_snapshot_id" text;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "last_published_at" timestamp with time zone;