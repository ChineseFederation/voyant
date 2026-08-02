ALTER TABLE "booking_sessions" ADD COLUMN "trip_snapshot_id" text;
--> statement-breakpoint
ALTER TABLE "booking_sessions" ADD COLUMN "trip_envelope_id" text;
--> statement-breakpoint
ALTER TABLE "booking_sessions" ADD COLUMN "target_entity_module" text;
--> statement-breakpoint
ALTER TABLE "booking_sessions" ADD COLUMN "target_entity_id" text;
--> statement-breakpoint
ALTER TABLE "booking_sessions" ADD COLUMN "proposal_id" text;
--> statement-breakpoint
ALTER TABLE "booking_sessions" ADD COLUMN "proposal_version_id" text;
--> statement-breakpoint
ALTER TABLE "booking_sessions" DROP CONSTRAINT "booking_sessions_target_exactly_one";
--> statement-breakpoint
ALTER TABLE "booking_sessions" ADD CONSTRAINT "booking_sessions_target_exactly_one"
CHECK (
  ("target_kind" = 'product'
    AND "product_id" IS NOT NULL
    AND "catalog_item_id" IS NULL
    AND "target_entity_module" IS NULL
    AND "target_entity_id" IS NULL
    AND "trip_snapshot_id" IS NULL
    AND "trip_envelope_id" IS NULL)
  OR
  ("target_kind" = 'catalog_item'
    AND "catalog_item_id" IS NOT NULL
    AND "product_id" IS NULL
    AND "target_entity_module" IS NULL
    AND "target_entity_id" IS NULL
    AND "trip_snapshot_id" IS NULL
    AND "trip_envelope_id" IS NULL)
  OR
  ("target_kind" = 'owned_entity'
    AND "target_entity_module" IS NOT NULL
    AND "target_entity_id" IS NOT NULL
    AND "product_id" IS NULL
    AND "catalog_item_id" IS NULL
    AND "trip_snapshot_id" IS NULL
    AND "trip_envelope_id" IS NULL)
  OR
  ("target_kind" = 'trip_snapshot'
    AND "trip_snapshot_id" IS NOT NULL
    AND "trip_envelope_id" IS NOT NULL
    AND "product_id" IS NULL
    AND "catalog_item_id" IS NULL
    AND "target_entity_module" IS NULL
    AND "target_entity_id" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "booking_sessions" ADD CONSTRAINT "booking_sessions_proposal_origin"
CHECK (
  ("proposal_id" IS NULL AND "proposal_version_id" IS NULL)
  OR
  ("target_kind" = 'trip_snapshot'
    AND "proposal_id" IS NOT NULL
    AND "proposal_version_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX "idx_booking_sessions_trip_snapshot" ON "booking_sessions" USING btree ("trip_snapshot_id");
--> statement-breakpoint
CREATE INDEX "idx_booking_sessions_owned_entity" ON "booking_sessions" USING btree ("target_entity_module","target_entity_id");
--> statement-breakpoint
CREATE INDEX "idx_booking_sessions_trip_envelope" ON "booking_sessions" USING btree ("trip_envelope_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_booking_sessions_proposal_version"
ON "booking_sessions" USING btree ("proposal_version_id")
WHERE "proposal_version_id" IS NOT NULL;
