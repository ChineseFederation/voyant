CREATE TABLE "staff_alert_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"event_key" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"route_to_assignee" boolean DEFAULT true NOT NULL,
	"route_to_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"extra_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_alert_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"event_key" text NOT NULL,
	"enabled" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_staff_alert_settings_event_key" ON "staff_alert_settings" USING btree ("event_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_staff_alert_preferences_user_event" ON "staff_alert_preferences" USING btree ("user_id","event_key");--> statement-breakpoint
CREATE INDEX "idx_staff_alert_preferences_event" ON "staff_alert_preferences" USING btree ("event_key");
