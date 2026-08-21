ALTER TYPE "public"."entity_type" ADD VALUE 'inquiry';--> statement-breakpoint
ALTER TABLE "inquiry_target_snapshots" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inquiry_target_snapshots" ADD COLUMN "removed_by_actor_id" text;