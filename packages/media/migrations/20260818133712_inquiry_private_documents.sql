CREATE TABLE "media_private_document_deletion" (
	"asset_id" text PRIMARY KEY NOT NULL,
	"storage_key" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
DROP INDEX "uidx_media_asset_checksum";--> statement-breakpoint
ALTER TABLE "media_asset" ADD COLUMN "storage_class" text DEFAULT 'media' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_asset" ADD COLUMN "dedup_scope" text DEFAULT 'library' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_media_asset_storage_scope_checksum" ON "media_asset" USING btree ("storage_class","dedup_scope","checksum");