import { typeIdSchemas } from "@voyant-travel/schema-kit/typeid"
import { z } from "zod"

import { bookingSourceTypeSchema, bookingStatusSchema } from "./validation-shared.js"

// ---------- bookings ----------

const bookingDepositRuleSchema = z.object({
  kind: z.enum(["none", "percent", "fixed_cents"]),
  percent: z.number().min(0).max(100).optional(),
  amountCents: z.number().int().min(0).optional(),
})

export const bookingCustomerPaymentPolicySchema = z.object({
  deposit: bookingDepositRuleSchema,
  minDaysBeforeDepartureForDeposit: z.number().int().min(0),
  balanceDueDaysBeforeDeparture: z.number().int().min(0),
  balanceDueMinDaysFromNow: z.number().int().min(0),
})

export const bookingPriceOverrideSchema = z.object({
  isManual: z.literal(true),
  originalAmountCents: z.number().int().min(0).nullable(),
  overriddenAmountCents: z.number().int().min(0),
  currency: z.string().min(3).max(3),
  reason: z.string().trim().min(1).max(1000),
  overriddenBy: z.string().min(1),
  overriddenAt: z.string().datetime(),
})

const bookingBillingPersonIdSchema = typeIdSchemas.person.optional().nullable()
const bookingBillingOrganizationIdSchema = typeIdSchemas.organization.optional().nullable()

function validateExclusiveBillingParty(
  value: { personId?: string | null; organizationId?: string | null },
  ctx: z.RefinementCtx,
) {
  if (!value.personId || !value.organizationId) return

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["organizationId"],
    message: "Billing party must be either personId or organizationId, not both",
  })
}

const bookingCoreSchema = z.object({
  bookingNumber: z.string().min(1).max(50),
  status: bookingStatusSchema.default("draft"),
  personId: bookingBillingPersonIdSchema,
  organizationId: bookingBillingOrganizationIdSchema,
  sourceType: bookingSourceTypeSchema.default("manual"),
  externalBookingRef: z.string().optional().nullable(),
  communicationLanguage: z.string().max(35).optional().nullable(),
  contactFirstName: z.string().max(255).optional().nullable(),
  contactLastName: z.string().max(255).optional().nullable(),
  contactPartyType: z.enum(["individual", "company"]).optional().nullable(),
  contactTaxId: z.string().max(100).optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  contactPhone: z.string().max(50).optional().nullable(),
  contactPreferredLanguage: z.string().max(35).optional().nullable(),
  contactCountry: z.string().max(100).optional().nullable(),
  contactRegion: z.string().max(255).optional().nullable(),
  contactCity: z.string().max(255).optional().nullable(),
  contactAddressLine1: z.string().max(255).optional().nullable(),
  contactAddressLine2: z.string().max(255).optional().nullable(),
  contactPostalCode: z.string().max(50).optional().nullable(),
  sellCurrency: z.string().min(3).max(3),
  baseCurrency: z.string().min(3).max(3).optional().nullable(),
  sellAmountCents: z.number().int().min(0).optional().nullable(),
  baseSellAmountCents: z.number().int().min(0).optional().nullable(),
  costAmountCents: z.number().int().min(0).optional().nullable(),
  baseCostAmountCents: z.number().int().min(0).optional().nullable(),
  marginPercent: z.number().int().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  pax: z.number().int().positive().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
  notificationsSuppressed: z.boolean().optional(),
  customerPaymentPolicy: bookingCustomerPaymentPolicySchema.optional().nullable(),
  priceOverride: bookingPriceOverrideSchema.optional().nullable(),
  // Values are always `customFields[namespace][key]`; definitions and scalar
  // types are validated against the resolved registry at the write boundary.
  customFields: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  holdExpiresAt: z.string().datetime().optional().nullable(),
  confirmedAt: z.string().datetime().optional().nullable(),
  expiredAt: z.string().datetime().optional().nullable(),
  cancelledAt: z.string().datetime().optional().nullable(),
  completedAt: z.string().datetime().optional().nullable(),
  redeemedAt: z.string().datetime().optional().nullable(),
})

export const insertBookingSchema = bookingCoreSchema.superRefine(validateExclusiveBillingParty)
export const updateBookingSchema = bookingCoreSchema
  .partial()
  .superRefine(validateExclusiveBillingParty)

export const createBookingSchema = bookingCoreSchema
  .extend({
    sourceType: z.enum(["manual", "internal"]).default("manual"),
  })
  .refine((value) => value.status !== "on_hold", {
    message: "Use the reservation flow to create on-hold bookings",
    path: ["status"],
  })
  .refine((value) => value.holdExpiresAt == null, {
    message: "Use the reservation flow to manage booking hold expiry",
    path: ["holdExpiresAt"],
  })
  .superRefine(validateExclusiveBillingParty)

