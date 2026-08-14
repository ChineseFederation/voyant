// agent-quality: file-size exception -- owner: notifications; existing coverage file stays co-located until a dedicated split preserves behavior and tests.
import type { EventBus } from "@voyant-travel/core"
import { sql } from "drizzle-orm"
import { Hono } from "hono"
import { afterAll, beforeAll, beforeEach, vi } from "vitest"

import { createNotificationsRoutes } from "../../src/routes.js"
import { drainDurableNotificationSends } from "../../src/service-durable-send.js"
import type {
  DurableNotificationDeliveryContext,
  NotificationPayload,
  NotificationProvider,
  NotificationResult,
} from "../../src/types.js"

export const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

export const json = (body: Record<string, unknown>) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

export function createTestDurableProvider(options: {
  sink: (payload: NotificationPayload) => void
  name?: string
}): NotificationProvider {
  const name = options.name ?? "local"
  const accepted = new Map<string, NotificationResult>()
  return {
    name,
    channels: ["email"],
    defaultFromAddress: "local@example.test",
    durableDelivery: {
      protocol: "notification-provider-idempotency-v1",
      async send(payload: NotificationPayload, context: DurableNotificationDeliveryContext) {
        const previous = accepted.get(context.idempotencyKey)
        if (previous) return previous
        const result = { id: `${name}_${accepted.size + 1}`, provider: name }
        options.sink(payload)
        accepted.set(context.idempotencyKey, result)
        return result
      },
    },
  }
}

async function cleanupNotificationsTestData(
  // biome-ignore lint/suspicious/noExplicitAny: test db typing -- owner: notifications; existing suppression is intentional pending typed cleanup.
  db: any,
) {
  await db.execute(sql`
    TRUNCATE
      event_outbox,
      notification_reminder_runs,
      notification_reminder_rule_authoring_requests,
      notification_reminder_stage_channels,
      notification_reminder_rule_stages,
      notification_reminder_rules,
      notification_settings,
      notification_send_operations,
      notification_deliveries,
      notification_templates,
      payment_sessions,
      invoice_renditions,
      invoices,
      contract_attachments,
      contracts,
      booking_payment_schedules,
      booking_travelers,
      booking_items,
      bookings
    CASCADE
  `)
}

