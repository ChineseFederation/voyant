/**
 * `book_product` — the intent-level booking workflow tool (voyant#3933).
 *
 * One call books a product for a client: product + option, the billing party,
 * travelers, and rooms. It replaces the multi-call sequence the old
 * `create_booking` description scripted in prose — find the client with
 * `list_people`/`list_organizations`, resolve options with
 * `list_product_options`/`list_option_units`, allocate a reference with
 * `generate_booking_number`, then create. Here the platform orchestrates all of
 * it: the booking reference and the action-ledger idempotency key are resolved
 * SERVER-SIDE, so the model never carries an opaque token across turns (the
 * failure mode that produced duplicate bookings).
 *
 * Like `compose_product`, it validates before it writes: an incomplete request
 * returns actionable issues and creates nothing.
 *
 * This module owns the wire contract and the pure mapping/validation. The DB
 * work (reference allocation, the durable command) lives in `mcp-runtime.ts`,
 * which holds the request-scoped services.
 */
import { bookingToolDetailSchema } from "@voyant-travel/bookings"
import { z } from "zod"

import { type BookingCreateInput, bookingCreateSchema } from "./service-booking-create.js"
import {
  ianaTimeZoneSchema,
  paymentScheduleStatusSchema,
  paymentScheduleTypeSchema,
} from "./validation-shared.js"

const bookProductTravelerSchema = z.object({
  clientTravelerKey: z
    .string()
    .min(1)
    .max(255)
    .optional()
    .describe(
      "Stable key for this traveler within the request. Reference it from a room's `travelerKeys` to seat the traveler in that room.",
    ),
  firstName: z.string().min(1).max(255),
  lastName: z.string().min(1).max(255),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  personId: z
    .string()
    .optional()
    .nullable()
    .describe("Linked CRM person id when this traveler already exists as a contact."),
  participantType: z.enum(["traveler", "occupant", "other"]).default("traveler"),
  travelerCategory: z.enum(["adult", "child", "infant", "senior", "other"]).optional().nullable(),
  isPrimary: z.boolean().optional().nullable(),
  specialRequests: z.string().optional().nullable(),
})

const bookProductRoomSchema = z.object({
  optionUnitId: z
    .string()
    .min(1)
    .describe(
      "The selected room or priced unit id for the chosen option. The server accepts it as given; a wrong unit is reported as an actionable issue rather than guessed.",
    ),
  quantity: z
    .number()
    .int()
    .min(1)
    .describe("Number of this unit. For a room this is the number of ROOMS, not travelers."),
  travelerKeys: z
    .array(z.string().min(1).max(255))
    .optional()
    .describe(
      "`clientTravelerKey` values seated in this room. Assign every traveler to exactly one room and respect its occupancy.",
    ),
  title: z.string().min(1).max(255).optional().nullable(),
})

const bookProductBillingContactSchema = z.object({
  firstName: z.string().max(255).optional().nullable(),
  lastName: z.string().max(255).optional().nullable(),
  email: z.string().max(255).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  partyType: z.enum(["individual", "company"]).optional().nullable(),
  taxId: z.string().max(100).optional().nullable(),
  preferredLanguage: z.string().max(35).optional().nullable(),
  country: z.string().max(2).optional().nullable(),
  region: z.string().max(100).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  addressLine1: z.string().max(500).optional().nullable(),
  addressLine2: z.string().max(500).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
})

const documentGenerationSchema = z.object({
  contractDocument: z.boolean().default(false),
  invoiceDocument: z.boolean().default(false),
  invoiceType: z.enum(["invoice", "proforma"]).default("invoice"),
})

