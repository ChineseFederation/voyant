import { describe, expect, it } from "vitest"
import type { z } from "zod"
import {
  bootstrapCustomerPortalResultSchema,
  customerPortalCompanionSchema,
  customerPortalProfileDocumentSchema,
  customerPortalProfileSchema,
  importCustomerPortalBookingTravelersResultSchema,
} from "../../src/customer-portal/validation-public.js"
import {
  publicApiDepartureItinerarySchema,
  publicApiDepartureSchema,
  publicApiProductAvailabilitySummaryResponseSchema,
  type publicApiProductExtensionSchema,
  publicApiProductExtensionsResponseSchema,
} from "../../src/validation/departures.js"
import type {
  PublicApiIntakeResponse,
  PublicApiNewsletterSubscribeResponse,
} from "../../src/validation/intake.js"
import {
  publicApiLeadIntakeEnvelopeSchema,
  publicApiNewsletterSubscribeEnvelopeSchema,
} from "../../src/validation/intake.js"
import { publicApiSettingsSchema } from "../../src/validation-settings.js"
import type { CustomerVerificationChallengeRecord } from "../../src/verification/validation.js"
import {
  publicApiVerificationConfirmResponseSchema,
  publicApiVerificationStartResponseSchema,
} from "../../src/verification/validation.js"

/**
 * Contract tests (api-route-authoring.md §17): the declared response schema is
 * the wire contract, but `@hono/zod-openapi` does not verify that the handler
 * returns that shape. Here we type each fixture as the real service-return type
 * and round-trip it through `JSON.parse(JSON.stringify(...))` — exactly what
 * `c.json(...)` does — then assert the wire response schema parses the result.
 * This catches `Date` → string drift and missing/renamed columns.
 */
function jsonRoundTrip<T>(value: T): unknown {
  return JSON.parse(JSON.stringify({ data: value }))
}

describe("storefront intake response contracts", () => {
  it("a lead intake result serializes to the documented envelope", () => {
    const result: PublicApiIntakeResponse = {
      id: "csig_123",
      personId: "per_123",
      kind: "inquiry",
      source: "website",
      status: "new",
      duplicate: false,
    }

    const parsed = publicApiLeadIntakeEnvelopeSchema.safeParse(jsonRoundTrip(result))
    expect(parsed.success).toBe(true)
  })

  it("a newsletter subscribe result serializes to the documented envelope", () => {
    const result: PublicApiNewsletterSubscribeResponse = {
      id: "csig_456",
      personId: "per_456",
      kind: "notify",
      source: "website",
      status: "new",
      duplicate: true,
      doubleOptIn: "requested",
    }

    const parsed = publicApiNewsletterSubscribeEnvelopeSchema.safeParse(jsonRoundTrip(result))
    expect(parsed.success).toBe(true)
  })
})

describe("storefront verification response contracts", () => {
  const baseRecord: CustomerVerificationChallengeRecord = {
    id: "sfvc_123",
    channel: "email",
    destination: "traveler@example.com",
    purpose: "contact_confirmation",
    status: "pending",
    expiresAt: new Date("2026-06-23T12:00:00.000Z"),
    verifiedAt: null,
    createdAt: new Date("2026-06-23T11:00:00.000Z"),
    updatedAt: new Date("2026-06-23T11:00:00.000Z"),
  }

  it("a started challenge serializes to the documented start envelope (Date -> string)", () => {
    const parsed = publicApiVerificationStartResponseSchema.safeParse(jsonRoundTrip(baseRecord))
    expect(parsed.success).toBe(true)
  })

  it("a confirmed challenge serializes to the documented confirm envelope", () => {
    const confirmed: CustomerVerificationChallengeRecord & { status: "verified" } = {
      ...baseRecord,
      status: "verified",
      verifiedAt: new Date("2026-06-23T11:30:00.000Z"),
    }

    const parsed = publicApiVerificationConfirmResponseSchema.safeParse(jsonRoundTrip(confirmed))
    expect(parsed.success).toBe(true)
  })

  it("rejects a record whose dates were NOT serialized (raw Date is not a wire string)", () => {
    // Guards the contract: a handler that forgot to serialize the Drizzle row
    // would emit `Date` instances, which the wire schema must reject.
    const schemaInput = { data: baseRecord }
    const parsed = publicApiVerificationStartResponseSchema.safeParse(schemaInput)
    expect(parsed.success).toBe(false)
  })
})

/**
 * Catalog read contracts (voyant#2114, Batch A). Unlike the verification routes,
 * the departure/availability/itinerary services pre-normalize their Drizzle
 * `Date`s to ISO strings (`normalizeIso`/`normalizeLocalDate` in
 * `service-departures-core.ts`), and the wire schemas declare those fields as
 * plain `z.string()`, so there is no raw-`Date` drift surface to guard here.
 * These positive round-trips instead lock the documented read shapes against
 * missing/renamed columns.
 */
