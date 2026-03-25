CREATE TYPE "story_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "stories" (
	"id" text PRIMARY KEY,
	"title" text NOT NULL,
	"summary" text,
	"status" "story_status" DEFAULT 'draft'::"story_status" NOT NULL,
	"draft_bundle_uri" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stories" ENABLE ROW LEVEL SECURITY;
