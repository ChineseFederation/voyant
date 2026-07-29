// agent-quality: file-size exception -- owner: finance; existing service module stays co-located until a dedicated split preserves behavior and tests.

import type { CreatedTargetMutationLease } from "@voyant-travel/action-ledger"
import { bookingGroupsService } from "@voyant-travel/bookings"
import {
  BookingItemsUnresolvedError,
  BookingMonthlyLimitReachedError,
  settleBookingCreateDomain,
} from "@voyant-travel/bookings/booking-create-command-domain"
import {
  type BookingDraftMismatch,
  type PricingAssignmentUnit,
  verifyBookingDraft,
} from "@voyant-travel/bookings/pricing-assignment"
import type { Booking, BookingGroupMember, BookingTraveler } from "@voyant-travel/bookings/schema"
import {
  bookingActivityLog,
  bookingItems,
  bookingItemTravelers,
  bookings,
  bookingTravelers,
} from "@voyant-travel/bookings/schema"
import { bookingStatusSchema } from "@voyant-travel/bookings/validation"
import { withBookingFinanceInsertionFence } from "@voyant-travel/db"
import { and, asc, eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import * as rrulePackage from "rrule"
import { z } from "zod"

import type {
  BookingPaymentSchedule,
  Invoice,
  Payment,
  TravelCredit,
  TravelCreditRedemption,
} from "./schema.js"
import { bookingItemTaxLines, bookingPaymentSchedules, travelCredits } from "./schema.js"
import { type FinanceServiceRuntime, financeService, toRows } from "./service.js"
import { TravelCreditServiceError, travelCreditsService } from "./service-travel-credits.js"
import {
  paymentMethodSchema,
  paymentScheduleStatusSchema,
  paymentScheduleTypeSchema,
} from "./validation-shared.js"

// ---------- validation ----------

const travelerInputSchema = z.object({
  clientTravelerKey: z
    .string()
    .min(1)
    .max(255)
    .optional()
    .nullable()
    .describe(
      "Stable key for this traveler within the request. Use the same key in exactly one room itemLine.travelerKeys entry to assign the traveler to that room.",
    ),
  firstName: z.string().min(1).max(255),
  lastName: z.string().min(1).max(255),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  personId: z.string().optional().nullable(),
  participantType: z.enum(["traveler", "occupant", "other"]).default("traveler"),
  travelerCategory: z.enum(["adult", "child", "infant", "senior", "other"]).optional().nullable(),
  preferredLanguage: z.string().max(35).optional().nullable(),
  specialRequests: z.string().optional().nullable(),
  isPrimary: z.boolean().optional().nullable(),
  notes: z.string().optional().nullable(),
})

const paymentScheduleInputSchema = z.object({
  scheduleType: paymentScheduleTypeSchema.default("balance"),
  status: paymentScheduleStatusSchema.default("pending"),
  dueDate: z.string().min(1),
  currency: z.string().min(3).max(3),
  amountCents: z.number().int().min(0),
  notes: z.string().optional().nullable(),
})

const documentGenerationInputSchema = z
  .object({
    contractDocument: z.boolean().default(false),
    invoiceDocument: z.boolean().default(false),
    /**
     * Kind of invoice to issue when `invoiceDocument` is true. Defaults
     * to a final `invoice`; pass `proforma` for the placeholder used in
     * pre-payment flows (operator dashboard's "Generate proforma"
     * shortcut on the new-booking dialog).
     */
    invoiceType: z.enum(["invoice", "proforma"]).default("invoice"),
  })
  .default({ contractDocument: false, invoiceDocument: false, invoiceType: "invoice" })

const itemLineInputSchema = z.object({
  /**
   * Stable client-side key (e.g. `unit:optu_adult`). Server stamps
   * this into `booking_items.metadata.bookingCreateLineKey` so the
   * post-insert pass can look up the row and link it to travelers
   * via `booking_item_travelers`. See voyant-travel/voyant#1267.
   */
  clientLineKey: z.string().min(1).max(255).optional().nullable(),
  optionUnitId: z
    .string()
    .min(1)
    .describe(
      "Selected product option-unit id. Resolve valid room or person units with `list_option_units` for the chosen option.",
    ),
  quantity: z
    .number()
    .int()
    .min(1)
    .describe(
      "Number of this unit selected. For a room unit this is the number of rooms, not the number of travelers.",
    ),
  title: z.string().min(1).max(255).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  unitSellAmountCents: z.number().int().min(0).optional().nullable(),
  totalSellAmountCents: z.number().int().min(0).optional().nullable(),
  /**
   * Stable traveler keys this item applies to. Server inserts one
   * `booking_item_travelers` row per traveler.
   */
  travelerKeys: z
    .array(z.string().min(1).max(255))
    .optional()
    .nullable()
    .describe(
      "clientTravelerKey values assigned to this room or priced unit. For accommodation, assign every traveler to exactly one selected room and respect room occupancy.",
    ),
})

const extraLineInputSchema = z.object({
  clientLineKey: z.string().min(1).max(255).optional().nullable(),
  productExtraId: z.string().min(1),
  optionExtraConfigId: z.string().min(1).optional().nullable(),
  name: z.string().min(1).max(255),
  description: z.string().max(5000).optional().nullable(),
  pricingMode: z.string().max(50).optional().nullable(),
  pricedPerPerson: z.boolean().optional().nullable(),
  quantity: z.number().int().min(1),
  sellCurrency: z.string().length(3),
  unitSellAmountCents: z.number().int().min(0).optional().nullable(),
  totalSellAmountCents: z.number().int().min(0).optional().nullable(),
  travelerKeys: z.array(z.string().min(1).max(255)).optional().nullable(),
})

const taxLineInputSchema = z.object({
  code: z.string().optional().nullable(),
  name: z.string().min(1),
  jurisdiction: z.string().optional().nullable(),
  scope: z.enum(["included", "excluded", "withheld"]).optional(),
  currency: z.string().length(3),
  amountCents: z.number().int(),
  rateBasisPoints: z.number().int().optional().nullable(),
  includedInPrice: z.boolean().optional(),
  remittanceParty: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
})

const travelCreditRedemptionInputSchema = z.object({
  travelCreditId: z.string().min(1),
  amountCents: z.number().int().min(1),
})

const groupJoinSchema = z.object({
  action: z.literal("join"),
  groupId: z.string().min(1),
  role: z.enum(["primary", "shared"]).default("shared"),
})

const groupCreateSchema = z.object({
  action: z.literal("create"),
  kind: z.enum(["shared_room", "other"]).default("shared_room"),
  label: z.string().max(255).optional().nullable(),
  optionUnitId: z.string().optional().nullable(),
  /**
   * When true (the default), the freshly-created booking becomes the group's
   * primary booking. Operators creating a dual-booking can set this false and
   * supply a different primaryBookingId — not wired in this slice, but the
   * field is reserved.
   */
  makeBookingPrimary: z.boolean().default(true),
})

const groupMembershipInputSchema = z.discriminatedUnion("action", [
  groupJoinSchema,
  groupCreateSchema,
])

const placeholderEmails = new Set([
  "noreply@example.com",
  "tbd@example.com",
  "traveler@example.com",
])

function requirePriceOverrideReason(
  value: {
    catalogSellAmountCents?: number | null
    confirmedSellAmountCents?: number | null
    priceOverrideReason?: string | null
  },
  ctx: z.RefinementCtx,
) {
  if (value.confirmedSellAmountCents == null) return
  if (value.catalogSellAmountCents === value.confirmedSellAmountCents) return
  if (value.priceOverrideReason) return

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["priceOverrideReason"],
    message:
      "A price override reason is required when the confirmed total differs from catalog pricing",
  })
}

function requireCompleteBookingParty(
  value: {
    personId?: string | null
    organizationId?: string | null
    contactFirstName?: string | null
    contactLastName?: string | null
    contactEmail?: string | null
    contactPhone?: string | null
    travelers?: Array<{
      firstName: string
      lastName: string
      email?: string | null
      personId?: string | null
    }>
  },
  ctx: z.RefinementCtx,
) {
  if (!value.personId && !value.organizationId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["personId"],
      // Names the fields, so a Tool caller that hit this can fix the call
      // rather than retrying it unchanged. "Select…" reads as dialog copy and
      // gives an agent nothing to act on.
      message:
        "A booking needs a billing party: set personId (or organizationId for a company booking).",
    })
  }

  if (value.personId) {
    if (!value.contactFirstName?.trim() || !value.contactLastName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contactFirstName"],
        message: "Billing person requires first and last name",
      })
    }
    const hasRealEmail = isRealEmail(value.contactEmail)
    const hasPhone = Boolean(value.contactPhone?.trim())

    if (value.contactEmail && !hasRealEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contactEmail"],
        message: "Billing email cannot be a placeholder address",
      })
    }
    if (!hasRealEmail && !hasPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contactEmail"],
        message: "Billing person requires an email or phone number",
      })
    }
  } else if (value.contactEmail && !isRealEmail(value.contactEmail)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["contactEmail"],
      message: "Billing email cannot be a placeholder address",
    })
  }

  if (!value.travelers || value.travelers.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["travelers"],
      message: "Add at least one traveler",
    })
  }

  value.travelers?.forEach((traveler, index) => {
    if (!traveler.personId && (!traveler.firstName.trim() || !traveler.lastName.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["travelers", index],
        message: "Traveler requires a name or person record",
      })
    }
    if (traveler.email && !isRealEmail(traveler.email)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["travelers", index, "email"],
        message: "Traveler email cannot be a placeholder address",
      })
    }
  })
}

function findDuplicateClientTravelerKeys(
  travelers: readonly { clientTravelerKey?: string | null }[] | null | undefined,
): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const traveler of travelers ?? []) {
    const key = traveler.clientTravelerKey?.trim()
    if (!key) continue
    if (seen.has(key)) duplicates.add(key)
    else seen.add(key)
  }
  return [...duplicates]
}

function requireUniqueClientTravelerKeys(
  value: { travelers?: Array<{ clientTravelerKey?: string | null }> },
  ctx: z.RefinementCtx,
) {
  for (const duplicateKey of findDuplicateClientTravelerKeys(value.travelers)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["travelers"],
      message: `Duplicate clientTravelerKey: ${duplicateKey}`,
    })
  }
}

function requireKnownTravelerKeys(
  value: {
    travelers?: Array<{ clientTravelerKey?: string | null }>
    itemLines?: Array<{ travelerKeys?: string[] | null }>
    extraLines?: Array<{ travelerKeys?: string[] | null }>
  },
  ctx: z.RefinementCtx,
) {
  const knownKeys = new Set(
    (value.travelers ?? [])
      .map((traveler) => traveler.clientTravelerKey?.trim())
      .filter((key): key is string => Boolean(key)),
  )
  const checkLines = (
    field: "itemLines" | "extraLines",
    lines: Array<{ travelerKeys?: string[] | null }> | undefined,
  ) => {
    lines?.forEach((line, lineIndex) => {
      line.travelerKeys?.forEach((travelerKey, keyIndex) => {
        const key = travelerKey.trim()
        if (!key || knownKeys.has(key)) return
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field, lineIndex, "travelerKeys", keyIndex],
          message: `Unknown travelerKey: ${key}`,
        })
      })
    })
  }

  checkLines("itemLines", value.itemLines)
  checkLines("extraLines", value.extraLines)
}

