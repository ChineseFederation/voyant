CREATE TABLE "proposal_media" (
	"id" text PRIMARY KEY NOT NULL,
	"proposal_id" text NOT NULL,
	"media_type" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"storage_key" text,
	"mime_type" text,
	"file_size" integer,
	"alt_text" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "pax_count" integer;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "proposal_media" ADD CONSTRAINT "proposal_media_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_proposal_media_proposal" ON "proposal_media" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_media_proposal_sort" ON "proposal_media" USING btree ("proposal_id","sort_order");