export const bookingListSortFieldSchema = z.enum([
  "bookingNumber",
  "status",
  "sellAmount",
  "pax",
  "startDate",
  "endDate",
  "createdAt",
])

export const bookingListSortDirSchema = z.enum(["asc", "desc"])

export const bookingListQuerySchema = z.object({
  status: bookingStatusSchema.optional(),
  /**
   * Statuses to omit from the result. Lets the operator list page hide
   * noise (draft + expired by default) without forcing a separate
   * endpoint. The wire format is a comma-separated string (e.g.
   * `?excludeStatuses=draft,expired`) — query parsing collapses
   * repeated keys, so a list has to ride on a single param. The
   * preprocess hook splits + trims; the union then validates each
   * entry against the enum.
   */
  excludeStatuses: z.preprocess((value) => {
    if (typeof value !== "string" || !value.includes(",")) return value
    return value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
  }, z.union([bookingStatusSchema, z.array(bookingStatusSchema)]).optional()),
  search: z.string().optional(),
  productId: z.string().optional(),
  optionId: z.string().optional(),
  /**
   * Filter to bookings whose items reference this availability slot
   * (post-0026, items carry `availability_slot_id` directly). Scoped
   * to a specific departure so the operator can answer "who's on this
   * 28-May 09:00 sailing?" from the list page.
   */
  availabilitySlotId: z.string().optional(),
  supplierId: z.string().optional(),
  productCategoryId: z.string().optional(),
  personId: z.string().optional(),
  organizationId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  paxMin: z.coerce.number().int().min(0).optional(),
  paxMax: z.coerce.number().int().min(0).optional(),
  sortBy: bookingListSortFieldSchema.default("createdAt"),
  sortDir: bookingListSortDirSchema.default("desc"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const bookingAggregatesQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  /**
   * Cap on the number of upcoming-departure rows returned alongside
   * the count. The dashboard uses 8; we allow up to 20 so adjacent
   * dashboards / digests can share the endpoint.
   */
  upcomingLimit: z.coerce.number().int().min(0).max(20).default(8),
})

export const sharingGroupsForSlotQuerySchema = z.object({
  slotId: z.string().min(1),
})

export const convertProductSchema = z
  .object({
    productId: z.string().min(1),
    optionId: z.string().optional().nullable(),
    slotId: z.string().optional().nullable(),
    bookingNumber: z.string().min(1).max(50),
    personId: bookingBillingPersonIdSchema,
    organizationId: bookingBillingOrganizationIdSchema,
    pax: z.number().int().positive().optional().nullable(),
    internalNotes: z.string().optional().nullable(),
    /**
     * Override the seed `sellAmountCents` on the new booking + line item.
     * When unset, the converter uses `product.sellAmountCents` as before.
     * Used by the catalog booking-engine when promotional offers are
     * applied to the quote — the discounted base flows through here so
     * the booking row's payable amount reflects the customer-shown total
     * (per docs/architecture/promotions-architecture.md §7.1).
     */
    sellAmountCentsOverride: z.number().int().min(0).optional().nullable(),
    /**
     * Catalog-resolved preview total shown to the operator. Unlike
     * `sellAmountCentsOverride`, this is not a promotion adjustment; it lets
     * the create flow seed the booking total from the pricing preview even
     * when the legacy product row has no static price.
     */
    catalogSellAmountCents: z.number().int().min(0).optional().nullable(),
    /**
     * Operator-confirmed booking total. If it differs from the catalog preview
     * (or there was no catalog preview), `priceOverrideReason` is required and
     * the service stamps an audit payload onto `bookings.price_override`.
     */
    confirmedSellAmountCents: z.number().int().min(0).optional().nullable(),
    priceOverrideReason: z.string().trim().min(1).max(1000).optional().nullable(),
    manualPriceOverride: z
      .object({
        amountCents: z.number().int().min(0),
        reason: z.string().trim().min(1).max(1000),
      })
      .optional()
      .describe(
        "Explicit manual price override requested for this booking. Omit it to use persisted catalog pricing.",
      ),
    suppressNotifications: z
      .boolean()
      .optional()
      .describe("Persistently suppress customer-facing messages for this booking lifecycle."),
    /**
     * Initial status to insert with — defaults to `draft`. Lets the booking-
     * create flow commit straight to `confirmed` or `awaiting_payment` in
     * one transaction instead of doing a `create-then-flip` dance that's
     * vulnerable to a window where the second request can't see the just-
     * committed booking row. When set to `confirmed`, the caller is
     * responsible for emitting the matching `booking.confirmed` event.
     */
    initialStatus: bookingStatusSchema.optional(),
    /**
     * Billing-contact snapshot. Captures who the operator was billing
     * at create time so the booking detail page renders the right
     * payer even if the linked CRM person/organization changes later
     * (or is hard-deleted). All fields optional — the create flow can
     * pass a partial snapshot when only some details are known.
     */
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
    itemLines: z
      .array(
        z.object({
          /**
           * Stable client-side key (e.g. `unit:optu_adult`). Stamped
           * into the inserted booking_item's
           * `metadata.bookingCreateLineKey` so the orchestrator can
           * link items to travelers via `booking_item_travelers`.
           * See voyant-travel/voyant#1267.
           */
          clientLineKey: z.string().min(1).max(255).optional().nullable(),
          optionId: z.string().min(1).optional().nullable(),
          optionUnitId: z.string().min(1),
          quantity: z.number().int().min(1),
          title: z.string().min(1).max(255).optional().nullable(),
          description: z.string().max(5000).optional().nullable(),
          unitSellAmountCents: z.number().int().min(0).optional().nullable(),
          totalSellAmountCents: z.number().int().min(0).optional().nullable(),
          travelerKeys: z.array(z.string().min(1).max(255)).optional().nullable(),
          travelerIndexes: z.array(z.number().int().min(0)).optional().nullable(),
        }),
      )
      .optional(),
  })
  .superRefine((value, ctx) => {
    validateExclusiveBillingParty(value, ctx)

    if (value.confirmedSellAmountCents == null) return
    if (value.catalogSellAmountCents === value.confirmedSellAmountCents) return
    if (value.priceOverrideReason) return

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["priceOverrideReason"],
      message:
        "A price override reason is required when the confirmed total differs from catalog pricing",
    })
  })