export const bookProductToolInputSchema = z.object({
  productId: z.string().min(1).describe("The product to book."),
  optionId: z
    .string()
    .optional()
    .nullable()
    .describe("Chosen product option. Supply it when the product has rooms or multiple options."),
  slotId: z.string().optional().nullable().describe("Dated departure/availability slot, if any."),
  catalogId: z
    .string()
    .min(1)
    .optional()
    .nullable()
    .describe("Public price catalog the quote used; omit to use the default public catalog."),
  personId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "TOP-LEVEL billing party id for a private client. Provide exactly one of `personId` or `organizationId`; do not wrap it in a `billingParty` object.",
    ),
  organizationId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Billing party for a company or agency booking. Provide exactly one of `personId` or `organizationId`.",
    ),
  billingContact: bookProductBillingContactSchema
    .optional()
    .describe(
      "TOP-LEVEL billing-contact snapshot captured on the booking. For a private client, send firstName, lastName, and a real email or phone here.",
    ),
  pax: z
    .number()
    .int()
    .positive()
    .optional()
    .nullable()
    .describe("Total traveler count. Must match `travelers` and the selected room capacity."),
  travelers: z
    .array(bookProductTravelerSchema)
    .min(1)
    .describe("Everyone on the booking. Give each a unique `clientTravelerKey`."),
  rooms: z
    .array(bookProductRoomSchema)
    .optional()
    .describe(
      "Selected rooms or priced units. Required for room products: `quantity` is room count and `travelerKeys` seats travelers.",
    ),
  paymentSchedules: z
    .array(
      z.object({
        scheduleType: paymentScheduleTypeSchema.default("balance"),
        status: paymentScheduleStatusSchema.default("pending"),
        dueDate: z.string().min(1),
        dueTimeZone: ianaTimeZoneSchema.default("UTC"),
        currency: z.string().min(3).max(3),
        amountCents: z.number().int().min(0),
        notes: z.string().optional().nullable(),
      }),
    )
    .optional(),
  documentGeneration: documentGenerationSchema
    .optional()
    .describe("Ask the create to also request a contract and/or an invoice or proforma."),
  suppressNotifications: z
    .boolean()
    .optional()
    .describe("Confirm silently — skip customer-facing email and document bundles."),
  allowDuplicate: z
    .boolean()
    .optional()
    .describe(
      "Override the same-party/same-departure guard to intentionally create a second active booking.",
    ),
  internalNotes: z.string().optional().nullable(),
})

export type BookProductInput = z.infer<typeof bookProductToolInputSchema>

export const bookProductIssueSchema = z.object({
  path: z.string().describe("Dot-path of the offending field, e.g. `travelers.0.email`."),
  message: z.string(),
})

export const bookProductToolOutputSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("created"),
    bookingId: z.string(),
    bookingNumber: z.string(),
    replayed: z.boolean(),
    booking: bookingToolDetailSchema,
  }),
  z.object({
    status: z.literal("invalid"),
    issues: z.array(bookProductIssueSchema),
  }),
])

export type BookProductOutput = z.infer<typeof bookProductToolOutputSchema>

/**
 * Map the intent-shaped request onto the durable booking-create command. The
 * reference is threaded in by the caller after allocation so this stays a pure
 * function of the request.
 */
export function mapBookProductIntentToCommand(
  input: BookProductInput,
  bookingNumber: string,
): BookingCreateInput {
  return {
    productId: input.productId,
    optionId: input.optionId ?? null,
    slotId: input.slotId ?? null,
    catalogId: input.catalogId ?? null,
    bookingNumber,
    personId: input.personId ?? null,
    organizationId: input.organizationId ?? null,
    pax: input.pax ?? null,
    internalNotes: input.internalNotes ?? null,
    contactFirstName: input.billingContact?.firstName ?? null,
    contactLastName: input.billingContact?.lastName ?? null,
    contactPartyType: input.billingContact?.partyType ?? null,
    contactTaxId: input.billingContact?.taxId ?? null,
    contactEmail: input.billingContact?.email ?? null,
    contactPhone: input.billingContact?.phone ?? null,
    contactPreferredLanguage: input.billingContact?.preferredLanguage ?? null,
    contactCountry: input.billingContact?.country ?? null,
    contactRegion: input.billingContact?.region ?? null,
    contactCity: input.billingContact?.city ?? null,
    contactAddressLine1: input.billingContact?.addressLine1 ?? null,
    contactAddressLine2: input.billingContact?.addressLine2 ?? null,
    contactPostalCode: input.billingContact?.postalCode ?? null,
    travelers: input.travelers.map((traveler) => ({
      clientTravelerKey: traveler.clientTravelerKey ?? null,
      firstName: traveler.firstName,
      lastName: traveler.lastName,
      email: traveler.email ?? null,
      phone: traveler.phone ?? null,
      personId: traveler.personId ?? null,
      participantType: traveler.participantType,
      travelerCategory: traveler.travelerCategory ?? null,
      isPrimary: traveler.isPrimary ?? null,
      specialRequests: traveler.specialRequests ?? null,
    })),
    itemLines: input.rooms?.map((room) => ({
      optionUnitId: room.optionUnitId,
      quantity: room.quantity,
      travelerKeys: room.travelerKeys ?? null,
      title: room.title ?? null,
    })),
    paymentSchedules: input.paymentSchedules,
    documentGeneration: input.documentGeneration,
    ...(input.suppressNotifications !== undefined
      ? { suppressNotifications: input.suppressNotifications }
      : {}),
    ...(input.allowDuplicate !== undefined ? { allowDuplicate: input.allowDuplicate } : {}),
  }
}