function isRealEmail(value: string | null | undefined): value is string {
  const normalized = value?.trim().toLowerCase() ?? ""
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) && !placeholderEmails.has(normalized)
}

const bookingCreateBaseSchema = z.object({
  // Convert-product fields (mirrors convertProductSchema in bookings)
  productId: z.string().min(1),
  optionId: z
    .string()
    .optional()
    .nullable()
    .describe(
      "Chosen product option id. Resolve it with `list_product_options`; supply it explicitly when the product has rooms or multiple options.",
    ),
  slotId: z.string().optional().nullable(),
  /** Pre-booking availability hold converted inside the create transaction. */
  availabilityHoldToken: z.string().min(1).optional(),
  /**
   * Immutable booking reference and idempotency anchor for the durable create.
   * Allocate it with `generate_booking_number` (or `allocateBookingNumber`) and
   * replay the same value on retries — a fresh reference mints a second booking.
   */
  bookingNumber: z
    .string()
    .min(1)
    .describe(
      "Booking reference allocated by `generate_booking_number`. Never invent one and never derive it from traveller or client details. Pass the same value again when retrying the same create.",
    ),
  /**
   * Who is billed. At least one of `personId` / `organizationId` is required.
   *
   * Both are structurally optional because either satisfies the requirement, so
   * the JSON Schema a Tool caller reads cannot express "one of these". Without
   * these descriptions an agent sees two optional fields, omits both, and gets
   * a validation error it had no way to predict from the contract — then
   * retries the same call. Same failure mode `bookingNumber` above documents.
   *
   * Deliberately "at least one", not "exactly one": both may be set for a
   * traveller billed to their company, and `createBookingMutation` stores both.
   */
  personId: z
    .string()
    .optional()
    .nullable()
    .describe(
      "Id of the person billed for this booking. Required unless `organizationId` is set — a booking needs a billing party. Resolve it with `list_people`, or create the client first with `create_person`. May be combined with `organizationId` when a person is billed through their company.",
    ),
  organizationId: z
    .string()
    .optional()
    .nullable()
    .describe(
      "Id of the organization billed for this booking, for a company or agency booking. Required unless `personId` is set — a booking needs a billing party. Resolve it with `list_organizations`, or create it first with `create_organization`.",
    ),
  pax: z
    .number()
    .int()
    .positive()
    .optional()
    .nullable()
    .describe(
      "Total traveler count. This must match the travelers array and selected room capacity.",
    ),
  internalNotes: z.string().optional().nullable(),
  /**
   * Override the seed `sellAmountCents` on the new booking + line item.
   * Threads through domain settlement so promotion-discounted quotes land at
   * the discounted amount instead of the product's list price.
   */
  sellAmountCentsOverride: z.number().int().min(0).optional().nullable(),
  catalogSellAmountCents: z.number().int().min(0).optional().nullable(),
  confirmedSellAmountCents: z.number().int().min(0).optional().nullable(),
  priceOverrideReason: z.string().trim().min(1).max(1000).optional().nullable(),
  manualPriceOverride: z
    .object({
      amountCents: z
        .number()
        .int()
        .min(0)
        .describe("Exact manual booking total in minor currency units."),
      reason: z
        .string()
        .trim()
        .min(1)
        .max(1000)
        .describe("Audit reason for overriding the persisted catalog price."),
    })
    .optional()
    .describe(
      "Current-request manual price override. Omit this object to book at the persisted catalog price.",
    ),

  /**
   * Initial lifecycle status to seat the booking in — defaults to `draft`.
   * Lets the dialog commit straight to `confirmed` or `awaiting_payment`
   * in the same transaction, avoiding the post-create `/override-status`
   * roundtrip that previously occasionally raced the create's COMMIT.
   *
   * When set to `confirmed`, the orchestrator emits `booking.confirmed`
   * post-commit so notification + document-bundle subscribers fire just
   * like they would for an after-the-fact transition.
   */
  initialStatus: bookingStatusSchema.optional(),
  /**
   * When true and `initialStatus === "confirmed"`, the post-commit
   * `booking.confirmed` event carries `suppressNotifications: true` so
   * downstream subscribers skip customer-facing email + document
   * bundles. Operators can confirm a booking silently this way.
   */
  suppressNotifications: z.boolean().optional(),
  /**
   * Explicit operator override for same billing party + departure creates.
   * Defaults to guarded behavior so retries and concurrent double-submit
   * attempts return a structured duplicate signal instead of minting another
   * active booking.
   */
  allowDuplicate: z.boolean().optional(),
  // Billing-contact snapshot — captured at create time. Caller (the
  // dialog) reads the linked CRM person/org and supplies what it
  // knows; domain settlement writes everything through to the booking row's
  // contact_* columns.
  contactFirstName: z.string().max(255).optional().nullable(),
  contactLastName: z.string().max(255).optional().nullable(),
  contactPartyType: z.enum(["individual", "company"]).optional().nullable(),
  contactTaxId: z.string().max(100).optional().nullable(),
  contactEmail: z.string().max(255).optional().nullable(),
  contactPhone: z.string().max(50).optional().nullable(),
  contactPreferredLanguage: z.string().max(35).optional().nullable(),
  contactCountry: z.string().max(2).optional().nullable(),
  contactRegion: z.string().max(100).optional().nullable(),
  contactCity: z.string().max(100).optional().nullable(),
  contactAddressLine1: z.string().max(500).optional().nullable(),
  contactAddressLine2: z.string().max(500).optional().nullable(),
  contactPostalCode: z.string().max(20).optional().nullable(),

  // Orchestration fields
  travelers: z
    .array(travelerInputSchema)
    .optional()
    .describe("Travelers on the booking. Give each one a unique clientTravelerKey."),
  itemLines: z
    .array(itemLineInputSchema)
    .optional()
    .describe(
      "Explicit selected rooms or priced units. Required for room products: quantity is room count, and travelerKeys assigns travelers to each room type.",
    ),
  extraLines: z.array(extraLineInputSchema).optional(),
  taxLines: z.array(taxLineInputSchema).optional(),
  paymentSchedules: z.array(paymentScheduleInputSchema).optional(),
  travelCreditRedemption: travelCreditRedemptionInputSchema.optional(),
  groupMembership: groupMembershipInputSchema.optional(),
  documentGeneration: documentGenerationInputSchema.optional(),
})

export const bookingCreateSchema = bookingCreateBaseSchema
  .superRefine(requirePriceOverrideReason)
  .superRefine(requireCompleteBookingParty)
  .superRefine(requireUniqueClientTravelerKeys)
  .superRefine(requireKnownTravelerKeys)

export const bookingCreateToolSchema = bookingCreateBaseSchema
  .omit({
    sellAmountCentsOverride: true,
    catalogSellAmountCents: true,
    confirmedSellAmountCents: true,
    priceOverrideReason: true,
  })
  .extend({
    itemLines: z
      .array(itemLineInputSchema.omit({ unitSellAmountCents: true, totalSellAmountCents: true }))
      .optional()
      .describe(
        "Explicit selected rooms or priced units. Required for room products: quantity is room count, and travelerKeys assigns travelers to each room type.",
      ),
    extraLines: z
      .array(extraLineInputSchema.omit({ unitSellAmountCents: true, totalSellAmountCents: true }))
      .optional(),
  })
  .superRefine(requireCompleteBookingParty)
  .superRefine(requireUniqueClientTravelerKeys)
  .superRefine(requireKnownTravelerKeys)

export type BookingCreateInput = z.infer<typeof bookingCreateSchema>
type BookingCreatePaymentScheduleInput = NonNullable<BookingCreateInput["paymentSchedules"]>[number]
export type BookingCreateTravelerInput = z.infer<typeof travelerInputSchema>

// ---------- result shape ----------

export interface BookingCreateResult {
  booking: Booking
  travelers: BookingTraveler[]
  paymentSchedules: BookingPaymentSchedule[]
  travelCreditRedemption: {
    travelCredit: TravelCredit
    redemption: TravelCreditRedemption
  } | null
  groupMembership: {
    groupId: string
    member: BookingGroupMember
  } | null
  invoice: Invoice | null
  invoiceDocument:
    | { status: "requested"; renditionId: string | null }
    | { status: "generated"; renditionId: string }
    | { status: "not_requested" | "not_available" | "failed" }
  payments: Payment[]
}

export interface BookingCreateValidationIssue {
  path: Array<string | number>
  message: string
}

export type BookingCreateOutcome =
  | { status: "ok"; result: BookingCreateResult }
  | { status: "invalid_payment_schedules"; issues: BookingCreateValidationIssue[] }
  | { status: "invalid_tax_lines"; issues: BookingCreateValidationIssue[] }
  | { status: "invalid_pricing"; issues: BookingCreateValidationIssue[] }
  | { status: "payload_resolver_mismatch"; mismatches: BookingDraftMismatch[] }
  | {
      status: "room_occupancy_insufficient"
      pax: number
      occupancyMax: number
      shortfall: number
    }
  | { status: "duplicate_booking"; existingBooking: DuplicateBookingMatch }
  | {
      status: "booking_items_unresolved"
      productId: string
      optionId: string | null
      candidateUnitCount: number
      message: string
    }
  | {
      status: "monthly_booking_limit_reached"
      limit: number
      current: number
      periodStart: string
      periodEnd: string
      message: string
    }
  | { status: "product_not_found" }
  | { status: "travel_credit_not_found" }
  | { status: "travel_credit_inactive" }
  | { status: "travel_credit_not_started" }
  | { status: "travel_credit_expired" }
  | { status: "travel_credit_insufficient_balance" }
  | { status: "group_not_found" }
  | { status: "booking_already_in_group"; currentGroupId: string }

// ---------- service ----------

/**
 * Atomic booking-create orchestrator. Runs product conversion + travelers +
 * payment schedules + travel credit redemption + group membership inside a single
 * transaction so partial failures (e.g. travel credit insufficient-balance after
 * schedules have been written) roll the whole thing back. This mutation primitive
 * accepts only the transaction leased by the durable created-target command.
 *
 * Why the orchestrator lives in `@voyant-travel/finance`: finance already imports
 * from `@voyant-travel/bookings` (invoices-from-bookings, travel credit service, payment
 * schedules all sit here), so this is the one place that can compose the
 * three packages without creating a new workspace dependency cycle.
 */
/**
 * Sentinel thrown inside the tx to force drizzle to roll back. Returning a
 * non-ok result from the tx callback doesn't abort the tx — only a thrown
 * error does — so the orchestrator uses this to unwind cleanly when a
 * downstream step discovers a precondition failure.
 */
class BookingCreateAbort extends Error {
  constructor(readonly outcome: Exclude<BookingCreateOutcome, { status: "ok" }>) {
    super(`create aborted: ${outcome.status}`)
    this.name = "BookingCreateAbort"
  }
}

/**
 * The domain refuses to create a booking that would hold nothing. Translate that
 * into the create outcome union so the caller gets the actionable reason instead
 * of an opaque throw.
 */
