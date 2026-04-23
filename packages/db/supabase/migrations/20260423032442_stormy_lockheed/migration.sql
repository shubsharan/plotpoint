CREATE TYPE "story_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "run_invite_status" AS ENUM('pending', 'accepted', 'cancelled');--> statement-breakpoint
CREATE TYPE "run_participant_binding_status" AS ENUM('bound', 'replaced');--> statement-breakpoint
CREATE TYPE "story_run_status" AS ENUM('lobby', 'active', 'completed');--> statement-breakpoint
CREATE TABLE "story_published_package_versions" (
	"id" text PRIMARY KEY,
	"story_id" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"published_package_uri" text NOT NULL,
	"engine_major" integer NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "story_published_package_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stories" (
	"id" text PRIMARY KEY,
	"title" text NOT NULL,
	"summary" text,
	"status" "story_status" DEFAULT 'draft'::"story_status" NOT NULL,
	"draft_package_uri" text NOT NULL,
	"current_published_package_version_id" text,
	"last_published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "role_run_states" (
	"run_id" text,
	"role_id" text,
	"current_node_id" text NOT NULL,
	"block_states" jsonb DEFAULT '{}' NOT NULL,
	"accepted_shared_revision" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_run_states_pkey" PRIMARY KEY("run_id","role_id")
);
--> statement-breakpoint
ALTER TABLE "role_run_states" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "run_invites" (
	"invite_id" text PRIMARY KEY,
	"run_id" text NOT NULL,
	"role_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"status" "run_invite_status" DEFAULT 'pending'::"run_invite_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "run_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "run_participant_bindings" (
	"binding_id" text PRIMARY KEY,
	"run_id" text NOT NULL,
	"role_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"source_invite_id" text,
	"status" "run_participant_binding_status" DEFAULT 'bound'::"run_participant_binding_status" NOT NULL,
	"bound_at" timestamp with time zone DEFAULT now() NOT NULL,
	"replaced_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "run_participant_bindings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "run_role_slots" (
	"run_id" text,
	"role_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "run_role_slots_pkey" PRIMARY KEY("run_id","role_id")
);
--> statement-breakpoint
ALTER TABLE "run_role_slots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "story_run_shared_state" (
	"run_id" text PRIMARY KEY,
	"block_states" jsonb DEFAULT '{}' NOT NULL,
	"revision" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "story_run_shared_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "story_runs" (
	"run_id" text PRIMARY KEY,
	"story_id" text NOT NULL,
	"story_package_version_id" text,
	"status" "story_run_status" DEFAULT 'lobby'::"story_run_status" NOT NULL,
	"admin_participant_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "story_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "run_invites_one_pending_per_slot_idx" ON "run_invites" ("run_id","role_id") WHERE "status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "run_invites_one_pending_per_participant_idx" ON "run_invites" ("run_id","participant_id") WHERE "status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "run_bindings_one_active_per_slot_idx" ON "run_participant_bindings" ("run_id","role_id") WHERE "status" = 'bound';--> statement-breakpoint
CREATE UNIQUE INDEX "run_bindings_one_active_per_participant_idx" ON "run_participant_bindings" ("run_id","participant_id") WHERE "status" = 'bound';--> statement-breakpoint
ALTER TABLE "story_published_package_versions" ADD CONSTRAINT "story_published_package_versions_story_id_stories_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_EKm9LZBjqV0e_fkey" FOREIGN KEY ("current_published_package_version_id") REFERENCES "story_published_package_versions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "role_run_states" ADD CONSTRAINT "role_run_states_run_id_role_id_fkey" FOREIGN KEY ("run_id","role_id") REFERENCES "run_role_slots"("run_id","role_id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "run_invites" ADD CONSTRAINT "run_invites_run_id_role_id_fkey" FOREIGN KEY ("run_id","role_id") REFERENCES "run_role_slots"("run_id","role_id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "run_participant_bindings" ADD CONSTRAINT "run_participant_bindings_sfQKVucBGCXB_fkey" FOREIGN KEY ("source_invite_id") REFERENCES "run_invites"("invite_id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "run_participant_bindings" ADD CONSTRAINT "run_participant_bindings_run_id_role_id_fkey" FOREIGN KEY ("run_id","role_id") REFERENCES "run_role_slots"("run_id","role_id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "run_role_slots" ADD CONSTRAINT "run_role_slots_run_id_story_runs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "story_runs"("run_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "story_run_shared_state" ADD CONSTRAINT "story_run_shared_state_run_id_story_runs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "story_runs"("run_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "story_runs" ADD CONSTRAINT "story_runs_story_id_stories_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "story_runs" ADD CONSTRAINT "story_runs_o23konntepec_fkey" FOREIGN KEY ("story_package_version_id") REFERENCES "story_published_package_versions"("id") ON DELETE RESTRICT;