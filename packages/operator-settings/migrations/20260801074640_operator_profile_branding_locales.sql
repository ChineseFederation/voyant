ALTER TABLE "operator_profile" ADD COLUMN "brand_color" text DEFAULT '#f26522' NOT NULL;--> statement-breakpoint
ALTER TABLE "operator_profile" ADD COLUMN "corner_radius" text DEFAULT '0.625rem' NOT NULL;--> statement-breakpoint
ALTER TABLE "operator_profile" ADD COLUMN "heading_font" text DEFAULT 'inter-tight' NOT NULL;--> statement-breakpoint
ALTER TABLE "operator_profile" ADD COLUMN "body_font" text DEFAULT 'inter-tight' NOT NULL;--> statement-breakpoint
ALTER TABLE "operator_profile" ADD COLUMN "favicon_asset_key" text;--> statement-breakpoint
ALTER TABLE "operator_profile" ADD COLUMN "favicon_mime_type" text;--> statement-breakpoint
ALTER TABLE "operator_profile" ADD COLUMN "support_email" text;--> statement-breakpoint
ALTER TABLE "operator_profile" ADD COLUMN "terms_url" text;--> statement-breakpoint
ALTER TABLE "operator_profile" ADD COLUMN "privacy_url" text;--> statement-breakpoint
ALTER TABLE "operator_profile" ADD COLUMN "supported_locales" jsonb DEFAULT '["en"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "operator_profile" ADD COLUMN "default_locale" text DEFAULT 'en' NOT NULL;