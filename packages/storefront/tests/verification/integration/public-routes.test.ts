import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { createStorefrontVerificationPublicRoutes } from "../../../src/verification/routes-public.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

async function ensureVerificationSchema(db: PostgresJsDatabase) {
  await db.execute(
    sql.raw(`
    DO $$ BEGIN
      CREATE TYPE storefront_verification_channel AS ENUM ('email', 'sms');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `),
  )
  await db.execute(
    sql.raw(`
    DO $$ BEGIN
      CREATE TYPE storefront_verification_status AS ENUM ('pending', 'verified', 'expired', 'failed', 'cancelled');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `),
  )
  await db.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS storefront_verification_challenges (
      id text PRIMARY KEY,
      channel storefront_verification_channel NOT NULL,
      destination text NOT NULL,
      purpose text NOT NULL DEFAULT 'contact_confirmation',
      code_hash text NOT NULL,
      status storefront_verification_status NOT NULL DEFAULT 'pending',
      attempt_count integer NOT NULL DEFAULT 0,
      max_attempts integer NOT NULL DEFAULT 5,
      expires_at timestamptz NOT NULL,
      last_sent_at timestamptz NOT NULL DEFAULT now(),
      verified_at timestamptz,
      failed_at timestamptz,
      metadata jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `),
  )
  await db.execute(
    sql.raw(`
    ALTER TABLE storefront_verification_challenges
      ADD COLUMN IF NOT EXISTS subject_ref text,
      ADD COLUMN IF NOT EXISTS consumed_at timestamptz,
      ADD COLUMN IF NOT EXISTS consumed_ref text;
  `),
  )
}

describe.skipIf(!DB_AVAILABLE)("Storefront verification public routes", () => {
  let app: Hono
  let db: PostgresJsDatabase
  const sendEmailChallenge = vi.fn(async () => undefined)
  const sendSmsChallenge = vi.fn(async () => undefined)

  beforeAll(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
    await ensureVerificationSchema(db)
    await cleanupTestDb(db)

    app = new Hono()
    app.use("*", async (c, next) => {
      c.set("db" as never, db)
      await next()
    })
    app.route(
      "/",
      createStorefrontVerificationPublicRoutes({
        sendEmailChallenge,
        sendSmsChallenge,
      }),
    )
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
    sendEmailChallenge.mockClear()
    sendSmsChallenge.mockClear()
  })

  it("starts and confirms an email challenge", async () => {
    const start = await app.request("/email/start", {
      method: "POST",
      body: JSON.stringify({ email: "Traveler@example.com" }),
      headers: { "Content-Type": "application/json" },
    })

    expect(start.status).toBe(201)
    expect(sendEmailChallenge).toHaveBeenCalledOnce()
    const sentCode = sendEmailChallenge.mock.calls[0]?.[0]?.code
    expect(typeof sentCode).toBe("string")

    const confirm = await app.request("/email/confirm", {
      method: "POST",
      body: JSON.stringify({ email: "Traveler@example.com", code: sentCode }),
      headers: { "Content-Type": "application/json" },
    })

    expect(confirm.status).toBe(200)
    const body = await confirm.json()
    expect(body.data.status).toBe("verified")
    expect(body.data.destination).toBe("traveler@example.com")
  })

  it("starts and confirms an sms challenge", async () => {
    const start = await app.request("/sms/start", {
      method: "POST",
      body: JSON.stringify({ phone: "+40123456789" }),
      headers: { "Content-Type": "application/json" },
    })

    expect(start.status).toBe(201)
    expect(sendSmsChallenge).toHaveBeenCalledOnce()
    const sentCode = sendSmsChallenge.mock.calls[0]?.[0]?.code

    const confirm = await app.request("/sms/confirm", {
      method: "POST",
      body: JSON.stringify({ phone: "+40123456789", code: sentCode }),
      headers: { "Content-Type": "application/json" },
    })

    expect(confirm.status).toBe(200)
    const body = await confirm.json()
    expect(body.data.status).toBe("verified")
    expect(body.data.destination).toBe("+40123456789")
  })
})
