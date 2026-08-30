ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "contract_template_id" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_products_contract_template" ON "products" USING btree ("contract_template_id");