/**
 * Run the domain command validation (including the billing-party, traveler-key,
 * and room-occupancy refinements) without touching the database. Returns the
 * actionable issues to hand back, or `null` when the request is complete.
 *
 * `bookingNumber` is not known at validation time, so a placeholder stands in;
 * it never surfaces because a real reference is allocated only once validation
 * passes, so an invalid request allocates nothing and writes nothing.
 */
export function collectBookProductIssues(
  input: BookProductInput,
): z.infer<typeof bookProductIssueSchema>[] | null {
  const toolIssues: z.infer<typeof bookProductIssueSchema>[] = []
  if (
    input.personId &&
    !input.billingContact?.email?.trim() &&
    !input.billingContact?.phone?.trim()
  ) {
    toolIssues.push({
      path: "billingContact.email",
      message: "Set billingContact.email to a real address, or set billingContact.phone.",
    })
  }

  const candidate = mapBookProductIntentToCommand(input, "BK-PENDING-000000")
  const parsed = bookingCreateSchema.safeParse(candidate)
  if (parsed.success) return toolIssues.length > 0 ? toolIssues : null
  return toolIssues.concat(
    parsed.error.issues
      .filter((issue) => !(issue.path.length === 1 && issue.path[0] === "bookingNumber"))
      .map((issue) => {
        const rawPath = issue.path.map((segment) => String(segment)).join(".")
        const path = rawPath.startsWith("contact")
          ? `billingContact.${rawPath.slice("contact".length, "contact".length + 1).toLowerCase()}${rawPath.slice("contact".length + 1)}`
          : rawPath
        const message =
          rawPath === "personId"
            ? "Set the TOP-LEVEL personId for a private client (or top-level organizationId for a company). Do not send a billingParty object."
            : rawPath === "contactFirstName" || rawPath === "contactLastName"
              ? "Set billingContact.firstName and billingContact.lastName for the private billing party."
              : rawPath === "contactEmail"
                ? "Set billingContact.email to a real address, or set billingContact.phone."
                : issue.message
        return { path, message }
      }),
  )
}

/**
 * Derive the action-ledger idempotency key from the semantic content of the
 * request. An identical retry produces the same key, so the durable claim
 * short-circuits and replays the original booking instead of minting a second
 * one — the guarantee `generate_booking_number` used to push onto the caller.
 * Two genuinely distinct requests differ in content and get distinct keys; a
 * deliberate same-content double is what `allowDuplicate` and the
 * same-party/same-slot guard are for.
 */
export async function deriveBookProductIdempotencyKey(input: BookProductInput): Promise<string> {
  const canonical = canonicalJson(input)
  const bytes = new TextEncoder().encode(canonical)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
  return `book-product:v1:${hex}`
}

/** Stable stringification: object keys sorted so key order never changes the fingerprint. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
    return `{${entries.join(",")}}`
  }
  return JSON.stringify(value ?? null)
}
