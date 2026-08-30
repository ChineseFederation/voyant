-- Keep the deployed product table aligned with the current Voyant product model.
-- These clauses are intentionally idempotent for installations that applied an
-- upstream migration manually before the missing journal entries were repaired.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "inclusions_html" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "exclusions_html" text;
