CREATE TABLE "inquiry_attachment_snapshots" (
	"link_id" text PRIMARY KEY NOT NULL,
	"inquiry_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"name" text NOT NULL,
	"mime_type" text,
	"caption" text,
	"attached_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "privacy_erased_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "privacy_erased_by" text;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "privacy_erasure_reason" text;--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN "privacy_purge_asset_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "inquiry_attachment_snapshots" ADD CONSTRAINT "inquiry_attachment_snapshots_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_inquiry_attachment_asset" ON "inquiry_attachment_snapshots" USING btree ("inquiry_id","asset_id");--> statement-breakpoint
CREATE INDEX "idx_inquiry_attachment_inquiry" ON "inquiry_attachment_snapshots" USING btree ("inquiry_id","created_at");