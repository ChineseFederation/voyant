CREATE TABLE "booking_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "create_idempotency_key" text NOT NULL,
  "create_request_fingerprint" text NOT NULL,
  "capability_hash" text,
  "actor_kind" text NOT NULL,
  "owner_principal_id" text,
  "owner_organization_id" text,
  "target_kind" text NOT NULL,
  "product_id" text,
  "catalog_item_id" text,
  "state" text NOT NULL,
  "revision" integer NOT NULL,
  "state_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "abandoned_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "booking_sessions_id_typeid" CHECK ("booking_sessions"."id" LIKE 'bses_%'),
  CONSTRAINT "booking_sessions_actor_kind" CHECK ("booking_sessions"."actor_kind" IN ('anonymous', 'customer', 'staff', 'partner')),
  CONSTRAINT "booking_sessions_state" CHECK ("booking_sessions"."state" IN ('active', 'consumed', 'expired', 'abandoned')),
  CONSTRAINT "booking_sessions_target_exactly_one" CHECK (("booking_sessions"."target_kind" = 'product' AND "booking_sessions"."product_id" IS NOT NULL AND "booking_sessions"."catalog_item_id" IS NULL) OR ("booking_sessions"."target_kind" = 'catalog_item' AND "booking_sessions"."catalog_item_id" IS NOT NULL AND "booking_sessions"."product_id" IS NULL)),
  CONSTRAINT "booking_sessions_anonymous_capability" CHECK (("booking_sessions"."actor_kind" = 'anonymous' AND "booking_sessions"."capability_hash" IS NOT NULL AND "booking_sessions"."owner_principal_id" IS NULL) OR ("booking_sessions"."actor_kind" <> 'anonymous' AND "booking_sessions"."capability_hash" IS NULL AND "booking_sessions"."owner_principal_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "booking_session_quotes" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL,
  "session_revision" integer NOT NULL,
  "state" text NOT NULL,
  "pricing" jsonb NOT NULL,
  "price_fingerprint" text NOT NULL,
  "quoted_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  CONSTRAINT "booking_session_quotes_session_id_booking_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."booking_sessions"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "booking_session_quotes_id_typeid" CHECK ("booking_session_quotes"."id" LIKE 'bsqu_%'),
  CONSTRAINT "booking_session_quotes_state" CHECK ("booking_session_quotes"."state" IN ('active', 'superseded', 'consumed', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "booking_session_holds" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL,
  "quote_id" text NOT NULL,
  "target" jsonb NOT NULL,
  "quantity" integer NOT NULL,
  "state" text NOT NULL,
  "capacity_key" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "converted_at" timestamp with time zone,
  "released_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "booking_session_holds_session_id_booking_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."booking_sessions"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "booking_session_holds_quote_id_booking_session_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."booking_session_quotes"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "booking_session_holds_id_typeid" CHECK ("booking_session_holds"."id" LIKE 'bshd_%'),
  CONSTRAINT "booking_session_holds_state" CHECK ("booking_session_holds"."state" IN ('active', 'converted', 'released', 'expired')),
  CONSTRAINT "booking_session_holds_quantity_positive" CHECK ("booking_session_holds"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "booking_session_commits" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "request_fingerprint" text NOT NULL,
  "outcome" jsonb NOT NULL,
  "booking_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "booking_session_commits_session_id_booking_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."booking_sessions"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "booking_session_commits_id_typeid" CHECK ("booking_session_commits"."id" LIKE 'bscm_%')
);
--> statement-breakpoint
CREATE TABLE "booking_session_operations" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL,
  "operation" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "request_fingerprint" text NOT NULL,
  "outcome" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "booking_session_operations_session_id_booking_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."booking_sessions"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "booking_session_operations_id_typeid" CHECK ("booking_session_operations"."id" LIKE 'bsop_%'),
  CONSTRAINT "booking_session_operations_operation" CHECK ("booking_session_operations"."operation" IN ('update', 'quote', 'hold', 'abandon'))
);
--> statement-breakpoint
CREATE INDEX "idx_booking_sessions_state_expires" ON "booking_sessions" USING btree ("state","expires_at");
--> statement-breakpoint
CREATE INDEX "idx_booking_sessions_product" ON "booking_sessions" USING btree ("product_id");
--> statement-breakpoint
CREATE INDEX "idx_booking_sessions_catalog_item" ON "booking_sessions" USING btree ("catalog_item_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_booking_sessions_create_idem" ON "booking_sessions" USING btree ("create_idempotency_key");
--> statement-breakpoint
CREATE INDEX "idx_booking_session_quotes_session" ON "booking_session_quotes" USING btree ("session_id","session_revision");
--> statement-breakpoint
CREATE INDEX "idx_booking_session_quotes_expires" ON "booking_session_quotes" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX "idx_booking_session_holds_session" ON "booking_session_holds" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX "idx_booking_session_holds_capacity" ON "booking_session_holds" USING btree ("capacity_key","state");
--> statement-breakpoint
CREATE INDEX "idx_booking_session_holds_expires" ON "booking_session_holds" USING btree ("expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_booking_session_commits_session_idem" ON "booking_session_commits" USING btree ("session_id","idempotency_key");
--> statement-breakpoint
CREATE INDEX "idx_booking_session_commits_booking" ON "booking_session_commits" USING btree ("booking_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_booking_session_operations_idem" ON "booking_session_operations" USING btree ("session_id","operation","idempotency_key");
