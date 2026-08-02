ALTER TABLE "products" ADD COLUMN "product_subtype_code" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "duration_minutes" integer;--> statement-breakpoint
CREATE INDEX "idx_products_subtype_code" ON "products" USING btree ("product_subtype_code");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "chk_products_duration_minutes_nonneg" CHECK ("products"."duration_minutes" >= 0);--> statement-breakpoint
-- Seed the standard configurable Product families for first-party deployments.
-- Idempotent via the unique `code`: re-running (or a deployment that already
-- has an operator-authored family with the same code) is a no-op, and operator
-- edits to name/description/sort_order/active are never clobbered.
INSERT INTO "product_types" ("id", "code", "name", "description", "sort_order", "active")
VALUES
  ('ptyp_01kyyt22n7eddtvjwehx3pxxe2', 'tour', 'Tour', 'A guided or self-guided travel experience. Day Tour and Multi-day Tour are Tour formats.', 0, true),
  ('ptyp_01kyyt22n8ec6b4vmdyez8pezc', 'activity', 'Activity', 'A booked thing to do — timed or open — that is not primarily a tour.', 1, true),
  ('ptyp_01kyyt22n8ec6b4vmgjqen750d', 'attraction', 'Attraction', 'A place of interest. Admission is the sellable Attraction entry format.', 2, true),
  ('ptyp_01kyyt22n8ec6b4vmqk14ykvzh', 'event', 'Event', 'A dated happening such as a show, concert, festival, or match.', 3, true),
  ('ptyp_01kyyt22n8ec6b4vmsrekf48e1', 'transportation', 'Transportation', 'Moving travellers from A to B — transfers, shuttles, and the like.', 4, true)
ON CONFLICT ("code") DO NOTHING;