CREATE TYPE "public"."asset_type" AS ENUM('image', 'video', 'audio', 'document', 'other');--> statement-breakpoint
CREATE TABLE "story_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"asset_type" "asset_type" NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text,
	"storage_path" text NOT NULL,
	"public_url" text,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"duration_seconds" integer,
	"referenced_by_nodes" jsonb DEFAULT '[]'::jsonb,
	"content_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "story_assets" ADD CONSTRAINT "story_assets_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "story_assets_story_idx" ON "story_assets" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "story_assets_type_idx" ON "story_assets" USING btree ("asset_type");--> statement-breakpoint
CREATE UNIQUE INDEX "story_assets_storage_path_idx" ON "story_assets" USING btree ("storage_path");--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_story_created_idx" ON "events" USING btree ("story_id","created_at");--> statement-breakpoint
CREATE INDEX "multiplayer_sessions_story_status_idx" ON "multiplayer_sessions" USING btree ("story_id","status");--> statement-breakpoint
CREATE INDEX "nodes_type_idx" ON "nodes" USING btree ("node_type");--> statement-breakpoint
CREATE INDEX "nodes_story_order_idx" ON "nodes" USING btree ("story_id","order");--> statement-breakpoint
CREATE INDEX "story_sessions_user_status_idx" ON "story_sessions" USING btree ("user_id","status");