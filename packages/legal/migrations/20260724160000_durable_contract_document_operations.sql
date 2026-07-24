CREATE TABLE "contract_document_operations" (
  "id" text PRIMARY KEY NOT NULL,
  "booking_id" text NOT NULL,
  "contract_id" text,
  "organization_id" text,
  "principal_type" text NOT NULL,
  "principal_id" text NOT NULL,
  "tenant_scope" text NOT NULL,
  "claim_action_id" text NOT NULL,
  "claim_action_name" text NOT NULL,
  "claim_action_version" text NOT NULL,
  "claim_target_type" text NOT NULL,
  "claim_target_id" text NOT NULL,
  "claim_idempotency_scope" text NOT NULL,
  "claim_idempotency_fingerprint" text NOT NULL,
  "claim_command_payload" jsonb NOT NULL,
  "idempotency_key" text NOT NULL,
  "mode" text NOT NULL,
  "request_fingerprint" text NOT NULL,
  "target_fingerprint" text NOT NULL,
  "provider_id" text NOT NULL,
  "provider_version" text NOT NULL,
  "provider_protocol" text NOT NULL,
  "status" text DEFAULT 'prepared' NOT NULL,
  "checkpoint" text DEFAULT 'prepared' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 8 NOT NULL,
  "fencing_token" integer DEFAULT 0 NOT NULL,
  "lease_owner" text,
  "lease_expires_at" timestamp with time zone,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "operation_key" text NOT NULL,
  "render_descriptor" jsonb NOT NULL,
  "rendered_payload" text,
  "artifact_metadata" jsonb,
  "artifact_name" text,
  "artifact_content_type" text,
  "artifact_checksum" text,
  "artifact_byte_length" integer,
  "previous_attachment_id" text,
  "previous_storage_key" text,
  "previous_provider_id" text,
  "previous_provider_version" text,
  "previous_provider_protocol" text,
  "previous_canonical_fingerprint" jsonb,
  "canonical_attachment_id" text,
  "result" jsonb,
  "event_id" text NOT NULL,
  "last_error" text,
  "completed_at" timestamp with time zone,
  "dead_lettered_at" timestamp with time zone,
  "cleanup_completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "contract_document_operations_contract_id_contracts_id_fk"
    FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_contract_document_operations_request"
  ON "contract_document_operations" USING btree ("tenant_scope","booking_id","idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_contract_document_operations_event"
  ON "contract_document_operations" USING btree ("event_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_contract_document_operations_key"
  ON "contract_document_operations" USING btree ("operation_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_contract_document_operations_claim"
  ON "contract_document_operations" USING btree ("claim_action_id");
--> statement-breakpoint
CREATE INDEX "idx_contract_document_operations_due"
  ON "contract_document_operations" USING btree ("status","next_attempt_at","lease_expires_at");
--> statement-breakpoint
CREATE INDEX "idx_contract_document_operations_booking"
  ON "contract_document_operations" USING btree ("booking_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_contract_document_operations_contract"
  ON "contract_document_operations" USING btree ("contract_id","created_at");
--> statement-breakpoint
WITH ranked AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "contract_id" ORDER BY "created_at" DESC, "id" DESC
  ) AS rank
  FROM "contract_attachments"
  WHERE "kind" = 'document'
)
UPDATE "contract_attachments"
SET "kind" = 'document-history'
FROM ranked
WHERE "contract_attachments"."id" = ranked."id" AND ranked.rank > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_contract_attachments_canonical_document"
  ON "contract_attachments" USING btree ("contract_id") WHERE "kind" = 'document';