async function settleBookingCreateWithItemGuard(
  ...args: Parameters<typeof settleBookingCreateDomain>
): Promise<Awaited<ReturnType<typeof settleBookingCreateDomain>>> {
  try {
    return await settleBookingCreateDomain(...args)
  } catch (error) {
    if (error instanceof BookingMonthlyLimitReachedError) {
      throw new BookingCreateAbort({
        status: error.code,
        ...error.details,
        message: error.message,
      })
    }
    if (error instanceof BookingItemsUnresolvedError) {
      throw new BookingCreateAbort({
        status: "booking_items_unresolved",
        productId: error.productId,
        optionId: error.optionId,
        candidateUnitCount: error.candidateUnitCount,
        message: error.message,
      })
    }
    throw error
  }
}

class BookingCreateValidationError extends Error {
  constructor(
    readonly code: "payload_resolver_mismatch",
    readonly mismatches: BookingDraftMismatch[],
  ) {
    super(code)
    this.name = "BookingCreateValidationError"
  }
}

export interface DuplicateBookingMatch {
  id: string
  bookingNumber: string
  status: string
}

type BookingCreateProductOptionUnit = PricingAssignmentUnit & {
  occupancyMax?: number | null
  isRequired?: boolean | null
  minQuantity?: number | null
  sortOrder?: number | null
  optionIsDefault?: boolean | null
  optionSortOrder?: number | null
  optionCreatedAt?: Date | string | null
}

interface AlreadyPaidScheduleMetadata {
  alreadyPaid?: boolean
  paymentDate?: string | null
  paymentMethod?: string | null
  paymentReference?: string | null
}

function parseAlreadyPaidScheduleMetadata(notes: string | null | undefined) {
  if (!notes) return null
  try {
    const parsed = JSON.parse(notes) as AlreadyPaidScheduleMetadata
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}

function isAlreadyPaidSchedule(schedule: BookingCreatePaymentScheduleInput) {
  const metadata = parseAlreadyPaidScheduleMetadata(schedule.notes)
  return schedule.status === "paid" || metadata?.alreadyPaid === true
}

function hasExplicitPaymentDate(metadata: AlreadyPaidScheduleMetadata | null): boolean {
  return typeof metadata?.paymentDate === "string" && metadata.paymentDate.trim().length > 0
}

function duplicateBookingGuardKey(input: BookingCreateInput) {
  if (!input.slotId) return null
  if (input.personId) return `booking-create:person:${input.personId}:slot:${input.slotId}`
  if (input.organizationId) {
    return `booking-create:organization:${input.organizationId}:slot:${input.slotId}`
  }
  return null
}

async function findDuplicateBookingForCreate(
  tx: PostgresJsDatabase,
  input: BookingCreateInput,
): Promise<DuplicateBookingMatch | null> {
  const guardKey = duplicateBookingGuardKey(input)
  if (!guardKey || input.allowDuplicate) return null

  // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${guardKey}, 0))`)

  const partyCondition = input.personId
    ? // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      sql`b.person_id = ${input.personId}`
    : // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      sql`b.organization_id = ${input.organizationId}`

  const rows = await tx.execute(sql`
    SELECT
      b.id AS "id",
      b.booking_number AS "bookingNumber",
      b.status AS "status"
    FROM bookings b
    WHERE b.status NOT IN ('cancelled', 'expired')
      AND ${partyCondition}
      AND EXISTS (
        SELECT 1
        FROM booking_items bi
        WHERE bi.booking_id = b.id
          AND bi.availability_slot_id = ${input.slotId}
      )
    ORDER BY b.created_at ASC
    LIMIT 1
  `)

  return toRows<DuplicateBookingMatch>(rows)[0] ?? null
}

/**
 * Load the option_unit catalog for a product so the resolver can
 * verify the submitted itemLines server-side. Raw SQL because
 * `option_units` lives in `@voyant-travel/inventory` and finance doesn't
 * depend on it directly — adding a runtime dependency for a log-only
 * sanity check would be overkill.
 */
async function loadProductOptionUnits(
  tx: PostgresJsDatabase,
  productId: string,
): Promise<BookingCreateProductOptionUnit[]> {
  const result = await tx.execute(sql`
    SELECT
      ou.id          AS "optionUnitId",
      ou.option_id   AS "optionId",
      ou.name        AS "unitName",
      ou.code        AS "unitCode",
      ou.min_age     AS "minAge",
      ou.max_age     AS "maxAge",
      ou.unit_type   AS "unitType",
      ou.occupancy_max AS "occupancyMax",
      ou.is_required AS "isRequired",
      ou.min_quantity AS "minQuantity",
      ou.sort_order AS "sortOrder",
      po.is_default AS "optionIsDefault",
      po.sort_order AS "optionSortOrder",
      po.created_at AS "optionCreatedAt"
    FROM option_units ou
    JOIN product_options po ON po.id = ou.option_id
    WHERE po.product_id = ${productId}
  `)
  return toRows<BookingCreateProductOptionUnit>(result).map((row) => ({
    optionId: row.optionId ?? null,
    optionUnitId: row.optionUnitId,
    unitName: row.unitName,
    unitCode: row.unitCode ?? null,
    minAge: row.minAge ?? null,
    maxAge: row.maxAge ?? null,
    unitType: row.unitType ?? null,
    occupancyMax: row.occupancyMax ?? null,
    isRequired: row.isRequired ?? null,
    minQuantity: row.minQuantity ?? null,
    sortOrder: row.sortOrder ?? null,
    optionIsDefault: row.optionIsDefault ?? null,
    optionSortOrder: row.optionSortOrder ?? null,
    optionCreatedAt: row.optionCreatedAt ?? null,
  }))
}

function isInventoryOptionUnit(unit: PricingAssignmentUnit): boolean {
  return unit.unitType === "room" || unit.unitType === "vehicle"
}

function isPersonOptionUnit(unit: PricingAssignmentUnit): boolean {
  return unit.unitType == null || unit.unitType === "person"
}

function normalizeAccommodationItemLinesToInventoryUnits(options: {
  itemLines: NonNullable<BookingCreateInput["itemLines"]> | undefined
  units: readonly BookingCreateProductOptionUnit[]
}): NonNullable<BookingCreateInput["itemLines"]> | undefined {
  if (!options.itemLines?.length || options.units.length === 0) return options.itemLines

  const unitsByOption = new Map<string, PricingAssignmentUnit[]>()
  const unitById = new Map<string, PricingAssignmentUnit>()
  const unitToPrimaryInventory = new Map<string, PricingAssignmentUnit>()
  for (const unit of options.units) {
    const optionKey = unit.optionId ?? unit.optionUnitId
    unitById.set(unit.optionUnitId, unit)
    const optionUnits = unitsByOption.get(optionKey)
    if (optionUnits) optionUnits.push(unit)
    else unitsByOption.set(optionKey, [unit])
  }

  for (const optionUnits of unitsByOption.values()) {
    const primaryInventory = optionUnits.find(isInventoryOptionUnit)
    if (!primaryInventory) continue
    for (const unit of optionUnits) {
      unitToPrimaryInventory.set(unit.optionUnitId, primaryInventory)
    }
  }

  return options.itemLines.map((line) => {
    const submittedUnit = unitById.get(line.optionUnitId)
    const targetInventory = unitToPrimaryInventory.get(line.optionUnitId)
    if (!submittedUnit || !targetInventory) return line
    if (isInventoryOptionUnit(submittedUnit) || !isPersonOptionUnit(submittedUnit)) return line
    return {
      ...line,
      optionUnitId: targetInventory.optionUnitId,
    }
  })
}

function resolveDefaultOptionId(units: readonly BookingCreateProductOptionUnit[]): string | null {
  const optionIds = [...new Set(units.map((unit) => unit.optionId).filter(Boolean))]
  if (optionIds.length === 0) return null

  const optionRows = optionIds.map((optionId) => {
    const firstUnit = units.find((unit) => unit.optionId === optionId)
    return {
      optionId,
      isDefault: firstUnit?.optionIsDefault === true,
      sortOrder: firstUnit?.optionSortOrder ?? 0,
      createdAt: firstUnit?.optionCreatedAt ? new Date(firstUnit.optionCreatedAt).getTime() : 0,
    }
  })

  optionRows.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.createdAt - b.createdAt
  })

  return optionRows[0]?.optionId ?? null
}

function defaultSeedItemQuantity(unit: BookingCreateProductOptionUnit, pax: number | null): number {
  if (unit.unitType === "person" && pax) return pax
  return unit.minQuantity && unit.minQuantity > 0 ? unit.minQuantity : 1
}

function roomOccupancyMaxForCreate(unit: BookingCreateProductOptionUnit): number {
  return Math.max(1, unit.occupancyMax ?? 1)
}

function selectedRoomOccupancyMaxForCreate(options: {
  itemLines: NonNullable<BookingCreateInput["itemLines"]> | undefined
  units: readonly BookingCreateProductOptionUnit[]
  optionId?: string | null
  pax: number | null
}): number | null {
  const roomUnits = options.units.filter((unit) => unit.unitType === "room")
  if (roomUnits.length === 0) return null

  const unitById = new Map(options.units.map((unit) => [unit.optionUnitId, unit]))
  if (options.itemLines?.length) {
    const referencedOptionIds = new Set(
      options.itemLines
        .map((line) => unitById.get(line.optionUnitId)?.optionId ?? null)
        .filter((optionId): optionId is string => Boolean(optionId)),
    )
    const relevantRoomUnits = roomUnits.filter(
      (unit) => unit.optionId && referencedOptionIds.has(unit.optionId),
    )
    if (relevantRoomUnits.length === 0) return null

    return options.itemLines.reduce((total, line) => {
      const unit = unitById.get(line.optionUnitId)
      if (unit?.unitType !== "room") return total
      return total + roomOccupancyMaxForCreate(unit) * line.quantity
    }, 0)
  }

  const selectedOptionId = options.optionId ?? resolveDefaultOptionId(options.units)
  const selectedUnits =
    selectedOptionId === null
      ? []
      : options.units.filter((unit) => unit.optionId === selectedOptionId)
  if (!selectedUnits.some((unit) => unit.unitType === "room")) return null

  const unitsToSeed = selectedUnits.some((unit) => unit.isRequired)
    ? selectedUnits.filter((unit) => unit.isRequired)
    : selectedUnits.length === 1
      ? selectedUnits
      : []

  return unitsToSeed.reduce((total, unit) => {
    if (unit.unitType !== "room") return total
    return total + roomOccupancyMaxForCreate(unit) * defaultSeedItemQuantity(unit, options.pax)
  }, 0)
}

function validateRoomOccupancyForCreate(options: {
  itemLines: NonNullable<BookingCreateInput["itemLines"]> | undefined
  units: readonly BookingCreateProductOptionUnit[]
  optionId?: string | null
  pax: number | null
}): Exclude<BookingCreateOutcome, { status: "ok" }> | null {
  if (!options.pax || options.pax <= 0) return null

  const occupancyMax = selectedRoomOccupancyMaxForCreate(options)
  if (occupancyMax === null || occupancyMax >= options.pax) return null

  return {
    status: "room_occupancy_insufficient",
    pax: options.pax,
    occupancyMax,
    shortfall: options.pax - occupancyMax,
  }
}