describe("storefront catalog read response contracts", () => {
  it("a departure serializes to the documented departure envelope", () => {
    const departure: z.infer<typeof publicApiDepartureSchema> = {
      id: "slot_123",
      productId: "prd_123",
      itineraryId: "itn_123",
      optionId: null,
      dateLocal: "2026-07-01",
      startAt: "2026-07-01T08:00:00.000Z",
      endAt: "2026-07-08T16:00:00.000Z",
      timezone: "Europe/Bucharest",
      startTime: null,
      meetingPoint: null,
      capacity: 20,
      remaining: 8,
      departureStatus: "open",
      nights: 7,
      days: 8,
      ratePlans: [],
      resourceManifest: {
        kinds: [{ kind: "vehicle", capacity: 20, assigned: 12, available: 8 }],
        resources: [
          {
            id: "res_1",
            kind: "vehicle",
            label: "Coach A",
            refType: "asset",
            refId: "ast_1",
            capacity: 20,
            assigned: 12,
            available: 8,
            parentId: null,
            flags: { shared: true },
          },
        ],
      },
    }

    const parsed = publicApiDepartureSchema.safeParse(jsonRoundTrip(departure).data)
    expect(parsed.success).toBe(true)
  })

  it("an availability summary serializes to the documented response envelope", () => {
    const summary: z.infer<typeof publicApiProductAvailabilitySummaryResponseSchema>["data"] = {
      productId: "prd_123",
      availabilityState: "available",
      counts: {
        total: 1,
        open: 1,
        closed: 0,
        soldOut: 0,
        cancelled: 0,
        onRequest: 0,
        pastCutoff: 0,
        tooEarly: 0,
        available: 1,
      },
      departures: [
        {
          id: "slot_123",
          productId: "prd_123",
          optionId: null,
          dateLocal: "2026-07-01",
          startAt: "2026-07-01T08:00:00.000Z",
          endAt: "2026-07-08T16:00:00.000Z",
          timezone: "Europe/Bucharest",
          status: "open",
          availabilityState: "available",
          capacity: 20,
          remaining: 8,
          pastCutoff: false,
          tooEarly: false,
        },
      ],
      total: 1,
      limit: 100,
      offset: 0,
    }

    const parsed = publicApiProductAvailabilitySummaryResponseSchema.safeParse(
      jsonRoundTrip(summary),
    )
    expect(parsed.success).toBe(true)
  })

  it("an itinerary serializes to the documented itinerary envelope", () => {
    const itinerary: z.infer<typeof publicApiDepartureItinerarySchema> = {
      id: "slot_123",
      itineraryId: "itn_123",
      days: [
        {
          id: "day_1",
          title: "Arrival",
          description: null,
          thumbnail: null,
          segments: [{ id: "seg_1", title: "Transfer", description: null }],
        },
      ],
    }

    const parsed = publicApiDepartureItinerarySchema.safeParse(jsonRoundTrip(itinerary).data)
    expect(parsed.success).toBe(true)
  })

  it("product extensions serialize to the documented response envelope", () => {
    // `pricingMode: "unavailable"` is a valid commerce addon mode (an add-on
    // disabled for an option). It must round-trip — regression guard for the
    // earlier narrowing that rejected it (would 400 a valid catalog read).
    const unavailableExtension: z.infer<typeof publicApiProductExtensionSchema> = {
      id: "ext_1",
      name: "Airport transfer",
      label: "Airport transfer",
      required: false,
      selectable: true,
      hasOptions: false,
      refProductId: null,
      thumb: null,
      pricePerPerson: null,
      currencyCode: "EUR",
      pricingMode: "unavailable",
      defaultQuantity: null,
      minQuantity: null,
      maxQuantity: null,
    }
    const extensions: z.infer<typeof publicApiProductExtensionsResponseSchema> = {
      extensions: [unavailableExtension],
      items: [unavailableExtension],
      details: {},
      currencyCode: "EUR",
    }

    const parsed = publicApiProductExtensionsResponseSchema.safeParse(
      jsonRoundTrip(extensions).data,
    )
    expect(parsed.success).toBe(true)
  })

  it("resolved settings serialize to the documented settings envelope", () => {
    const settings: z.infer<typeof publicApiSettingsSchema> = {
      support: { email: null, phone: null, links: [] },
      legal: {
        termsUrl: null,
        privacyUrl: null,
        cancellationUrl: null,
        defaultContractTemplateId: null,
        storedInstrumentMandate: null,
      },
      localization: { defaultLocale: "en", currencyDisplay: "symbol" },
      forms: { billing: { fields: [] }, travelers: { fields: [] } },
      payment: {
        defaultMethod: null,
        methods: [],
        structure: "full",
        schedule: [],
        defaultSchedule: null,
        bankTransfer: null,
      },
    }

    const parsed = publicApiSettingsSchema.safeParse(jsonRoundTrip(settings).data)
    expect(parsed.success).toBe(true)
  })
})

