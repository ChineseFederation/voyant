CREATE TABLE "inquiry_legacy_sources" (
	"source_table" text NOT NULL,
	"source_id" text NOT NULL,
	"inquiry_id" text NOT NULL,
	"source_snapshot" jsonb NOT NULL,
	"reconciliation_status" text DEFAULT 'pending' NOT NULL,
	"reconciliation_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"migrated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reconciled_at" timestamp with time zone,
	CONSTRAINT "inquiry_legacy_sources_source_table_source_id_pk" PRIMARY KEY("source_table","source_id")
);
--> statement-breakpoint
ALTER TABLE "inquiry_legacy_sources" ADD CONSTRAINT "inquiry_legacy_sources_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_inquiry_legacy_sources_inquiry" ON "inquiry_legacy_sources" USING btree ("inquiry_id");--> statement-breakpoint
CREATE INDEX "idx_inquiry_legacy_sources_migrated" ON "inquiry_legacy_sources" USING btree ("migrated_at");