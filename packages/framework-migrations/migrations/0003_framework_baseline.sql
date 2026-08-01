ALTER TABLE "activities" ADD COLUMN "custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;