function hasResolverRejectionSignals(input: {
  travelers: NonNullable<BookingCreateInput["travelers"]>
  itemLines: NonNullable<BookingCreateInput["itemLines"]>
}) {
  const hasTravelerLinks = (line: NonNullable<BookingCreateInput["itemLines"]>[number]) =>
    Array.isArray(line.travelerKeys) && line.travelerKeys.length > 0

  return (
    input.travelers.every(
      (traveler) =>
        traveler.travelerCategory === "adult" ||
        traveler.travelerCategory === "child" ||
        traveler.travelerCategory === "infant",
    ) && input.itemLines.every(hasTravelerLinks)
  )
}

/**
 * Re-runs `resolveBookingDraft` against the submitted payload and
 * rejects mismatches between submitted itemLines quantities and
 * what the resolver would derive when the request carries the
 * traveler band + line assignment metadata the verifier needs.
 */
async function verifyBookingCreatePayload(tx: PostgresJsDatabase, input: BookingCreateInput) {
  const itemLines = input.itemLines ?? []
  const travelers = input.travelers ?? []
  if (itemLines.length === 0 || travelers.length === 0) return

  const units = await loadProductOptionUnits(tx, input.productId)
  const verification = verifyBookingDraft({
    travelers,
    itemLines,
    units,
  })

  if (!verification.ok) {
    if (!hasResolverRejectionSignals({ travelers, itemLines })) {
      console.warn(
        `[finance-booking-create] payload drift skipped hard rejection for product=${input.productId}`,
        JSON.stringify(verification.mismatches),
      )
      return
    }
    throw new BookingCreateValidationError("payload_resolver_mismatch", verification.mismatches)
  }
}

