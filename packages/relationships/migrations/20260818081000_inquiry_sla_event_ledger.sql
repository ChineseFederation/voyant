CREATE TABLE "inquiry_sla_events" (
	"inquiry_id" text NOT NULL,
	"event_type" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inquiry_sla_events_inquiry_id_event_type_due_at_pk" PRIMARY KEY("inquiry_id","event_type","due_at")
);
--> statement-breakpoint
ALTER TABLE "inquiry_sla_events" ADD CONSTRAINT "inquiry_sla_events_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_inquiry_sla_events_occurred" ON "inquiry_sla_events" USING btree ("occurred_at");