/**
 * Customer-portal read contracts (voyant#2114, Batch D). The portal service
 * pre-normalizes its Drizzle rows before returning: document `createdAt`/
 * `updatedAt` are converted to ISO strings (`projectPersonDocumentToWire`), and
 * the date-only fields (`dateOfBirth`, `issueDate`, `expiryDate`) are stored as
 * `date` columns surfaced as plain strings. The wire schemas declare all of
 * those as `z.string()`, so the positive round-trips lock the documented shapes
 * against missing/renamed columns, and the negative case guards the §17 Date →
 * string normalization on documents.
 */
describe("customer-portal response contracts", () => {
  const documentWire: z.infer<typeof customerPortalProfileDocumentSchema> = {
    id: "pdoc_123",
    type: "passport",
    number: "X1234567",
    issuingAuthority: "RO",
    issuingCountry: "RO",
    issueDate: "2020-01-01",
    expiryDate: "2030-01-01",
    attachmentId: null,
    isPrimary: true,
    notes: null,
    createdAt: "2026-06-23T11:00:00.000Z",
    updatedAt: "2026-06-23T11:00:00.000Z",
  }

  it("a profile serializes to the documented profile schema", () => {
    const profile: z.infer<typeof customerPortalProfileSchema> = {
      userId: "usr_123",
      email: "traveler@example.com",
      phoneNumber: null,
      emailVerified: true,
      firstName: "Ada",
      middleName: null,
      lastName: "Lovelace",
      avatarUrl: null,
      locale: "en",
      timezone: "Europe/Bucharest",
      seatingPreference: "aisle",
      dateOfBirth: "1990-05-01",
      address: {
        country: "RO",
        state: null,
        city: "Bucharest",
        postalCode: null,
        addressLine1: null,
        addressLine2: null,
      },
      accessibility: null,
      dietary: null,
      loyalty: null,
      insurance: null,
      marketingConsent: false,
      marketingConsentAt: null,
      marketingConsentSource: null,
      notificationDefaults: null,
      uiPrefs: null,
      customerRecord: null,
    }

    const parsed = customerPortalProfileSchema.safeParse(jsonRoundTrip(profile).data)
    expect(parsed.success).toBe(true)
  })

  it("a profile document serializes to the documented document schema", () => {
    const parsed = customerPortalProfileDocumentSchema.safeParse(jsonRoundTrip(documentWire).data)
    expect(parsed.success).toBe(true)
  })

  it("rejects a document whose timestamps were NOT serialized (raw Date is not a wire string)", () => {
    // Guards the §17 contract: a handler that skipped `projectPersonDocumentToWire`
    // would emit raw `Date` instances for createdAt/updatedAt, which the wire
    // schema must reject.
    const rawDated = {
      ...documentWire,
      createdAt: new Date("2026-06-23T11:00:00.000Z"),
      updatedAt: new Date("2026-06-23T11:00:00.000Z"),
    }
    const parsed = customerPortalProfileDocumentSchema.safeParse(rawDated)
    expect(parsed.success).toBe(false)
  })

  it("a companion serializes to the documented companion schema", () => {
    const companion: z.infer<typeof customerPortalCompanionSchema> = {
      id: "cmp_123",
      role: "general",
      name: "Charles Babbage",
      title: null,
      email: null,
      phone: null,
      isPrimary: false,
      notes: null,
      typeKey: null,
      person: {
        firstName: "Charles",
        middleName: null,
        lastName: "Babbage",
        dateOfBirth: "1791-12-26",
        addresses: [],
        documents: [
          {
            type: "drivers_license",
            number: null,
            issuingAuthority: null,
            country: null,
            issueDate: null,
            expiryDate: null,
          },
        ],
      },
      metadata: null,
    }

    const parsed = customerPortalCompanionSchema.safeParse(jsonRoundTrip(companion).data)
    expect(parsed.success).toBe(true)
  })

  it("a bootstrap result serializes to the documented bootstrap schema", () => {
    const result: z.infer<typeof bootstrapCustomerPortalResultSchema> = {
      status: "customer_selection_required",
      profile: null,
      candidates: [
        {
          id: "cus_123",
          firstName: "Ada",
          lastName: "Lovelace",
          preferredLanguage: null,
          preferredCurrency: null,
          dateOfBirth: null,
          email: "traveler@example.com",
          phone: null,
          billingAddress: null,
          relation: null,
          status: "active",
          linkable: true,
          claimedByAnotherUser: false,
        },
      ],
    }

    const parsed = bootstrapCustomerPortalResultSchema.safeParse(jsonRoundTrip(result).data)
    expect(parsed.success).toBe(true)
  })

  it("an import-booking-travelers result serializes to the documented schema", () => {
    const result: z.infer<typeof importCustomerPortalBookingTravelersResultSchema> = {
      created: [],
      skippedCount: 2,
    }

    const parsed = importCustomerPortalBookingTravelersResultSchema.safeParse(
      jsonRoundTrip(result).data,
    )
    expect(parsed.success).toBe(true)
  })
})
