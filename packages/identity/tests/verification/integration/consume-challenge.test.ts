import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  confirmAndConsumeChallengeById,
  consumeVerifiedChallenge,
  PUBLIC_API_VERIFICATION_BOOKING_CREATE_PURPOSE,
} from "../../../src/verification/consume.js"
import { createCustomerVerificationService } from "../../../src/verification/service.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

const DRAFT_ID = "bdrf_1"
const EMAIL = "guest@example.com"

describe.skipIf(!DB_AVAILABLE)("consumeVerifiedChallenge", () => {
  let db: PostgresJsDatabase

  beforeAll(async () => {
    const { createTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
    await ensureSchema(db)
  })

  beforeEach(async () => {
    await db.execute(sql.raw("DELETE FROM customer_verification_challenges"))
  })

  it("spends a bound, verified challenge exactly once", async () => {
    await seed(db, {})

    const first = await consumeVerifiedChallenge(db, input())
    const second = await consumeVerifiedChallenge(db, input())

    expect(first).toEqual({ status: "consumed", destination: EMAIL })
    // The whole point: a verified challenge is a bearer credential, so a
    // replay of the same challenge must not authorize a second booking.
    expect(second).toEqual({ status: "rejected" })
  })

  it("lets only one of two concurrent callers win", async () => {
    await seed(db, {})

    const [a, b] = await Promise.all([
      consumeVerifiedChallenge(db, input({ consumedRef: "book_a" })),
      consumeVerifiedChallenge(db, input({ consumedRef: "book_b" })),
    ])

    expect([a.status, b.status].sort()).toEqual(["consumed", "rejected"])
  })

  it.each([
    ["a challenge bound to a different draft", { subjectRef: "bdrf_other" }],
    ["a contact it was not verified for", { destination: "other@example.com" }],
    ["a different purpose", { purpose: "contact_confirmation" }],
    ["an unknown challenge", { challengeId: "svch_missing" }],
  ])("refuses %s", async (_label, patch) => {
    await seed(db, {})

    expect(await consumeVerifiedChallenge(db, input(patch))).toEqual({ status: "rejected" })
  })

  it.each([
    ["never verified", { status: "pending", verified: false }],
    ["already consumed", { consumed: true }],
  ])("refuses a challenge that is %s", async (_label, seedPatch) => {
    await seed(db, seedPatch)

    expect(await consumeVerifiedChallenge(db, input())).toEqual({ status: "rejected" })
  })

  it("refuses a verification that has gone stale", async () => {
    await seed(db, { verifiedMinutesAgo: 120 })

    expect(await consumeVerifiedChallenge(db, input())).toEqual({ status: "rejected" })
  })

  it("does not coalesce pending challenges bound to different subjects", async () => {
    const deliveredCodes: string[] = []
    const service = createCustomerVerificationService()
    const senders = {
      sendEmailChallenge: async ({ code }: { code: string }) => {
        deliveredCodes.push(code)
      },
    }

    const first = await service.startEmailChallenge(
      db,
      {
        email: EMAIL,
        purpose: "booking_access_claim",
        subjectRef: "claim_a",
      },
      senders,
    )
    const second = await service.startEmailChallenge(
      db,
      {
        email: EMAIL,
        purpose: "booking_access_claim",
        subjectRef: "claim_b",
      },
      senders,
    )

    expect(second.id).not.toBe(first.id)
    expect(deliveredCodes).toHaveLength(2)
  })

  it("confirms and consumes only the exact pending challenge and all of its bindings", async () => {
    let code = ""
    const service = createCustomerVerificationService()
    const challenge = await service.startEmailChallenge(
      db,
      {
        email: EMAIL,
        purpose: "booking_access_claim",
        subjectRef: "claim_exact",
      },
      {
        sendEmailChallenge: async (input) => {
          code = input.code
        },
      },
    )

    const exact = () => ({
      challengeId: challenge.id,
      channel: "email" as const,
      purpose: "booking_access_claim",
      subjectRef: "claim_exact",
      destination: EMAIL,
      code,
      consumedRef: "claim_exact",
    })

    await expect(
      confirmAndConsumeChallengeById(db, { ...exact(), subjectRef: "claim_other" }),
    ).resolves.toEqual({ status: "rejected" })
    await expect(confirmAndConsumeChallengeById(db, exact())).resolves.toEqual({
      status: "consumed",
      destination: EMAIL,
    })
    await expect(confirmAndConsumeChallengeById(db, exact())).resolves.toEqual({
      status: "replay",
      destination: EMAIL,
    })
  })

  it("allows one exact-id consumer and rejects a competing consumedRef", async () => {
    let code = ""
    const service = createCustomerVerificationService()
    const challenge = await service.startEmailChallenge(
      db,
      { email: EMAIL, purpose: "booking_access_claim", subjectRef: "claim_race" },
      {
        sendEmailChallenge: async (input) => {
          code = input.code
        },
      },
    )
    const common = {
      challengeId: challenge.id,
      channel: "email" as const,
      purpose: "booking_access_claim",
      subjectRef: "claim_race",
      destination: EMAIL,
      code,
    }

    const results = await Promise.all([
      confirmAndConsumeChallengeById(db, { ...common, consumedRef: "claim_a" }),
      confirmAndConsumeChallengeById(db, { ...common, consumedRef: "claim_b" }),
    ])

    expect(results.map((result) => result.status).sort()).toEqual(["consumed", "rejected"])
  })

  it("locks an exact challenge after its bounded invalid-code attempts", async () => {
    let code = ""
    const service = createCustomerVerificationService({ maxAttempts: 2 })
    const challenge = await service.startEmailChallenge(
      db,
      { email: EMAIL, purpose: "booking_access_claim", subjectRef: "claim_bounded" },
      {
        sendEmailChallenge: async (input) => {
          code = input.code
        },
      },
    )
    const exact = {
      challengeId: challenge.id,
      channel: "email" as const,
      purpose: "booking_access_claim",
      subjectRef: "claim_bounded",
      destination: EMAIL,
      consumedRef: "claim_bounded",
    }

    await expect(confirmAndConsumeChallengeById(db, { ...exact, code: "000000" })).resolves.toEqual(
      { status: "rejected" },
    )
    await expect(confirmAndConsumeChallengeById(db, { ...exact, code: "111111" })).resolves.toEqual(
      { status: "rejected" },
    )
    await expect(confirmAndConsumeChallengeById(db, { ...exact, code })).resolves.toEqual({
      status: "rejected",
    })
  })
})

function input(patch: Record<string, unknown> = {}) {
  return {
    challengeId: "svch_1",
    purpose: PUBLIC_API_VERIFICATION_BOOKING_CREATE_PURPOSE,
    subjectRef: DRAFT_ID,
    destination: EMAIL,
    consumedRef: "book_1",
    ...patch,
  } as Parameters<typeof consumeVerifiedChallenge>[1]
}

async function seed(
  db: PostgresJsDatabase,
  options: {
    status?: string
    verified?: boolean
    consumed?: boolean
    verifiedMinutesAgo?: number
  },
) {
  const status = options.status ?? "verified"
  const verified = options.verified ?? true
  const minutesAgo = options.verifiedMinutesAgo ?? 1
  await db.execute(
    sql.raw(`
    INSERT INTO customer_verification_challenges
      (id, channel, destination, purpose, code_hash, status, expires_at, verified_at,
       subject_ref, consumed_at, consumed_ref)
    VALUES (
      'svch_1', 'email', '${EMAIL}', '${PUBLIC_API_VERIFICATION_BOOKING_CREATE_PURPOSE}',
      'hash', '${status}', now() + interval '10 minutes',
      ${verified ? `now() - interval '${minutesAgo} minutes'` : "NULL"},
      '${DRAFT_ID}',
      ${options.consumed ? "now()" : "NULL"},
      ${options.consumed ? "'book_prior'" : "NULL"}
    );
  `),
  )
}

async function ensureSchema(db: PostgresJsDatabase) {
  await db.execute(
    sql.raw(`
    DO $$ BEGIN
      CREATE TYPE customer_verification_channel AS ENUM ('email', 'sms');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `),
  )
  await db.execute(
    sql.raw(`
    DO $$ BEGIN
      CREATE TYPE customer_verification_status AS ENUM ('pending', 'verified', 'expired', 'failed', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `),
  )
  await db.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS customer_verification_challenges (
      id text PRIMARY KEY,
      channel customer_verification_channel NOT NULL,
      destination text NOT NULL,
      purpose text NOT NULL DEFAULT 'contact_confirmation',
      code_hash text NOT NULL,
      status customer_verification_status NOT NULL DEFAULT 'pending',
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
    ALTER TABLE customer_verification_challenges
      ADD COLUMN IF NOT EXISTS subject_ref text,
      ADD COLUMN IF NOT EXISTS consumed_at timestamptz,
      ADD COLUMN IF NOT EXISTS consumed_ref text;
  `),
  )
}
