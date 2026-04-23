ALTER TABLE "run_role_slots" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "story_runs" DROP CONSTRAINT "story_runs_o23konntepec_fkey", ADD CONSTRAINT "story_runs_o23konntepec_fkey" FOREIGN KEY ("story_package_version_id") REFERENCES "story_published_package_versions"("id") ON DELETE RESTRICT;--> statement-breakpoint
DROP TYPE "run_role_slot_status";