CREATE TABLE "inquiry_sla_events" (
  "inquiry_id" text NOT NULL REFERENCES "inquiries"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "due_at" timestamp with time zone NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "inquiry_sla_events_inquiry_id_event_type_due_at_pk"
    PRIMARY KEY ("inquiry_id", "event_type", "due_at")
);

CREATE INDEX "idx_inquiry_sla_events_occurred"
ON "inquiry_sla_events" ("occurred_at");
