CREATE TABLE IF NOT EXISTS "mcp_exposure_policies" (
  "id" text PRIMARY KEY NOT NULL,
  "policy" jsonb NOT NULL,
  "updated_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