/**
 * Admin pricing-preview request. Mirrors the storefront pricing session
 * resolver input so the operator dialog sees the same numbers the customer
 * would see for the same product + option + catalog.
 */
export const pricingPreviewSchema = z.object({
  productId: z.string().min(1),
  optionId: z.string().optional().nullable(),
  catalogId: z.string().optional().nullable(),
})

export const extendBookingHoldSchema = z
  .object({
    holdMinutes: z
      .number()
      .int()
      .positive()
      .max(24 * 60)
      .optional(),
    holdExpiresAt: z.string().datetime().optional().nullable(),
  })
  .refine((value) => value.holdMinutes !== undefined || value.holdExpiresAt !== undefined, {
    message: "holdMinutes or holdExpiresAt is required",
  })

export const confirmBookingSchema = z.object({
  note: z.string().optional().nullable(),
  /**
   * When true, downstream subscribers that send customer-facing
   * notifications (e.g. notifications module's `autoConfirmAndDispatch`)
   * skip dispatching for this confirmation. Lets the operator confirm a
   * booking internally without auto-sending a confirmation email.
   */
  suppressNotifications: z.boolean().optional(),
})

export const cancelBookingSchema = z.object({
  note: z.string().optional().nullable(),
  /** Persistently suppress customer-facing cancellation messages. */
  suppressNotifications: z.boolean().optional(),
})

export const expireBookingSchema = z.object({
  note: z.string().optional().nullable(),
})

export const expireStaleBookingsSchema = z.object({
  before: z.string().datetime().optional().nullable(),
  note: z.string().optional().nullable(),
})

export const startBookingSchema = z.object({
  note: z.string().optional().nullable(),
})

export const completeBookingSchema = z.object({
  note: z.string().optional().nullable(),
})

/**
 * Admin-only override: skips the transition graph. `reason` is required —
 * the operator has to explain why they're bypassing lifecycle laws. Use the
 * verb-specific endpoints (/confirm, /cancel, /start, /complete, /expire) for
 * normal state changes; this is for data-correction and exceptional cases.
 * Confirmed overrides emit `booking.confirmed` by default for create-dialog
 * compatibility; pass `suppressLifecycleEvents` for pure data correction.
 */
export const overrideBookingStatusSchema = z.object({
  status: bookingStatusSchema,
  reason: z.string().min(1).max(2000),
  note: z.string().optional().nullable(),
  /**
   * Same notification opt-out as `confirmBookingSchema.suppressNotifications`.
   * Only applies when the override path emits `booking.confirmed`.
   */
  suppressNotifications: z.boolean().optional(),
  /**
   * When true, skip verb-specific lifecycle events such as
   * `booking.confirmed`. The audit event `booking.status_overridden` still
   * emits either way.
   */
  suppressLifecycleEvents: z.boolean().optional(),
})