function uniqueTravelerKeys(keys: readonly string[] | null | undefined): string[] {
  if (!keys?.length) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const key of keys) {
    const normalized = key.trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

/**
 * Look up each `booking_item` the converter inserted by its stamped
 * `metadata.bookingCreateLineKey`, then write one
 * `booking_item_travelers` row per requested traveler. Idempotent —
 * dedupes by `(item_id, traveler_id)` and skips when the lookup
 * fails (e.g. the converter didn't create an item for that key).
 *
 * The metadata-key bridge lets the wire-format `clientLineKey` thread
 * through the create flow without forcing the converter to return a
 * map back to the orchestrator. See voyant-travel/voyant#1267.
 */
async function linkBookingCreateItemsToTravelers(
  tx: PostgresJsDatabase,
  bookingId: string,
  travelers: readonly BookingTraveler[],
  travelerInputs: readonly Pick<BookingCreateTravelerInput, "clientTravelerKey">[],
  lines: ReadonlyArray<{
    clientLineKey?: string | null
    travelerKeys?: readonly string[] | null
  }>,
) {
  if (travelers.length === 0 || lines.length === 0) return
  const duplicateTravelerKeys = findDuplicateClientTravelerKeys(travelerInputs)
  if (duplicateTravelerKeys.length > 0) {
    throw new Error(`Duplicate clientTravelerKey: ${duplicateTravelerKeys.join(", ")}`)
  }

  type RequestedTravelerLink = {
    clientLineKey: string | null
    travelerKey: string | null
    traveler: BookingTraveler | null
  }

  const travelerByClientKey = new Map<string, BookingTraveler>()
  for (const [index, travelerInput] of travelerInputs.entries()) {
    const key = travelerInput.clientTravelerKey?.trim()
    const traveler = travelers[index]
    if (key && traveler && !travelerByClientKey.has(key)) travelerByClientKey.set(key, traveler)
  }

  const requestedLinks: RequestedTravelerLink[] = []
  for (const line of lines) {
    const travelerKeys = uniqueTravelerKeys(line.travelerKeys)
    if (travelerKeys.length > 0) {
      for (const travelerKey of travelerKeys) {
        requestedLinks.push({
          clientLineKey: line.clientLineKey ?? null,
          travelerKey,
          traveler: travelerByClientKey.get(travelerKey) ?? null,
        })
      }
    }
  }
  if (requestedLinks.length === 0) return

  const itemRows = await tx.select().from(bookingItems).where(eq(bookingItems.bookingId, bookingId))
  const itemByClientLineKey = new Map<string, (typeof itemRows)[number]>()
  for (const item of itemRows) {
    const key = (item.metadata as { bookingCreateLineKey?: unknown } | null | undefined)
      ?.bookingCreateLineKey
    if (typeof key === "string") itemByClientLineKey.set(key, item)
  }

  const seen = new Set<string>()
  const unknownTravelerKeys = requestedLinks
    .filter((link) => link.travelerKey && !link.traveler)
    .map((link) => link.travelerKey)
    .filter((key): key is string => Boolean(key))
  if (unknownTravelerKeys.length > 0) {
    throw new Error(`Unknown travelerKey: ${unknownTravelerKeys.join(", ")}`)
  }

  const linkRows = requestedLinks.flatMap(({ clientLineKey, traveler }) => {
    if (!clientLineKey) return []
    const item = itemByClientLineKey.get(clientLineKey)
    if (!item || !traveler) return []
    const dedupeKey = `${item.id}:${traveler.id}`
    if (seen.has(dedupeKey)) return []
    seen.add(dedupeKey)
    return [
      {
        bookingItemId: item.id,
        travelerId: traveler.id,
        role: "traveler" as const,
        isPrimary: traveler.isPrimary,
      },
    ]
  })

  if (linkRows.length > 0) {
    await tx.insert(bookingItemTravelers).values(linkRows)
  }
}

async function persistBookingCreateTaxLines(
  tx: PostgresJsDatabase,
  bookingId: string,
  taxLines: BookingCreateInput["taxLines"],
) {
  if (!taxLines?.length) return
  const items = await tx
    .select({
      id: bookingItems.id,
      totalSellAmountCents: bookingItems.totalSellAmountCents,
    })
    .from(bookingItems)
    .where(eq(bookingItems.bookingId, bookingId))
    .orderBy(asc(bookingItems.createdAt))
  if (items.length === 0) return

  const totalCents = items.reduce((sum, item) => sum + (item.totalSellAmountCents ?? 0), 0)
  const rows = taxLines.flatMap((taxLine) =>
    distributeBookingCreateTaxLine(taxLine.amountCents, items, totalCents).map(
      ({ itemId, amountCents }) => ({
        bookingItemId: itemId,
        code: taxLine.code ?? null,
        name: taxLine.name,
        jurisdiction: taxLine.jurisdiction ?? null,
        scope: taxLine.scope ?? (taxLine.includedInPrice ? "included" : "excluded"),
        currency: taxLine.currency,
        amountCents,
        rateBasisPoints: taxLine.rateBasisPoints ?? null,
        includedInPrice: taxLine.includedInPrice ?? taxLine.scope === "included",
        remittanceParty: taxLine.remittanceParty ?? null,
        sortOrder: taxLine.sortOrder ?? 0,
      }),
    ),
  )
  if (rows.length > 0) await tx.insert(bookingItemTaxLines).values(rows)
}

function distributeBookingCreateTaxLine(
  amountCents: number,
  items: Array<{ id: string; totalSellAmountCents: number | null }>,
  totalCents: number,
) {
  if (items.length === 1 || totalCents <= 0) {
    return [{ itemId: items[0]!.id, amountCents }]
  }
  let remaining = amountCents
  return items.map((item, index) => {
    const amount =
      index === items.length - 1
        ? remaining
        : Math.round(amountCents * ((item.totalSellAmountCents ?? 0) / totalCents))
    remaining -= amount
    return { itemId: item.id, amountCents: amount }
  })
}

function validatePaymentSchedules(
  input: BookingCreateInput,
  booking: Booking,
): BookingCreateValidationIssue[] {
  const schedules = input.paymentSchedules ?? []
  if (schedules.length === 0) return []

  const issues: BookingCreateValidationIssue[] = []
  const expectedCurrency = booking.sellCurrency

  schedules.forEach((schedule, index) => {
    if (schedule.currency !== expectedCurrency) {
      issues.push({
        path: ["paymentSchedules", index, "currency"],
        message: `paymentSchedules[${index}].currency must equal the booking's sellCurrency (${expectedCurrency}); got ${schedule.currency}`,
      })
    }

    if (isAlreadyPaidSchedule(schedule)) {
      const metadata = parseAlreadyPaidScheduleMetadata(schedule.notes)
      if (!hasExplicitPaymentDate(metadata)) {
        issues.push({
          path: ["paymentSchedules", index, "notes", "paymentDate"],
          message: `paymentSchedules[${index}] marked paid requires notes.paymentDate`,
        })
      }
    }
  })

  if (typeof booking.sellAmountCents === "number") {
    const sum = schedules.reduce((total, schedule) => total + schedule.amountCents, 0)
    if (sum !== booking.sellAmountCents) {
      issues.push({
        path: ["paymentSchedules"],
        message: `paymentSchedules amountCents sum (${sum}) must equal the persisted booking total (${booking.sellAmountCents})`,
      })
    }
  }

  return issues
}

async function reconcileBookingCreatePricing(
  tx: PostgresJsDatabase,
  booking: Booking,
  input: BookingCreateInput,
  userId?: string,
): Promise<{ booking: Booking; issues: BookingCreateValidationIssue[] }> {
  const items = await tx
    .select({
      id: bookingItems.id,
      itemType: bookingItems.itemType,
      optionId: bookingItems.optionId,
      optionUnitId: bookingItems.optionUnitId,
      quantity: bookingItems.quantity,
      metadata: bookingItems.metadata,
    })
    .from(bookingItems)
    .where(eq(bookingItems.bookingId, booking.id))
    .orderBy(asc(bookingItems.createdAt), asc(bookingItems.id))
  if (items.length === 0) {
    return {
      booking,
      issues: [{ path: ["itemLines"], message: "A priced booking requires at least one item." }],
    }
  }

  const excludedTaxTotal = (input.taxLines ?? []).reduce((sum, taxLine) => {
    const included = taxLine.includedInPrice ?? taxLine.scope === "included"
    return taxLine.scope === "withheld" || included ? sum : sum + taxLine.amountCents
  }, 0)
  const includedTaxTotal = (input.taxLines ?? []).reduce((sum, taxLine) => {
    const included = taxLine.includedInPrice ?? taxLine.scope === "included"
    return taxLine.scope === "withheld" || !included ? sum : sum + taxLine.amountCents
  }, 0)

  const baseItems = items.filter((item) => item.itemType !== "extra")
  const extraItems = items.filter((item) => item.itemType === "extra")
  const selectedOptionId =
    input.optionId ?? baseItems.find((item) => item.optionId)?.optionId ?? null
  const persistedPricing = selectedOptionId
    ? await loadPersistedBookingCreatePricing(tx, {
        productId: input.productId,
        optionId: selectedOptionId,
        slotId: input.slotId ?? null,
      })
    : null

  const pricedLines = new Map<string, { unit: number; total: number }>()
  const chargedUnassignedRoomBands = new Set<string>()
  let baseCatalogTotal = 0
  let unresolvedBaseItems = 0
  // Commerce quotes apply the option-rule base once. The pricing mode
  // describes the rule, while only selected unit prices multiply by quantity.
  const ruleBaseTotal = persistedPricing?.baseSellAmountCents ?? 0
  let appliedRuleBase = ruleBaseTotal === 0
  for (const item of baseItems) {
    const unitRules =
      persistedPricing?.unitRules.filter((rule) => rule.unitId === item.optionUnitId) ?? []
    const quantity = Math.max(1, item.quantity)
    const flatUnitRules = unitRules.filter((rule) => rule.pricingCategoryId === null)
    const categoryRules = unitRules.filter((rule) => rule.pricingCategoryId !== null)
    if (categoryRules.length > 0) {
      const bandAllocation = bookingCreateTravelerBandCountsForItem(input, item, booking.pax)
      let categoryTotal = 0
      let matchedCategoryPrice = false
      const matchedBands = new Set<string>()
      for (const [band, bandQuantity] of bandAllocation.counts) {
        if (bandQuantity <= 0 || matchedBands.has(band)) continue
        const categoryRule = categoryRules.find(
          (rule) => rule.travelerCategory === band && unitRuleMatchesQuantity(rule, bandQuantity),
        )
        const rule =
          categoryRule ??
          flatUnitRules.find((candidate) => unitRuleMatchesQuantity(candidate, bandQuantity))
        if (!rule) {
          return {
            booking,
            issues: [
              {
                path: ["itemLines"],
                message: `Booking item ${item.optionUnitId ?? item.id} has no persisted price for traveler band ${band}.`,
              },
            ],
          }
        }
        if (
          !bandAllocation.scopedToItem &&
          rule.unitType === "room" &&
          chargedUnassignedRoomBands.has(band)
        ) {
          // Public inventory quotes apply an unassigned traveler band once at
          // booking level, regardless of how many room selections carry it.
          // This repeated room line is valid, but already priced.
          matchedCategoryPrice = true
          matchedBands.add(band)
          continue
        }
        const departureAmount = item.optionUnitId
          ? persistedPricing?.departureOverrides.get(item.optionUnitId)
          : undefined
        const chargeQuantity = ["included", "free"].includes(rule.pricingMode)
          ? 0
          : rule.pricingMode === "per_booking"
            ? 1
            : bandQuantity
        const amount =
          departureAmount ??
          selectPersistedUnitAmount(rule, persistedPricing?.tiers ?? [], bandQuantity)
        if (amount == null && chargeQuantity > 0) {
          return {
            booking,
            issues: [
              {
                path: ["itemLines"],
                message: `Booking item ${item.optionUnitId ?? item.id} has no active persisted price for traveler band ${band}.`,
              },
            ],
          }
        }
        matchedCategoryPrice = true
        matchedBands.add(band)
        categoryTotal += (amount ?? 0) * chargeQuantity
        if (!bandAllocation.scopedToItem && rule.unitType === "room") {
          chargedUnassignedRoomBands.add(band)
        }
      }
      if (!matchedCategoryPrice) {
        return {
          booking,
          issues: [
            {
              path: ["itemLines"],
              message: `Booking item ${item.optionUnitId ?? item.id} has no persisted category price matching its traveler band and quantity.`,
            },
          ],
        }
      }
      pricedLines.set(item.id, {
        unit: Math.floor(categoryTotal / quantity),
        total: categoryTotal,
      })
      baseCatalogTotal += categoryTotal
      continue
    }
    const unitRule = flatUnitRules.find((rule) => unitRuleMatchesQuantity(rule, quantity))
    const chargeQuantity = persistedFlatUnitChargeQuantity(unitRule?.pricingMode, quantity)
    const departureAmount = item.optionUnitId
      ? persistedPricing?.departureOverrides.get(item.optionUnitId)
      : undefined
    const unitAmount =
      departureAmount ??
      selectPersistedUnitAmount(unitRule, persistedPricing?.tiers ?? [], quantity)
    const flatUnitPrice = resolvePersistedFlatUnitPriceForBookingCreate({
      matchedRule: Boolean(unitRule),
      pricingMode: unitRule?.pricingMode,
      unitAmount,
      chargeQuantity,
    })
    if (flatUnitPrice.status === "priced") {
      pricedLines.set(item.id, {
        unit: flatUnitPrice.unitAmountCents,
        total: flatUnitPrice.totalAmountCents,
      })
      baseCatalogTotal += flatUnitPrice.totalAmountCents
      continue
    }
    if (flatUnitPrice.status === "invalid") {
      return {
        booking,
        issues: [
          {
            path: ["itemLines"],
            message: `Booking item ${item.optionUnitId ?? item.id} has no active persisted price rule.`,
          },
        ],
      }
    }
    if (!appliedRuleBase && persistedPricing?.baseSellAmountCents != null) {
      const total = ruleBaseTotal
      pricedLines.set(item.id, {
        unit: Math.floor(total / quantity),
        total,
      })
      baseCatalogTotal += total
      appliedRuleBase = true
      continue
    }
    unresolvedBaseItems += 1
  }
  if (!appliedRuleBase && baseItems.length > 0) {
    const firstBaseItem = baseItems[0]!
    const existing = pricedLines.get(firstBaseItem.id) ?? { unit: 0, total: 0 }
    const quantity = Math.max(1, firstBaseItem.quantity)
    const total = existing.total + ruleBaseTotal
    pricedLines.set(firstBaseItem.id, {
      unit: Math.floor(total / quantity),
      total,
    })
    baseCatalogTotal += ruleBaseTotal
  }

  if (unresolvedBaseItems > 0) {
    const fallbackCatalogTotal =
      booking.priceOverride?.originalAmountCents ?? booking.sellAmountCents ?? 0
    const fallbackTotal = Math.max(0, fallbackCatalogTotal - baseCatalogTotal)
    distributeBookingCreateTotal(
      baseItems.filter((item) => !pricedLines.has(item.id)),
      fallbackTotal,
      pricedLines,
    )
    baseCatalogTotal += fallbackTotal
  }

  let extrasCatalogTotal = 0
  for (const item of extraItems) {
    const metadata = (item.metadata ?? {}) as Record<string, unknown>
    const productExtraId =
      typeof metadata.productExtraId === "string" ? metadata.productExtraId : null
    const optionExtraConfigId =
      typeof metadata.optionExtraConfigId === "string" ? metadata.optionExtraConfigId : null
    const extra = productExtraId
      ? await loadPersistedExtraPricing(tx, {
          productId: input.productId,
          optionId: selectedOptionId,
          productExtraId,
          optionExtraConfigId,
          optionPriceRuleId: persistedPricing?.ruleId ?? null,
        })
      : null
    if (!extra) {
      return {
        booking,
        issues: [
          {
            path: ["extraLines"],
            message: `Booking extra ${productExtraId ?? item.id} is not an active persisted catalog extra.`,
          },
        ],
      }
    }
    const pricingMode = extra.pricingMode
    if (pricingMode === "unavailable") {
      return {
        booking,
        issues: [
          {
            path: ["extraLines"],
            message: `Booking extra ${productExtraId} is unavailable and cannot be booked.`,
          },
        ],
      }
    }
    const quantity =
      pricingMode === "per_person" || extra.pricedPerPerson
        ? resolveAssignedExtraQuantity(input, item)
        : Math.max(1, item.quantity)
    const chargeQuantity = pricingMode === "per_booking" ? 1 : quantity
    const unitAmount = extra.sellAmountCents ?? 0
    if (
      extra.sellAmountCents == null &&
      !["included", "free", "on_request"].includes(pricingMode)
    ) {
      return {
        booking,
        issues: [
          {
            path: ["extraLines"],
            message: `Booking extra ${productExtraId} has no active persisted price rule.`,
          },
        ],
      }
    }
    const total = ["included", "free", "on_request"].includes(pricingMode)
      ? 0
      : unitAmount * chargeQuantity
    const persistedUnitAmount = Math.floor(total / quantity)
    pricedLines.set(item.id, { unit: persistedUnitAmount, total })
    if (quantity !== item.quantity) {
      await tx
        .update(bookingItems)
        .set({
          quantity,
          unitSellAmountCents: persistedUnitAmount,
          totalSellAmountCents: total,
        })
        .where(eq(bookingItems.id, item.id))
    }
    extrasCatalogTotal += total
  }

  const catalogTotal = baseCatalogTotal + extrasCatalogTotal + excludedTaxTotal
  const reasonedLegacyOverride =
    input.confirmedSellAmountCents != null && input.priceOverrideReason
      ? {
          amountCents: input.confirmedSellAmountCents,
          reason: input.priceOverrideReason,
        }
      : null
  const requestedTotal =
    input.manualPriceOverride?.amountCents ??
    reasonedLegacyOverride?.amountCents ??
    input.sellAmountCentsOverride ??
    catalogTotal
  const baseRequestedTotal = requestedTotal - extrasCatalogTotal - excludedTaxTotal
  if (baseRequestedTotal < 0 || includedTaxTotal > baseRequestedTotal) {
    return {
      booking,
      issues: [
        {
          path: ["taxLines"],
          message: `Tax and extra lines cannot be reconciled to the persisted booking total (${requestedTotal}).`,
        },
      ],
    }
  }

  if (baseRequestedTotal !== baseCatalogTotal) {
    distributeBookingCreateTotal(baseItems, baseRequestedTotal, pricedLines)
  }

  const pricingCurrency = persistedPricing?.currencyCode ?? booking.sellCurrency
  for (const item of items) {
    const price = pricedLines.get(item.id) ?? { unit: 0, total: 0 }
    await tx
      .update(bookingItems)
      .set({
        sellCurrency: pricingCurrency,
        unitSellAmountCents: price.unit,
        totalSellAmountCents: price.total,
        updatedAt: new Date(),
      })
      .where(eq(bookingItems.id, item.id))
  }

  const manualOverride = input.manualPriceOverride ?? reasonedLegacyOverride
  await tx
    .delete(bookingActivityLog)
    .where(
      and(
        eq(bookingActivityLog.bookingId, booking.id),
        eq(bookingActivityLog.description, "Booking sell total manually overridden during create"),
      ),
    )
  const finalPriceOverride =
    manualOverride && manualOverride.amountCents !== catalogTotal
      ? {
          isManual: true as const,
          originalAmountCents: catalogTotal,
          overriddenAmountCents: manualOverride.amountCents,
          currency: pricingCurrency,
          reason: manualOverride.reason,
          overriddenBy: userId ?? "system",
          overriddenAt: new Date().toISOString(),
        }
      : null
  const [updatedBooking] = await tx
    .update(bookings)
    .set({
      sellAmountCents: requestedTotal,
      sellCurrency: pricingCurrency,
      priceOverride: finalPriceOverride,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, booking.id))
    .returning()
  if (finalPriceOverride) {
    await tx.insert(bookingActivityLog).values({
      bookingId: booking.id,
      actorId: userId ?? "system",
      activityType: "system_action",
      description: "Booking sell total manually overridden during create",
      metadata: { kind: "booking_price_overridden", ...finalPriceOverride },
    })
  }
  return {
    booking: updatedBooking ?? {
      ...booking,
      sellAmountCents: requestedTotal,
      sellCurrency: pricingCurrency,
    },
    issues: [],
  }
}

type PersistedUnitPriceRule = {
  id: string
  unitId: string
  unitType: string | null
  pricingMode: string
  pricingCategoryId: string | null
  travelerCategory: string | null
  sellAmountCents: number | null
  minQuantity: number | null
  maxQuantity: number | null
}

type PersistedUnitPriceTier = {
  optionUnitPriceRuleId: string
  minQuantity: number
  maxQuantity: number | null
  sellAmountCents: number | null
  sortOrder: number
}

type PersistedPriceRuleCandidate = {
  id: string
  name: string
  pricingMode: string
  baseSellAmountCents: number | null
  priceCatalogId: string
  isDefault: boolean
  priceScheduleId: string | null
  scheduleActive: boolean | null
  schedulePriority: number | null
  recurrenceRule: string | null
  validFrom: string | null
  validTo: string | null
  weekdays: string[] | null
}

type RRulePackage = typeof import("rrule")
type RRulePackageCompat = RRulePackage & { default?: RRulePackage; rrule?: RRulePackage }
const rrulePackageCompat = rrulePackage as RRulePackageCompat
const { rrulestr } =
  rrulePackageCompat.rrulestr != null
    ? rrulePackageCompat
    : (rrulePackageCompat.default ?? rrulePackageCompat.rrule ?? rrulePackageCompat)

const PRICE_WEEKDAY_TOKENS = [
  ["SU", "sunday", "sun", "0", "7"],
  ["MO", "monday", "mon", "1"],
  ["TU", "tuesday", "tue", "2"],
  ["WE", "wednesday", "wed", "3"],
  ["TH", "thursday", "thu", "4"],
  ["FR", "friday", "fri", "5"],
  ["SA", "saturday", "sat", "6"],
] as const

const PRICE_WEEKDAY_CODES = PRICE_WEEKDAY_TOKENS.map(([code]) => code)

function normalizePriceScheduleWeekdayToken(token: string): string | null {
  const normalized = token.trim().toLowerCase()
  if (!normalized) return null
  for (const [code, ...aliases] of PRICE_WEEKDAY_TOKENS) {
    if (code.toLowerCase() === normalized || aliases.some((alias) => alias === normalized)) {
      return code
    }
  }
  return null
}

function persistedScheduleMatchesDate(rule: PersistedPriceRuleCandidate, isoDate: string) {
  if (!rule.priceScheduleId || rule.scheduleActive !== true || rule.recurrenceRule == null) {
    return false
  }
  if (rule.validFrom && isoDate < rule.validFrom) return false
  if (rule.validTo && isoDate > rule.validTo) return false
  const date = new Date(`${isoDate}T00:00:00Z`)
  const weekday = PRICE_WEEKDAY_CODES[date.getUTCDay()] ?? "MO"
  if (rule.weekdays?.length) {
    const weekdays = new Set(
      rule.weekdays
        .map((day) => normalizePriceScheduleWeekdayToken(day))
        .filter((day): day is string => day !== null),
    )
    if (!weekdays.has(weekday)) return false
  }

  const recurrence = rule.recurrenceRule.trim()
  if (recurrence === "") return true
  const anchor = rule.validFrom ?? "2000-01-01"
  const dtstart = `${anchor.replace(/-/g, "")}T000000Z`
  const hasDtstart = /(?:^|\n)DTSTART[:;]/.test(recurrence)
  const hasRrule = /(?:^|\n)RRULE[:;]/.test(recurrence)
  const body = hasRrule ? recurrence : `RRULE:${recurrence}`
  const fullRule = hasDtstart ? body : `DTSTART:${dtstart}\n${body}`
  try {
    const parsed = rrulestr(fullRule)
    const end = new Date(date.getTime() + 24 * 60 * 60 * 1000)
    return parsed
      .between(date, end, true)
      .some((value) => value.toISOString().slice(0, 10) === isoDate)
  } catch {
    return false
  }
}

function selectPersistedPriceRule(rules: PersistedPriceRuleCandidate[], slotDate: string | null) {
  const scheduled = slotDate
    ? rules
        .filter((rule) => persistedScheduleMatchesDate(rule, slotDate))
        .sort(
          (left, right) =>
            (right.schedulePriority ?? 0) - (left.schedulePriority ?? 0) ||
            Number(right.isDefault) - Number(left.isDefault) ||
            left.name.localeCompare(right.name),
        )
    : []
  if (scheduled[0]) return scheduled[0]
  return rules
    .filter((rule) => rule.priceScheduleId === null && rule.isDefault)
    .sort((left, right) => left.name.localeCompare(right.name))[0]
}

async function loadPersistedBookingCreatePricing(
  tx: PostgresJsDatabase,
  input: { productId: string; optionId: string; slotId: string | null },
) {
  const [catalog] = toRows<{ id: string; currencyCode: string | null }>(
    await tx.execute(sql`
      SELECT id, currency_code AS "currencyCode"
      FROM price_catalogs
      WHERE active = true
        AND catalog_type = 'public'
      ORDER BY is_default DESC, name ASC
      LIMIT 1
    `),
  )
  if (!catalog) return null
  const [slot] = input.slotId
    ? toRows<{ dateLocal: string }>(
        await tx.execute(sql`
          SELECT date_local AS "dateLocal"
          FROM availability_slots
          WHERE id = ${input.slotId}
            AND product_id = ${input.productId}
            AND (option_id IS NULL OR option_id = ${input.optionId})
          LIMIT 1
        `),
      )
    : []
  const candidates = toRows<PersistedPriceRuleCandidate>(
    await tx.execute(sql`
      SELECT
        opr.id,
        opr.name,
        opr.pricing_mode AS "pricingMode",
        opr.base_sell_amount_cents AS "baseSellAmountCents",
        opr.price_catalog_id AS "priceCatalogId",
        opr.is_default AS "isDefault",
        opr.price_schedule_id AS "priceScheduleId",
        ps.active AS "scheduleActive",
        ps.priority AS "schedulePriority",
        ps.recurrence_rule AS "recurrenceRule",
        ps.valid_from::text AS "validFrom",
        ps.valid_to::text AS "validTo",
        ps.weekdays
      FROM option_price_rules opr
      LEFT JOIN price_schedules ps ON ps.id = opr.price_schedule_id
      WHERE opr.product_id = ${input.productId}
        AND opr.option_id = ${input.optionId}
        AND opr.price_catalog_id = ${catalog.id}
        AND opr.active = true
    `),
  )
  const rule = selectPersistedPriceRule(candidates, slot?.dateLocal ?? null)
  if (!rule) return null

  const unitRules = toRows<PersistedUnitPriceRule>(
    await tx.execute(sql`
      SELECT
        oupr.id,
        oupr.unit_id AS "unitId",
        ou.unit_type AS "unitType",
        oupr.pricing_mode AS "pricingMode",
        oupr.pricing_category_id AS "pricingCategoryId",
        pc.category_type::text AS "travelerCategory",
        oupr.sell_amount_cents AS "sellAmountCents",
        oupr.min_quantity AS "minQuantity",
        oupr.max_quantity AS "maxQuantity"
      FROM option_unit_price_rules oupr
      JOIN option_units ou
        ON ou.id = oupr.unit_id
      LEFT JOIN pricing_categories pc
        ON pc.id = oupr.pricing_category_id
      WHERE oupr.option_price_rule_id = ${rule.id}
        AND oupr.active = true
      ORDER BY oupr.sort_order ASC, oupr.created_at ASC
    `),
  )
  const tiers = toRows<PersistedUnitPriceTier>(
    await tx.execute(sql`
      SELECT
        option_unit_price_rule_id AS "optionUnitPriceRuleId",
        min_quantity AS "minQuantity",
        max_quantity AS "maxQuantity",
        sell_amount_cents AS "sellAmountCents",
        sort_order AS "sortOrder"
      FROM option_unit_tiers
      WHERE option_unit_price_rule_id IN (
        SELECT id FROM option_unit_price_rules
        WHERE option_price_rule_id = ${rule.id} AND active = true
      )
        AND active = true
      ORDER BY sort_order ASC, min_quantity ASC
    `),
  )
  const departureOverrides = new Map<string, number>()
  if (input.slotId) {
    const overrides = toRows<{ optionUnitId: string; sellAmountCents: number }>(
      await tx.execute(sql`
        SELECT
          option_unit_id AS "optionUnitId",
          sell_amount_cents AS "sellAmountCents"
        FROM departure_price_overrides
        WHERE departure_id = ${input.slotId}
          AND option_id = ${input.optionId}
          AND price_catalog_id = ${rule.priceCatalogId}
          AND active = true
      `),
    )
    for (const override of overrides) {
      departureOverrides.set(override.optionUnitId, override.sellAmountCents)
    }
  }
  return {
    ...rule,
    unitRules,
    tiers,
    departureOverrides,
    ruleId: rule.id,
    currencyCode: catalog.currencyCode ?? null,
  }
}

function bookingCreateTravelerBandCounts(input: BookingCreateInput, bookingPax: number | null) {
  const counts = new Map<string, number>()
  for (const traveler of input.travelers ?? []) {
    const band = traveler.travelerCategory ?? "adult"
    if (!["adult", "child", "infant", "senior", "other"].includes(band)) continue
    counts.set(band, (counts.get(band) ?? 0) + 1)
  }
  if (counts.size === 0 && bookingPax && bookingPax > 0) counts.set("adult", bookingPax)
  return counts
}

function bookingCreateTravelerBandCountsForItem(
  input: BookingCreateInput,
  item: { optionUnitId: string | null; metadata: unknown },
  bookingPax: number | null,
) {
  const lineKey = (item.metadata as { bookingCreateLineKey?: unknown } | null | undefined)
    ?.bookingCreateLineKey
  const matchingLines = (input.itemLines ?? []).filter((line) =>
    typeof lineKey === "string"
      ? line.clientLineKey === lineKey
      : line.optionUnitId === item.optionUnitId,
  )
  const line = matchingLines.length === 1 ? matchingLines[0] : undefined
  const travelerKeys = uniqueTravelerKeys(line?.travelerKeys)
  if (travelerKeys.length === 0) {
    return {
      counts: bookingCreateTravelerBandCounts(input, bookingPax),
      scopedToItem: false,
    }
  }

  const travelersByKey = new Map(
    (input.travelers ?? []).flatMap((traveler) => {
      const key = traveler.clientTravelerKey?.trim()
      return key ? [[key, traveler] as const] : []
    }),
  )
  const counts = new Map<string, number>()
  for (const travelerKey of travelerKeys) {
    const band = travelersByKey.get(travelerKey)?.travelerCategory ?? "adult"
    if (!["adult", "child", "infant", "senior", "other"].includes(band)) continue
    counts.set(band, (counts.get(band) ?? 0) + 1)
  }
  return { counts, scopedToItem: true }
}

function unitRuleMatchesQuantity(rule: PersistedUnitPriceRule, quantity: number) {
  return (
    (rule.minQuantity == null || quantity >= rule.minQuantity) &&
    (rule.maxQuantity == null || quantity <= rule.maxQuantity)
  )
}

function persistedFlatUnitChargeQuantity(pricingMode: string | null | undefined, quantity: number) {
  if (pricingMode === "per_person") return quantity
  if (pricingMode === "per_booking") return 1
  return quantity
}

function resolveAssignedExtraQuantity(
  input: BookingCreateInput,
  item: { quantity: number; metadata: unknown },
) {
  const metadata = (item.metadata ?? {}) as Record<string, unknown>
  const lineKey =
    typeof metadata.bookingCreateLineKey === "string" ? metadata.bookingCreateLineKey : null
  const productExtraId =
    typeof metadata.productExtraId === "string" ? metadata.productExtraId : null
  const matchingLines = (input.extraLines ?? []).filter((line) =>
    lineKey
      ? line.clientLineKey === lineKey
      : productExtraId !== null && line.productExtraId === productExtraId,
  )
  const line = matchingLines.length === 1 ? matchingLines[0] : undefined
  const assignedQuantity = uniqueTravelerKeys(line?.travelerKeys).length
  return assignedQuantity > 0 ? assignedQuantity : Math.max(1, item.quantity)
}

export function resolvePersistedFlatUnitPriceForBookingCreate(input: {
  matchedRule: boolean
  pricingMode: string | null | undefined
  unitAmount: number | null
  chargeQuantity: number
}):
  | { status: "priced"; unitAmountCents: number; totalAmountCents: number }
  | { status: "invalid" }
  | { status: "unpriced" } {
  if (input.pricingMode === "included" || input.pricingMode === "free") {
    return { status: "priced", unitAmountCents: input.unitAmount ?? 0, totalAmountCents: 0 }
  }
  if (input.pricingMode === "on_request" || input.unitAmount == null) {
    return input.matchedRule ? { status: "invalid" } : { status: "unpriced" }
  }
  return {
    status: "priced",
    unitAmountCents: input.unitAmount,
    totalAmountCents: input.unitAmount * input.chargeQuantity,
  }
}

function selectPersistedUnitAmount(
  rule: PersistedUnitPriceRule | undefined,
  tiers: readonly PersistedUnitPriceTier[],
  quantity: number,
) {
  if (!rule) return null
  const tier = tiers.find(
    (candidate) =>
      candidate.optionUnitPriceRuleId === rule.id &&
      quantity >= candidate.minQuantity &&
      (candidate.maxQuantity == null || quantity <= candidate.maxQuantity),
  )
  return tier?.sellAmountCents ?? rule.sellAmountCents
}

async function loadPersistedExtraPricing(
  tx: PostgresJsDatabase,
  input: {
    productId: string
    optionId: string | null
    productExtraId: string
    optionExtraConfigId: string | null
    optionPriceRuleId: string | null
  },
) {
  if (!input.optionId || !input.optionPriceRuleId) return null
  const [extra] = toRows<{
    pricingMode: string
    pricedPerPerson: boolean
    sellAmountCents: number | null
  }>(
    await tx.execute(sql`
      SELECT
        coalesce(epr.pricing_mode::text, oec.pricing_mode::text, pe.pricing_mode::text) AS "pricingMode",
        coalesce(oec.priced_per_person, pe.priced_per_person, false) AS "pricedPerPerson",
        epr.sell_amount_cents AS "sellAmountCents"
      FROM product_extras pe
      JOIN extra_price_rules epr
        ON epr.active = true
        AND epr.option_price_rule_id = ${input.optionPriceRuleId}
        AND epr.option_id = ${input.optionId}
        AND epr.product_extra_id = pe.id
      LEFT JOIN option_extra_configs oec
        ON oec.id = epr.option_extra_config_id
        AND oec.product_extra_id = pe.id
        AND oec.option_id = ${input.optionId}
        AND oec.active = true
      WHERE pe.id = ${input.productExtraId}
        AND pe.product_id = ${input.productId}
        AND pe.active = true
        AND (epr.option_extra_config_id IS NULL OR oec.id IS NOT NULL)
        AND (${input.optionExtraConfigId}::text IS NULL OR oec.id = ${input.optionExtraConfigId})
      ORDER BY epr.sort_order ASC, epr.created_at ASC
      LIMIT 1
    `),
  )
  return extra ?? null
}

function distributeBookingCreateTotal(
  items: ReadonlyArray<{ id: string; quantity: number }>,
  total: number,
  prices: Map<string, { unit: number; total: number }>,
) {
  if (items.length === 0) return
  const totalQuantity = items.reduce((sum, item) => sum + Math.max(1, item.quantity), 0)
  let remaining = total
  for (const [index, item] of items.entries()) {
    const quantity = Math.max(1, item.quantity)
    const lineTotal =
      index === items.length - 1 ? remaining : Math.floor((total * quantity) / totalQuantity)
    remaining -= lineTotal
    prices.set(item.id, { unit: Math.floor(lineTotal / quantity), total: lineTotal })
  }
}

function validateTaxLines(
  input: BookingCreateInput,
  booking: Booking,
): BookingCreateValidationIssue[] {
  const expectedCurrency = booking.sellCurrency
  return (input.taxLines ?? []).flatMap((taxLine, index) =>
    taxLine.currency === expectedCurrency
      ? []
      : [
          {
            path: ["taxLines", index, "currency"],
            message: `taxLines[${index}].currency must equal the booking's sellCurrency (${expectedCurrency}); got ${taxLine.currency}`,
          },
        ],
  )
}

function bookingItemStatusForInitialStatus(
  status: BookingCreateInput["initialStatus"] | undefined,
): "draft" | "on_hold" | "confirmed" | "cancelled" | "expired" | "fulfilled" {
  if (status === "on_hold") return "on_hold"
  if (status === "cancelled") return "cancelled"
  if (status === "expired") return "expired"
  if (status === "completed") return "fulfilled"
  if (status === "confirmed" || status === "awaiting_payment" || status === "in_progress") {
    return "confirmed"
  }
  return "draft"
}

function generateInvoiceNumber(bookingNumber: string) {
  return `INV-${bookingNumber}`.slice(0, 50)
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

export function deriveBookingCreatePax(input: {
  pax?: number | null
  travelers?:
    | readonly {
        clientTravelerKey?: string | null
        participantType?: string | null
      }[]
    | null
  itemLines?: readonly { travelerKeys?: readonly string[] | null }[] | null
  extraLines?: readonly { travelerKeys?: readonly string[] | null }[] | null
}) {
  const travelerCount =
    input.travelers?.filter((traveler) =>
      [undefined, null, "traveler", "occupant"].includes(traveler.participantType),
    ).length ?? 0
  const assignedTravelerKeys = new Set(
    [...(input.itemLines ?? []), ...(input.extraLines ?? [])]
      .flatMap((line) => line.travelerKeys ?? [])
      .map((key) => key.trim())
      .filter(Boolean),
  )
  const derivedPax = Math.max(travelerCount, assignedTravelerKeys.size)
  const explicitPax = typeof input.pax === "number" ? input.pax : 0
  const pax = Math.max(explicitPax, derivedPax)
  return pax > 0 ? pax : null
}

export async function createBookingMutation(
  tx: PostgresJsDatabase,
  rawInput: BookingCreateInput,
  options: {
    commandIdempotencyKey: string
    lease: CreatedTargetMutationLease
    userId?: string
    runtime?: FinanceServiceRuntime
  },
): Promise<BookingCreateOutcome> {
  const { commandIdempotencyKey, lease, runtime, userId } = options
  // Parse through the schema so defaults (makeBookingPrimary, role,
  // participantType, etc.) are applied even when callers bypass validation —
  // unit tests and hand-written integrations commonly do.
  const input = bookingCreateSchema.parse(rawInput)
  const documentGeneration = input.documentGeneration ?? {
    contractDocument: false,
    invoiceDocument: false,
    invoiceType: "invoice" as const,
  }
  const pax = deriveBookingCreatePax(input)

  // Validate the travel credit up-front so we can short-circuit before the tx starts.
  // This is a cheap read — the authoritative balance check still happens
  // inside the redeem savepoint so two concurrent redemptions can't double-
  // spend.
  if (input.travelCreditRedemption) {
    const [travelCredit] = await tx
      .select()
      .from(travelCredits)
      .where(eq(travelCredits.id, input.travelCreditRedemption.travelCreditId))
      .limit(1)
    if (!travelCredit) return { status: "travel_credit_not_found" }
    if (travelCredit.status !== "active") return { status: "travel_credit_inactive" }
    if (travelCredit.validFrom && travelCredit.validFrom.getTime() > Date.now()) {
      return { status: "travel_credit_not_started" }
    }
    if (travelCredit.expiresAt && travelCredit.expiresAt.getTime() < Date.now()) {
      return { status: "travel_credit_expired" }
    }
    if (input.travelCreditRedemption.amountCents > travelCredit.remainingAmountCents) {
      return { status: "travel_credit_insufficient_balance" }
    }
  }

  let result: BookingCreateResult
  try {
    result = await (async () => {
      const duplicateBooking = await findDuplicateBookingForCreate(tx, input)
      if (duplicateBooking) {
        throw new BookingCreateAbort({
          status: "duplicate_booking",
          existingBooking: duplicateBooking,
        })
      }

      const productOptionUnits = await loadProductOptionUnits(tx, input.productId)
      const normalizedItemLines = normalizeAccommodationItemLinesToInventoryUnits({
        itemLines: input.itemLines,
        units: productOptionUnits,
      })
      const roomOccupancyIssue = validateRoomOccupancyForCreate({
        itemLines: normalizedItemLines,
        units: productOptionUnits,
        optionId: input.optionId ?? null,
        pax,
      })
      if (roomOccupancyIssue) {
        throw new BookingCreateAbort(roomOccupancyIssue)
      }
      // 1. Booking from product
      let booking = await settleBookingCreateWithItemGuard(
        lease,
        tx,
        commandIdempotencyKey,
        {
          productId: input.productId,
          optionId: input.optionId ?? null,
          slotId: input.slotId ?? null,
          bookingNumber: input.bookingNumber,
          personId: input.personId ?? null,
          organizationId: input.organizationId ?? null,
          pax,
          internalNotes: input.internalNotes ?? null,
          sellAmountCentsOverride: input.sellAmountCentsOverride ?? null,
          catalogSellAmountCents: input.catalogSellAmountCents ?? null,
          confirmedSellAmountCents: input.confirmedSellAmountCents ?? null,
          priceOverrideReason: input.priceOverrideReason ?? null,
          manualPriceOverride: input.manualPriceOverride,
          initialStatus: input.initialStatus,
          suppressNotifications: input.suppressNotifications,
          contactFirstName: input.contactFirstName ?? null,
          contactLastName: input.contactLastName ?? null,
          contactPartyType: input.contactPartyType ?? null,
          contactTaxId: input.contactTaxId ?? null,
          contactEmail: input.contactEmail ?? null,
          contactPhone: input.contactPhone ?? null,
          contactPreferredLanguage: input.contactPreferredLanguage ?? null,
          contactCountry: input.contactCountry ?? null,
          contactRegion: input.contactRegion ?? null,
          contactCity: input.contactCity ?? null,
          contactAddressLine1: input.contactAddressLine1 ?? null,
          contactAddressLine2: input.contactAddressLine2 ?? null,
          contactPostalCode: input.contactPostalCode ?? null,
          itemLines: normalizedItemLines,
        },
        userId,
        {
          availabilityHoldToken: input.availabilityHoldToken,
          monthlyBookingLimit: runtime?.monthlyBookingLimit,
        },
      )
      if (!booking) {
        // Caller gave us a product that doesn't resolve. Throw so drizzle
        // rolls back any writes the convert helper may have made.
        throw new BookingCreateAbort({ status: "product_not_found" })
      }
      const bookingId = booking.id
      if (input.extraLines?.length) {
        await tx.insert(bookingItems).values(
          input.extraLines.map((line) => {
            const unitSellAmountCents = line.unitSellAmountCents ?? null
            const totalSellAmountCents =
              line.totalSellAmountCents ??
              (unitSellAmountCents == null ? null : unitSellAmountCents * line.quantity)
            return {
              bookingId,
              title: line.name,
              description: line.description ?? null,
              itemType: "extra" as const,
              status: bookingItemStatusForInitialStatus(input.initialStatus),
              quantity: line.quantity,
              sellCurrency: line.sellCurrency,
              unitSellAmountCents,
              totalSellAmountCents,
              costCurrency: null,
              unitCostAmountCents: null,
              totalCostAmountCents: null,
              productId: input.productId,
              optionId: input.optionId ?? null,
              optionUnitId: null,
              metadata: {
                productExtraId: line.productExtraId,
                optionExtraConfigId: line.optionExtraConfigId ?? null,
                pricingMode: line.pricingMode ?? null,
                pricedPerPerson: line.pricedPerPerson ?? null,
                // Mirror what the item-line converter does so
                // `linkBookingCreateItemsToTravelers` can look up
                // extra rows by clientLineKey and write
                // booking_item_travelers links for per-person
                // extras. See voyant-travel/voyant#1267.
                ...(line.clientLineKey ? { bookingCreateLineKey: line.clientLineKey } : {}),
              },
            }
          }),
        )
      }

      const pricing = await reconcileBookingCreatePricing(tx, booking, input, userId)
      if (pricing.issues.length > 0) {
        throw new BookingCreateAbort({ status: "invalid_pricing", issues: pricing.issues })
      }
      booking = pricing.booking
      const paymentScheduleIssues = validatePaymentSchedules(input, booking)
      if (paymentScheduleIssues.length > 0) {
        throw new BookingCreateAbort({
          status: "invalid_payment_schedules",
          issues: paymentScheduleIssues,
        })
      }
      const taxLineIssues = validateTaxLines(input, booking)
      if (taxLineIssues.length > 0) {
        throw new BookingCreateAbort({
          status: "invalid_tax_lines",
          issues: taxLineIssues,
        })
      }

      // 2. Travelers. Per-traveler item linkage is expressed through
      // `booking_item_travelers` rows linked from each `booking_item`.
      const travelers: BookingTraveler[] = []
      for (const traveler of input.travelers ?? []) {
        const [row] = await tx
          .insert(bookingTravelers)
          .values({
            bookingId: booking.id,
            personId: traveler.personId ?? null,
            participantType: traveler.participantType,
            travelerCategory: traveler.travelerCategory ?? null,
            firstName: traveler.firstName,
            lastName: traveler.lastName,
            email: traveler.email ?? null,
            phone: traveler.phone ?? null,
            preferredLanguage: traveler.preferredLanguage ?? null,
            specialRequests: traveler.specialRequests ?? null,
            isPrimary: traveler.isPrimary ?? false,
            notes: traveler.notes ?? null,
          })
          .returning()
        if (row) travelers.push(row)
      }

      // 2b. Link booking_items + extras to specific travelers when
      // the caller supplied `clientLineKey` + `travelerKeys` on any
      // line. Item rows were inserted earlier by the guarded booking domain
      // settlement; we look them up by
      // the `metadata.bookingCreateLineKey` the converter stamped.
      await linkBookingCreateItemsToTravelers(tx, booking.id, travelers, input.travelers ?? [], [
        ...(normalizedItemLines ?? []),
        ...(input.extraLines ?? []),
      ])

      // 2c. Re-run the resolver server-side against the submitted
      // itemLines + travelers and reject any client/server drift on
      // per-band quantities. See voyant-travel/voyant#1272.
      await verifyBookingCreatePayload(tx, { ...input, itemLines: normalizedItemLines })
      await persistBookingCreateTaxLines(tx, booking.id, input.taxLines)

      // 3. Payment schedules
      const paymentSchedules: BookingPaymentSchedule[] = []
      for (const schedule of input.paymentSchedules ?? []) {
        const [row] = await withBookingFinanceInsertionFence(tx, booking.id, (writer) =>
          writer
            .insert(bookingPaymentSchedules)
            .values({
              bookingId: booking.id,
              scheduleType: schedule.scheduleType,
              status: schedule.status,
              dueDate: schedule.dueDate,
              currency: schedule.currency,
              amountCents: schedule.amountCents,
              notes: schedule.notes ?? null,
            })
            .returning(),
        )
        if (row) paymentSchedules.push(row)
      }

      // 4. Travel credit redemption. Delegates to travelCreditsService so the balance
      // decrement + redemption-log insert share the savepoint. If anything
      // goes wrong (race with a concurrent redemption, mostly), the thrown
      // TravelCreditServiceError surfaces as the outcome below.
      let travelCreditRedemption: BookingCreateResult["travelCreditRedemption"] = null
      if (input.travelCreditRedemption) {
        const { travelCredit, redemption } = await travelCreditsService.redeem(
          tx,
          input.travelCreditRedemption.travelCreditId,
          {
            idempotencyKey: `booking:${booking.id}`,
            bookingId: booking.id,
            amountCents: input.travelCreditRedemption.amountCents,
          },
          userId,
        )
        if (redemption) {
          travelCreditRedemption = { travelCredit, redemption }
        }
      }

      // 5. Group membership (partaj). Either attach to an existing group or
      // spin up a new one with this booking as the primary.
      let groupMembership: BookingCreateResult["groupMembership"] = null
      if (input.groupMembership) {
        if (input.groupMembership.action === "create") {
          const group = await bookingGroupsService.createBookingGroup(tx, {
            kind: input.groupMembership.kind,
            label: input.groupMembership.label ?? `Shared — ${booking.bookingNumber}`,
            productId: input.productId,
            optionUnitId: input.groupMembership.optionUnitId ?? null,
            primaryBookingId: input.groupMembership.makeBookingPrimary ? booking.id : null,
          })
          const memberResult = await bookingGroupsService.addGroupMember(tx, group.id, {
            bookingId: booking.id,
            role: input.groupMembership.makeBookingPrimary ? "primary" : "shared",
          })
          if (memberResult.status !== "ok") {
            // Shouldn't happen — we just created both rows — but throw so
            // the tx rolls back instead of leaving a half-created group.
            throw new BookingCreateAbort({ status: "group_not_found" })
          }
          groupMembership = { groupId: group.id, member: memberResult.member }
        } else {
          const memberResult = await bookingGroupsService.addGroupMember(
            tx,
            input.groupMembership.groupId,
            {
              bookingId: booking.id,
              role: input.groupMembership.role,
            },
          )
          if (memberResult.status === "group_not_found") {
            throw new BookingCreateAbort({ status: "group_not_found" })
          }
          if (memberResult.status === "booking_not_found") {
            // Same booking we just inserted. Pg transaction visibility should
            // prevent this; surface as group_not_found for the caller — we
            // can't tell them the booking we created doesn't exist.
            throw new BookingCreateAbort({ status: "group_not_found" })
          }
          if (memberResult.status === "already_in_group") {
            throw new BookingCreateAbort({
              status: "booking_already_in_group",
              currentGroupId: memberResult.currentGroupId,
            })
          }
          groupMembership = {
            groupId: input.groupMembership.groupId,
            member: memberResult.member,
          }
        }
      }

      return {
        booking,
        travelers,
        paymentSchedules,
        travelCreditRedemption,
        groupMembership,
        invoice: null,
        invoiceDocument: { status: "not_requested" as const },
        payments: [],
      }
    })()
  } catch (error) {
    if (error instanceof BookingCreateAbort) {
      return error.outcome
    }
    if (error instanceof BookingCreateValidationError) {
      return { status: error.code, mismatches: error.mismatches }
    }
    if (error instanceof TravelCreditServiceError) {
      if (error.code === "travel_credit_not_found") return { status: "travel_credit_not_found" }
      if (error.code === "travel_credit_inactive") return { status: "travel_credit_inactive" }
      if (error.code === "travel_credit_not_started") return { status: "travel_credit_not_started" }
      if (error.code === "travel_credit_expired") return { status: "travel_credit_expired" }
      if (error.code === "travel_credit_insufficient_balance") {
        return { status: "travel_credit_insufficient_balance" }
      }
    }
    throw error
  }

  const paidSchedules = (input.paymentSchedules ?? []).filter(isAlreadyPaidSchedule)
  const shouldCreateInvoice = documentGeneration.invoiceDocument || paidSchedules.length > 0

  if (shouldCreateInvoice) {
    const items = await tx
      .select()
      .from(bookingItems)
      .where(eq(bookingItems.bookingId, result.booking.id))

    const issueDate = todayIsoDate()
    const dueDate =
      input.paymentSchedules?.find((schedule) => schedule.dueDate)?.dueDate ??
      result.booking.endDate ??
      issueDate
    const dueDatePaymentSchedule =
      result.paymentSchedules.find((schedule) => schedule.dueDate === dueDate) ?? null

    const invoice = await financeService.createInvoiceFromBooking(
      tx,
      {
        bookingId: result.booking.id,
        invoiceNumber: generateInvoiceNumber(result.booking.bookingNumber),
        issueDate,
        dueDate,
        invoiceType: documentGeneration.invoiceType,
        notes: "Generated from booking create.",
      },
      { booking: result.booking, dueDatePaymentSchedule, items },
      runtime,
    )

    result = {
      ...result,
      invoice,
    }

    if (invoice) {
      const payments: Payment[] = []
      for (const schedule of paidSchedules) {
        const metadata = parseAlreadyPaidScheduleMetadata(schedule.notes)
        const methodResult = paymentMethodSchema.safeParse(
          metadata?.paymentMethod ?? "bank_transfer",
        )
        const payment = await financeService.createPayment(tx, invoice.id, {
          amountCents: schedule.amountCents,
          currency: schedule.currency,
          paymentMethod: methodResult.success ? methodResult.data : "bank_transfer",
          status: "completed",
          referenceNumber: metadata?.paymentReference?.trim() || null,
          paymentDate: metadata?.paymentDate || schedule.dueDate || issueDate,
          notes: schedule.notes ?? null,
        })
        if (payment) payments.push(payment)
      }

      let invoiceDocument: BookingCreateResult["invoiceDocument"] = { status: "not_requested" }
      if (documentGeneration.invoiceDocument) {
        const requested = await financeService.renderInvoice(tx, invoice.id, { format: "pdf" })
        invoiceDocument =
          requested.status === "requested"
            ? { status: "requested", renditionId: requested.rendition?.id ?? null }
            : { status: "failed" }
      }

      result = {
        ...result,
        invoice: await financeService.getInvoiceById(tx, invoice.id),
        invoiceDocument,
        payments,
      }
    }
  }

  return { status: "ok", result }
}
