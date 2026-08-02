ALTER TABLE "products" DROP CONSTRAINT "chk_products_duration_minutes_nonneg";--> statement-breakpoint
UPDATE "products" SET "duration_minutes" = NULL WHERE "duration_minutes" = 0;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "chk_products_duration_minutes_positive" CHECK ("products"."duration_minutes" > 0);