export function createNotificationsTestContext(options?: {
  eventBus?: EventBus
  providers?: ReadonlyArray<NotificationProvider>
}) {
  let app!: Hono
  let db!: ReturnType<typeof import("@voyant-travel/db/test-utils").createTestDb>
  const sink = vi.fn()
  let providers: ReadonlyArray<NotificationProvider>

  beforeAll(async () => {
    const { createTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()

    await db.execute(sql`
      DO $$
      BEGIN
        CREATE TYPE notification_channel AS ENUM ('email', 'sms');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `)
    await db.execute(sql`
      DO $$
      BEGIN
        CREATE TYPE notification_send_operation_status AS ENUM (
          'pending',
          'processing',
          'retry',
          'sent',
          'dead_letter'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `)
    await db.execute(sql`
      DO $$
      BEGIN
        CREATE TYPE notification_template_status AS ENUM ('draft', 'active', 'archived');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `)
    await db.execute(sql`
      DO $$
      BEGIN
        CREATE TYPE notification_delivery_status AS ENUM ('pending', 'sent', 'failed', 'cancelled');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `)
    await db.execute(sql`
      DO $$
      BEGIN
        CREATE TYPE notification_target_type AS ENUM (
          'booking',
          'booking_payment_schedule',
          'booking_guarantee',
          'invoice',
          'payment_session',
          'person',
          'organization',
          'other'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `)
    await db.execute(sql`
      ALTER TYPE notification_target_type ADD VALUE IF NOT EXISTS 'booking_payment_schedule';
    `)
    await db.execute(sql`
      ALTER TYPE notification_target_type ADD VALUE IF NOT EXISTS 'booking_guarantee';
    `)
    await db.execute(sql`
      DO $$
      BEGIN
        CREATE TYPE notification_reminder_status AS ENUM ('draft', 'active', 'archived');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `)
    await db.execute(sql`
      DO $$
      BEGIN
        CREATE TYPE notification_reminder_target_type AS ENUM (
          'booking_confirmed',
          'booking_payment_schedule',
          'payment_complete',
          'booking_cancelled_non_payment',
          'invoice'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `)
    await db.execute(sql`
      ALTER TYPE notification_reminder_target_type ADD VALUE IF NOT EXISTS 'invoice';
    `)
    await db.execute(sql`
      DO $$
      BEGIN
        CREATE TYPE notification_reminder_run_status AS ENUM ('queued', 'processing', 'sent', 'skipped', 'failed');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `)
    await db.execute(sql`
      ALTER TYPE notification_reminder_run_status ADD VALUE IF NOT EXISTS 'queued';
    `)
    await db.execute(sql`
      DO $$
      BEGIN
        CREATE TYPE notification_reminder_stage_anchor AS ENUM (
          'due_date',
          'booking_created_at',
          'departure_date',
          'invoice_issued_at',
          'last_send_at'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `)
    await db.execute(sql`
      DO $$
      BEGIN
        CREATE TYPE notification_reminder_stage_cadence_kind AS ENUM (
          'once',
          'every_n_days',
          'escalating'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `)
    await db.execute(sql`
      DO $$
      BEGIN
        CREATE TYPE notification_stage_recipient_kind AS ENUM ('primary', 'cc', 'bcc');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS bookings (
        id text PRIMARY KEY NOT NULL,
        booking_number text NOT NULL,
        person_id text,
        organization_id text,
        status text NOT NULL DEFAULT 'confirmed',
        sell_currency text NOT NULL DEFAULT 'EUR',
        sell_amount_cents integer,
        start_date date,
        end_date date,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `)
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS start_date date`)
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS end_date date`)
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS contact_first_name text`)
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS contact_last_name text`)
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS contact_email text`)
    await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS contact_phone text`)
    await db.execute(sql`
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS contact_preferred_language text
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS booking_travelers (
        id text PRIMARY KEY NOT NULL,
        booking_id text NOT NULL,
        first_name text NOT NULL,
        last_name text NOT NULL,
        email text,
        participant_type text NOT NULL DEFAULT 'traveler',
        is_primary boolean NOT NULL DEFAULT false,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS booking_items (
        id text PRIMARY KEY NOT NULL,
        booking_id text NOT NULL,
        title text NOT NULL,
        description text,
        quantity integer,
        item_type text,
        status text NOT NULL DEFAULT 'confirmed',
        service_date date,
        sell_currency text,
        unit_sell_amount_cents integer,
        total_sell_amount_cents integer,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `)
    await db.execute(sql`ALTER TABLE booking_items ADD COLUMN IF NOT EXISTS product_id text`)
    await db.execute(sql`
      ALTER TABLE booking_items ADD COLUMN IF NOT EXISTS product_name_snapshot text
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS booking_payment_schedules (
        id text PRIMARY KEY NOT NULL,
        booking_id text NOT NULL,
        booking_item_id text,
        schedule_type text NOT NULL DEFAULT 'balance',
        status text NOT NULL DEFAULT 'pending',
        due_date date NOT NULL,
        currency text NOT NULL,
        amount_cents integer NOT NULL,
        notes text,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contracts (
        id text PRIMARY KEY NOT NULL,
        booking_id text,
        scope text NOT NULL DEFAULT 'customer',
        status text NOT NULL DEFAULT 'draft',
        title text NOT NULL,
        language text NOT NULL DEFAULT 'en',
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contract_attachments (
        id text PRIMARY KEY NOT NULL,
        contract_id text NOT NULL,
        kind text NOT NULL DEFAULT 'appendix',
        name text NOT NULL,
        mime_type text,
        file_size integer,
        storage_key text,
        checksum text,
        metadata jsonb,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS invoices (
        id text PRIMARY KEY NOT NULL,
        invoice_number text NOT NULL,
        invoice_type text NOT NULL DEFAULT 'invoice',
        booking_id text NOT NULL,
        person_id text,
        organization_id text,
        status text NOT NULL DEFAULT 'draft',
        currency text NOT NULL,
        subtotal_cents integer NOT NULL DEFAULT 0,
        tax_cents integer NOT NULL DEFAULT 0,
        total_cents integer NOT NULL DEFAULT 0,
        paid_cents integer NOT NULL DEFAULT 0,
        balance_due_cents integer NOT NULL DEFAULT 0,
        issue_date date NOT NULL,
        due_date date NOT NULL,
        language text,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS invoice_renditions (
        id text PRIMARY KEY NOT NULL,
        invoice_id text NOT NULL,
        template_id text,
        format text NOT NULL DEFAULT 'pdf',
        status text NOT NULL DEFAULT 'ready',
        storage_key text,
        file_size integer,
        checksum text,
        language text,
        generated_at timestamp with time zone,
        metadata jsonb,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS payment_sessions (
        id text PRIMARY KEY NOT NULL,
        target_type text NOT NULL DEFAULT 'other',
        target_id text,
        booking_id text,
        invoice_id text,
        booking_payment_schedule_id text,
        booking_guarantee_id text,
        status text NOT NULL DEFAULT 'pending',
        provider text,
        currency text NOT NULL,
        amount_cents integer NOT NULL,
        payment_method text,
        payer_person_id text,
        payer_organization_id text,
        payer_email text,
        payer_name text,
        redirect_url text,
        return_url text,
        cancel_url text,
        expires_at timestamp with time zone,
        external_reference text,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notification_templates (
        id text PRIMARY KEY NOT NULL,
        slug text NOT NULL UNIQUE,
        name text NOT NULL,
        channel notification_channel NOT NULL,
        provider text,
        status notification_template_status NOT NULL DEFAULT 'draft',
        subject_template text,
        html_template text,
        text_template text,
        from_address text,
        is_system boolean NOT NULL DEFAULT false,
        metadata jsonb,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notification_deliveries (
        id text PRIMARY KEY NOT NULL,
        template_id text,
        template_slug text,
        target_type notification_target_type NOT NULL DEFAULT 'other',
        target_id text,
        person_id text,
        organization_id text,
        booking_id text,
        invoice_id text,
        payment_session_id text,
        channel notification_channel NOT NULL,
        provider text NOT NULL,
        provider_message_id text,
        status notification_delivery_status NOT NULL DEFAULT 'pending',
        to_address text NOT NULL,
        from_address text,
        subject text,
        html_body text,
        text_body text,
        payload_data jsonb,
        metadata jsonb,
        error_message text,
        scheduled_for timestamp with time zone,
        sent_at timestamp with time zone,
        failed_at timestamp with time zone,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notification_send_operations (
        id text PRIMARY KEY NOT NULL,
        command_scope text NOT NULL,
        idempotency_key text NOT NULL,
        request_fingerprint text NOT NULL,
        claim_action_id text NOT NULL UNIQUE,
        organization_id text,
        target_type text NOT NULL,
        target_id text NOT NULL,
        delivery_id text NOT NULL,
        provider text NOT NULL,
        provider_idempotency_key text NOT NULL,
        request_payload jsonb NOT NULL,
        result_snapshot jsonb NOT NULL,
        terminal_event jsonb,
        status notification_send_operation_status NOT NULL DEFAULT 'pending',
        attempts integer NOT NULL DEFAULT 0,
        max_attempts integer NOT NULL DEFAULT 8,
        next_attempt_at timestamp with time zone NOT NULL DEFAULT now(),
        lease_expires_at timestamp with time zone,
        last_error text,
        completed_at timestamp with time zone,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      )
    `)
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS uidx_notification_send_operations_command
        ON notification_send_operations (command_scope, idempotency_key)
    `)
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS uidx_notification_send_operations_provider_key
        ON notification_send_operations (provider, provider_idempotency_key)
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notification_reminder_rules (
        id text PRIMARY KEY NOT NULL,
        slug text NOT NULL UNIQUE,
        name text NOT NULL,
        status notification_reminder_status NOT NULL DEFAULT 'draft',
        target_type notification_reminder_target_type NOT NULL,
        channel notification_channel NOT NULL,
        provider text,
        template_id text,
        template_slug text,
        priority integer NOT NULL DEFAULT 0,
        suppression_group text,
        is_system boolean NOT NULL DEFAULT false,
        metadata jsonb,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `)
    await db.execute(sql`
      ALTER TABLE notification_reminder_rules
        ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0
    `)
    await db.execute(sql`
      ALTER TABLE notification_reminder_rules
        ADD COLUMN IF NOT EXISTS suppression_group text
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notification_reminder_rule_stages (
        id text PRIMARY KEY NOT NULL,
        reminder_rule_id text NOT NULL,
        order_index integer NOT NULL,
        name text,
        anchor notification_reminder_stage_anchor NOT NULL,
        window_start_days integer NOT NULL,
        window_end_days integer NOT NULL,
        cadence_kind notification_reminder_stage_cadence_kind NOT NULL,
        cadence_every_days integer,
        cadence_intervals jsonb,
        max_sends_in_stage integer,
        respect_quiet_hours boolean NOT NULL DEFAULT true,
        metadata jsonb,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notification_reminder_stage_channels (
        id text PRIMARY KEY NOT NULL,
        stage_id text NOT NULL,
        order_index integer NOT NULL DEFAULT 0,
        channel notification_channel NOT NULL,
        provider text,
        template_id text,
        template_slug text,
        recipient_kind notification_stage_recipient_kind NOT NULL DEFAULT 'primary',
        recipient_role text,
        metadata jsonb,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notification_reminder_rule_authoring_requests (
        idempotency_key text PRIMARY KEY NOT NULL,
        reminder_rule_id text NOT NULL,
        operation text NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `)
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_notification_reminder_rule_authoring_rule
        ON notification_reminder_rule_authoring_requests (reminder_rule_id)
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notification_settings (
        id text PRIMARY KEY NOT NULL,
        scope text NOT NULL DEFAULT 'default',
        quiet_hours_local jsonb,
        blackout_dates jsonb,
        skip_weekends boolean NOT NULL DEFAULT false,
        holiday_calendar text,
        recipient_rate_limit_per_day integer,
        suppression_window_hours integer NOT NULL DEFAULT 24,
        metadata jsonb,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `)
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS uidx_notification_settings_scope
        ON notification_settings (scope)
    `)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notification_reminder_runs (
        id text PRIMARY KEY NOT NULL,
        reminder_rule_id text NOT NULL,
        target_type notification_reminder_target_type NOT NULL,
        target_id text NOT NULL,
        dedupe_key text NOT NULL UNIQUE,
        booking_id text,
        person_id text,
        organization_id text,
        payment_session_id text,
        notification_delivery_id text,
        status notification_reminder_run_status NOT NULL,
        recipient text,
        scheduled_for timestamp with time zone NOT NULL,
        processed_at timestamp with time zone DEFAULT now() NOT NULL,
        error_message text,
        metadata jsonb,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `)
    await cleanupNotificationsTestData(db)

    providers = options?.providers ?? [createTestDurableProvider({ sink })]
    app = new Hono()
    app.use("*", async (c, next) => {
      c.set("db" as never, db)
      await next()
    })
    app.route(
      "/",
      createNotificationsRoutes({
        providers,
        eventBus: options?.eventBus,
      }),
    )
  })

  beforeEach(async () => {
    sink.mockReset()
    await cleanupNotificationsTestData(db)
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  return {
    get db() {
      return db
    },
    request: (path: string, init?: RequestInit) => app.request(path, init),
    drain: () => drainDurableNotificationSends(db, providers),
    sink,
  }
}
