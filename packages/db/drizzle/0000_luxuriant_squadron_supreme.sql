CREATE TYPE "public"."component_category" AS ENUM('block', 'gate', 'other');--> statement-breakpoint
CREATE TYPE "public"."edge_type" AS ENUM('default', 'choice', 'conditional');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('story_started', 'story_completed', 'story_abandoned', 'node_visited', 'choice_made', 'gate_unlocked', 'gate_failed', 'session_joined', 'session_left', 'achievement_unlocked');--> statement-breakpoint
CREATE TYPE "public"."geography_type" AS ENUM('single_city', 'multi_region', 'location_agnostic');--> statement-breakpoint
CREATE TYPE "public"."location_fallback" AS ENUM('wait', 'skip', 'manual_confirm');--> statement-breakpoint
CREATE TYPE "public"."location_type" AS ENUM('specific', 'category', 'none');--> statement-breakpoint
CREATE TYPE "public"."multiplayer_status" AS ENUM('waiting', 'active', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."node_category" AS ENUM('block', 'gate');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('active', 'completed', 'archived', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."shell_type" AS ENUM('ebook', 'chat', 'map');--> statement-breakpoint
CREATE TYPE "public"."story_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."sync_behavior" AS ENUM('wait_screen', 'side_content', 'notification', 'timeout_skip');--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"icon" text,
	"category" text,
	"points" integer DEFAULT 0,
	"is_secret" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "component_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"category" "component_category" NOT NULL,
	"icon" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "component_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"component_type_id" uuid NOT NULL,
	"major" integer NOT NULL,
	"minor" integer NOT NULL,
	"patch" integer NOT NULL,
	"props_schema" jsonb NOT NULL,
	"default_props" jsonb DEFAULT '{}'::jsonb,
	"dependencies" jsonb,
	"changelog" text,
	"is_deprecated" boolean DEFAULT false NOT NULL,
	"deprecation_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_node_id" uuid NOT NULL,
	"target_node_id" uuid NOT NULL,
	"edge_type" "edge_type" DEFAULT 'default' NOT NULL,
	"label" text,
	"condition" jsonb,
	"priority" integer DEFAULT 0,
	"allowed_roles" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"session_id" uuid,
	"story_id" uuid,
	"node_id" uuid,
	"event_type" "event_type" NOT NULL,
	"event_data" jsonb DEFAULT '{}'::jsonb,
	"device_info" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "genres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"icon" text,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "multiplayer_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid,
	"current_node_id" uuid,
	"personal_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"visited_nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_connected" boolean DEFAULT true NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"last_active_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "multiplayer_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"host_user_id" uuid NOT NULL,
	"join_code" text NOT NULL,
	"status" "multiplayer_status" DEFAULT 'waiting' NOT NULL,
	"shared_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"shared_inventory" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_sync_point_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"node_key" text NOT NULL,
	"node_category" "node_category" NOT NULL,
	"node_type" text NOT NULL,
	"chapter_id" uuid,
	"component_version_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" jsonb DEFAULT '{"x":0,"y":0}'::jsonb,
	"order" integer DEFAULT 0,
	"allowed_roles" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" text,
	"display_name" text,
	"avatar_url" text,
	"bio" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"author_id" uuid NOT NULL,
	"status" "story_status" DEFAULT 'draft' NOT NULL,
	"shell_type" "shell_type" DEFAULT 'ebook' NOT NULL,
	"genre_id" uuid,
	"estimated_duration_minutes" integer,
	"difficulty_level" integer,
	"cover_image_url" text,
	"geography_type" "geography_type" DEFAULT 'location_agnostic' NOT NULL,
	"primary_city" text,
	"primary_country" text,
	"start_node_id" uuid,
	"is_multiplayer" boolean DEFAULT false NOT NULL,
	"min_players" integer DEFAULT 1,
	"max_players" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"published_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "story_downloads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"version" text NOT NULL,
	"size_bytes" integer,
	"downloaded_at" timestamp DEFAULT now() NOT NULL,
	"last_accessed_at" timestamp,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "story_manifests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"required_components" jsonb NOT NULL,
	"engine_version" text NOT NULL,
	"resolved_components" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "story_manifests_story_id_unique" UNIQUE("story_id")
);
--> statement-breakpoint
CREATE TABLE "story_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"is_required" boolean DEFAULT true NOT NULL,
	"order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"current_node_id" uuid,
	"status" "session_status" DEFAULT 'active' NOT NULL,
	"game_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"inventory" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"visited_nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"choice_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"last_played_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sync_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"behavior" "sync_behavior" DEFAULT 'wait_screen' NOT NULL,
	"timeout_seconds" integer,
	"side_content_node_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"achievement_id" uuid NOT NULL,
	"story_id" uuid,
	"unlocked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venue_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"osm_tags" jsonb NOT NULL,
	"icon" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"osm_id" text,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"address" text,
	"city" text,
	"country" text,
	"is_sponsored" boolean DEFAULT false NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"sponsor_priority" integer DEFAULT 0,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_versions" ADD CONSTRAINT "component_versions_component_type_id_component_types_id_fk" FOREIGN KEY ("component_type_id") REFERENCES "public"."component_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_source_node_id_nodes_id_fk" FOREIGN KEY ("source_node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_target_node_id_nodes_id_fk" FOREIGN KEY ("target_node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multiplayer_players" ADD CONSTRAINT "multiplayer_players_session_id_multiplayer_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."multiplayer_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multiplayer_players" ADD CONSTRAINT "multiplayer_players_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multiplayer_players" ADD CONSTRAINT "multiplayer_players_role_id_story_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."story_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multiplayer_players" ADD CONSTRAINT "multiplayer_players_current_node_id_nodes_id_fk" FOREIGN KEY ("current_node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multiplayer_sessions" ADD CONSTRAINT "multiplayer_sessions_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multiplayer_sessions" ADD CONSTRAINT "multiplayer_sessions_host_user_id_profiles_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multiplayer_sessions" ADD CONSTRAINT "multiplayer_sessions_current_sync_point_id_sync_points_id_fk" FOREIGN KEY ("current_sync_point_id") REFERENCES "public"."sync_points"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_component_version_id_component_versions_id_fk" FOREIGN KEY ("component_version_id") REFERENCES "public"."component_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_downloads" ADD CONSTRAINT "story_downloads_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_downloads" ADD CONSTRAINT "story_downloads_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_manifests" ADD CONSTRAINT "story_manifests_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_roles" ADD CONSTRAINT "story_roles_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_sessions" ADD CONSTRAINT "story_sessions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_sessions" ADD CONSTRAINT "story_sessions_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_sessions" ADD CONSTRAINT "story_sessions_current_node_id_nodes_id_fk" FOREIGN KEY ("current_node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_points" ADD CONSTRAINT "sync_points_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_points" ADD CONSTRAINT "sync_points_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_points" ADD CONSTRAINT "sync_points_side_content_node_id_nodes_id_fk" FOREIGN KEY ("side_content_node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_category_id_venue_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."venue_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "achievements_slug_idx" ON "achievements" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "chapters_story_idx" ON "chapters" USING btree ("story_id");--> statement-breakpoint
CREATE UNIQUE INDEX "component_types_name_idx" ON "component_types" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "component_versions_unique_idx" ON "component_versions" USING btree ("component_type_id","major","minor","patch");--> statement-breakpoint
CREATE INDEX "component_versions_type_idx" ON "component_versions" USING btree ("component_type_id");--> statement-breakpoint
CREATE INDEX "edges_source_idx" ON "edges" USING btree ("source_node_id");--> statement-breakpoint
CREATE INDEX "edges_target_idx" ON "edges" USING btree ("target_node_id");--> statement-breakpoint
CREATE INDEX "events_user_idx" ON "events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "events_story_idx" ON "events" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "events_type_idx" ON "events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "events_created_idx" ON "events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "genres_slug_idx" ON "genres" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "multiplayer_players_session_user_idx" ON "multiplayer_players" USING btree ("session_id","user_id");--> statement-breakpoint
CREATE INDEX "multiplayer_players_session_idx" ON "multiplayer_players" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "multiplayer_players_user_idx" ON "multiplayer_players" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "multiplayer_sessions_join_code_idx" ON "multiplayer_sessions" USING btree ("join_code");--> statement-breakpoint
CREATE INDEX "multiplayer_sessions_story_idx" ON "multiplayer_sessions" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "multiplayer_sessions_host_idx" ON "multiplayer_sessions" USING btree ("host_user_id");--> statement-breakpoint
CREATE INDEX "multiplayer_sessions_status_idx" ON "multiplayer_sessions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "nodes_story_key_idx" ON "nodes" USING btree ("story_id","node_key");--> statement-breakpoint
CREATE INDEX "nodes_story_idx" ON "nodes" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "nodes_chapter_idx" ON "nodes" USING btree ("chapter_id");--> statement-breakpoint
CREATE INDEX "nodes_category_idx" ON "nodes" USING btree ("node_category");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_username_idx" ON "profiles" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "stories_slug_idx" ON "stories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "stories_author_idx" ON "stories" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "stories_genre_idx" ON "stories" USING btree ("genre_id");--> statement-breakpoint
CREATE INDEX "stories_status_idx" ON "stories" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stories_city_idx" ON "stories" USING btree ("primary_city");--> statement-breakpoint
CREATE UNIQUE INDEX "story_downloads_user_story_idx" ON "story_downloads" USING btree ("user_id","story_id");--> statement-breakpoint
CREATE INDEX "story_downloads_user_idx" ON "story_downloads" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "story_roles_story_name_idx" ON "story_roles" USING btree ("story_id","name");--> statement-breakpoint
CREATE INDEX "story_roles_story_idx" ON "story_roles" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "story_sessions_user_idx" ON "story_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "story_sessions_story_idx" ON "story_sessions" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "story_sessions_status_idx" ON "story_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sync_points_story_idx" ON "sync_points" USING btree ("story_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_points_node_idx" ON "sync_points" USING btree ("node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_achievements_unique_idx" ON "user_achievements" USING btree ("user_id","achievement_id");--> statement-breakpoint
CREATE INDEX "user_achievements_user_idx" ON "user_achievements" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "venue_categories_name_idx" ON "venue_categories" USING btree ("name");--> statement-breakpoint
CREATE INDEX "venues_category_idx" ON "venues" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "venues_city_idx" ON "venues" USING btree ("city");--> statement-breakpoint
CREATE INDEX "venues_location_idx" ON "venues" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE UNIQUE INDEX "venues_osm_idx" ON "venues" USING btree ("osm_id");