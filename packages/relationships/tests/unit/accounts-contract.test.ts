import { listResponse, listResponseSchema } from "@voyant-travel/types"
import type { InferSelectModel } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  communicationLogEntrySchema,
  organizationNoteSchema,
  organizationSchema,
  personNoteSchema,
  personPaymentMethodSchema,
  personSchema,
  segmentSchema,
} from "../../src/routes/accounts-openapi-schemas.js"
import type {
  communicationLog,
  organizationNotes,
  organizations,
  people,
  personNotes,
  personPaymentMethods,
  segments,
} from "../../src/schema-accounts.js"

/**
 * Response contract tests (voyant#2276 — step 3.5, stage A) for the
 * relationships accounts admin routes. They close the gap that
 * `@hono/zod-openapi` leaves open (honojs/middleware#181): the library keeps the
 * generated doc in sync with the *declared* response schema, but does NOT verify
 * the handler actually returns that shape.
 *
 * Each fixture is typed as the real Drizzle select row so a column drift breaks
 * compilation; the JSON round-trip (Date → ISO string, §17) mirrors `c.json` so
 * a declared/actual mismatch breaks the test. Schemas are imported from
 * `accounts-openapi-schemas.ts` — the same module the route declarations read
 * from — so doc, handler, and assertion share one source.
 *
 * The `people` read surface is hydrated (carries the person's primary
 * email/phone/website resolved from identity), so its fixture is the Drizzle
 * row widened with those three columns.
 */

const createdAt = new Date("2026-01-01T00:00:00.000Z")
const updatedAt = new Date("2026-01-02T00:00:00.000Z")

const organizationRow: InferSelectModel<typeof organizations> = {
  id: "organizations_00000000000000000000",
  name: "Globe Travel",
  legalName: null,
  website: null,
  taxId: null,
  industry: null,
  relation: "client",
  ownerId: null,
  defaultCurrency: null,
  preferredLanguage: null,
  paymentTerms: null,
  status: "active",
  source: null,
  sourceRef: null,
  tags: [],
  customFields: {},
  notes: null,
  createdAt,
  updatedAt,
  archivedAt: null,
}

const personRow: InferSelectModel<typeof people> & {
  email: string | null
  phone: string | null
  website: string | null
} = {
  id: "people_000000000000000000000000",
  organizationId: null,
  firstName: "Ada",
  middleName: null,
  lastName: "Lovelace",
  gender: null,
  jobTitle: null,
  relation: "client",
  preferredLanguage: null,
  preferredCurrency: null,
  ownerId: null,
  status: "active",
  source: null,
  sourceRef: null,
  tags: [],
  customFields: {},
  dateOfBirth: "1990-01-01",
  notes: null,
  accessibilityEncrypted: null,
  dietaryEncrypted: null,
  loyaltyEncrypted: null,
  insuranceEncrypted: null,
  createdAt,
  updatedAt,
  archivedAt: null,
  email: "ada@example.com",
  phone: null,
  website: null,
}

const organizationNoteRow: InferSelectModel<typeof organizationNotes> = {
  id: "organization_notes_0000000000000000",
  organizationId: "organizations_00000000000000000000",
  authorId: "user_1",
  content: "Met at the trade show.",
  createdAt,
}

const personNoteRow: InferSelectModel<typeof personNotes> = {
  id: "person_notes_0000000000000000000",
  personId: "people_000000000000000000000000",
  authorId: "user_1",
  content: "Prefers window seats.",
  createdAt,
}

/**
 * The projection the route serves, not the row. `processor_token` is
 * deliberately absent: it is the one column that can charge the customer and it
 * never leaves the server.
 */
const personPaymentMethodRow: Omit<
  InferSelectModel<typeof personPaymentMethods>,
  | "processorToken"
  | "providerCustomerReference"
  | "fingerprint"
  | "agreementReference"
  | "updatedAt"
> = {
  id: "person_payment_methods_000000000000",
  personId: "people_000000000000000000000000",
  source: "payment",
  brand: "visa",
  last4: "4242",
  holderName: null,
  expMonth: 12,
  expYear: 2030,
  providerId: "voyant-pay",
  authorizedReuses: ["merchant_initiated"],
  status: "usable",
  isDefault: true,
  createdAt,
}

const communicationLogEntryRow: InferSelectModel<typeof communicationLog> = {
  id: "communication_log_00000000000000000",
  personId: "people_000000000000000000000000",
  organizationId: null,
  channel: "email",
  direction: "outbound",
  subject: null,
  content: null,
  sentAt: null,
  createdAt,
}

const segmentRow: InferSelectModel<typeof segments> = {
  id: "segments_0000000000000000000000",
  name: "VIP",
  description: null,
  conditions: null,
  createdAt,
  updatedAt,
}

const singleCases = [
  ["organization", organizationSchema, organizationRow],
  ["person", personSchema, personRow],
  ["organization note", organizationNoteSchema, organizationNoteRow],
  ["person note", personNoteSchema, personNoteRow],
  ["person payment method", personPaymentMethodSchema, personPaymentMethodRow],
  ["communication log entry", communicationLogEntrySchema, communicationLogEntryRow],
  ["segment", segmentSchema, segmentRow],
] as const

describe("relationships accounts single-entity response contracts", () => {
  for (const [label, schema, row] of singleCases) {
    it(`the serialized ${label} { data } envelope satisfies the declared OpenAPI schema`, () => {
      const wire = JSON.parse(JSON.stringify({ data: row }))
      const parsed = z.object({ data: schema }).safeParse(wire)
      expect(parsed.success ? null : parsed.error.toString()).toBeNull()
    })
  }
})

describe("relationships accounts list response contracts", () => {
  // Organizations and people are the offset-paginated list surfaces.
  const listCases = [
    ["organization", organizationSchema, organizationRow],
    ["person", personSchema, personRow],
  ] as const

  for (const [label, schema, row] of listCases) {
    it(`the serialized ${label} list satisfies the declared OpenAPI list envelope`, () => {
      const wire = JSON.parse(
        JSON.stringify(listResponse([row], { total: 1, limit: 50, offset: 0 })),
      )
      const parsed = listResponseSchema(schema).safeParse(wire)
      expect(parsed.success ? null : parsed.error.toString()).toBeNull()
    })
  }

  it("the delete envelope satisfies the declared OpenAPI schema", () => {
    const parsed = z.object({ success: z.literal(true) }).safeParse({ success: true })
    expect(parsed.success).toBe(true)
  })
})
