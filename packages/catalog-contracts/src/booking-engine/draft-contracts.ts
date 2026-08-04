/** Booking draft, traveler, configuration, and pricing V1 schemas. */

import { z } from "zod"

/** The canonical traveler categories a pax band can belong to. */
export const paxBandCodeSchema = z.enum(["adult", "child", "infant", "senior", "student", "other"])
export type PaxBandCode = z.infer<typeof paxBandCodeSchema>

/**
 * A band code as it travels on the wire. Either a canonical code or a
 * tier-qualified one (`"child:pricing_categories_01j…"`) for a product
 * selling several tiers of one category — see `paxBandBaseCode` in
 * `requirements.ts`.
 *
 * Deliberately open: the wizard learns the active bands off the
 * descriptor, and the descriptor is per product. Narrowing this to an
 * enum is what made a second child tier unrepresentable (voyant#4121).
 * Every canonical code stays valid, so drafts written before tiers
 * existed still parse.
 */
export const travelerBandCodeSchema = z.string().min(1).max(128)

const optionalEmailStringV1 = z.union([z.literal(""), z.email()])

export const travelerEntryV1 = z.object({
  /** Stable client-side row id — the wizard uses it to keep
   *  travelers stable across re-renders and to attach passengers
   *  to room units. Defaults to a fresh uuid when omitted. */
  rowId: z.string().min(1).optional(),
  firstName: z.string().min(1).max(255),
  lastName: z.string().min(1).max(255),
  email: optionalEmailStringV1.optional(),
  phone: z.string().max(50).optional(),
  /** Linked CRM person, when the traveler was picked from (or copied as)
   *  an existing contact. Lets the picker reflect the selection and the
   *  commit path attach the traveler to a known person. */
  personId: z.string().optional(),
  band: travelerBandCodeSchema.default("adult"),
  dateOfBirth: z.string().optional(), // ISO yyyy-mm-dd
  /**
   * Open-shape document map populated according to the descriptor's
   * `travelerFields[]`. Carrier of plaintext PII while the journey
   * is open; the commit path encrypts via
   * `booking_traveler_travel_details` (per booking-journey
   * §0.7). Never persisted plaintext.
   */
  documents: z.record(z.string(), z.unknown()).optional(),
  preferredLanguage: z.string().max(35).optional(),
  specialRequests: z.string().optional(),
  isPrimary: z.boolean().optional(),
})
export type TravelerEntryV1 = z.infer<typeof travelerEntryV1>

// ─────────────────────────────────────────────────────────────────
// Sub-step descriptor schemas
// ─────────────────────────────────────────────────────────────────

export const paxBandSpecV1 = z.object({
  code: z.string(),
  label: z.string(),
  minAge: z.number().int().nonnegative().optional(),
  maxAge: z.number().int().nonnegative().optional(),
  minCount: z.number().int().nonnegative(),
  maxCount: z.number().int().nonnegative(),
})
export type PaxBandSpecV1 = z.infer<typeof paxBandSpecV1>

/** Cross-band occupancy rule (e.g. "Child under 6 requires an Adult"). */
export const paxBandDependencyV1 = z.object({
  dependentCode: z.string(),
  masterCode: z.string(),
  type: z.enum(["requires", "limits_per_master", "limits_sum", "excludes"]),
  maxPerMaster: z.number().int().nonnegative().optional(),
  maxDependentSum: z.number().int().nonnegative().optional(),
})
export type PaxBandDependencyV1 = z.infer<typeof paxBandDependencyV1>

export const cabinCategoryOptionV1 = z.object({
  id: z.string(),
  code: z.string().optional(),
  name: z.string(),
  type: z.string().optional(),
  capacityMin: z.number().int().nonnegative().optional(),
  capacityMax: z.number().int().nonnegative().optional(),
  description: z.string().optional(),
})

export const cabinNumberOptionV1 = z.object({
  id: z.string(),
  code: z.string().optional(),
  label: z.string(),
  capacity: z.number().int().nonnegative().optional(),
  hasAccessibilityFeatures: z.boolean().optional(),
})

export const productVariantUnitOptionV1 = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  unitType: z.string().nullable().optional(),
  minQuantity: z.number().int().nonnegative().nullable().optional(),
  maxQuantity: z.number().int().nonnegative().nullable().optional(),
})

export const productVariantOptionV1 = z.object({
  id: z.string(),
  code: z.string().nullable().optional(),
  name: z.string(),
  description: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
  units: z.array(productVariantUnitOptionV1).optional(),
})

export const ratePlanOptionV1 = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  chargeFrequency: z.enum(["per_night", "per_stay"]).optional(),
  cancellationPolicy: z.string().nullable().optional(),
  inclusions: z.array(z.string()).optional(),
  currency: z.string().optional(),
})

export const roomOptionV1 = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  capacity: z.number().int().nonnegative().nullable().optional(),
  baseRateHint: z.number().nullable().optional(),
  ratePlans: z.array(ratePlanOptionV1).optional(),
})

export const extensionOptionV1 = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string().nullable().optional(),
  side: z.enum(["pre", "post"]),
  nights: z.number().int().nonnegative().nullable().optional(),
  pricePerPersonHint: z.number().nullable().optional(),
})

export const addonOfferV1 = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  kind: z.enum(["extras", "excursions", "insurance"]),
  groupKey: z.string().nullable().optional(),
  pricingMode: z.string().nullable().optional(),
  unitAmountCents: z.number().int().nullable().optional(),
  currency: z.string().nullable().optional(),
  pricedPerPerson: z.boolean().nullable().optional(),
  selectionType: z
    .enum(["optional", "required", "default_selected", "unavailable"])
    .nullable()
    .optional(),
  minQuantity: z.number().int().nonnegative().nullable().optional(),
  maxQuantity: z.number().int().nonnegative().nullable().optional(),
  defaultQuantity: z.number().int().nonnegative().nullable().optional(),
})

export const configureSubStepV1 = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("departure"), required: z.literal(true) }),
  z.object({ kind: z.literal("product-option"), options: z.array(productVariantOptionV1) }),
  // Inventory-unit (room/vehicle) quantity selection — payload-less; the
  // journey loads the units via an injected picker.
  z.object({ kind: z.literal("option-units") }),
  z.object({ kind: z.literal("cabin-category"), categories: z.array(cabinCategoryOptionV1) }),
  z.object({
    kind: z.literal("cabin-number"),
    perCategory: z.record(z.string(), z.array(cabinNumberOptionV1)),
  }),
  z.object({
    kind: z.literal("date-range"),
    minNights: z.number().int().positive(),
    maxNights: z.number().int().positive(),
  }),
  z.object({ kind: z.literal("occupancy"), bands: z.array(paxBandSpecV1) }),
  z.object({
    kind: z.literal("air-arrangement"),
    required: z.boolean().optional(),
  }),
])

export const accommodationSubStepV1 = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("rooms"),
    options: z.array(roomOptionV1),
    sharedRoomAllowed: z.boolean(),
  }),
  z.object({
    kind: z.literal("extensions"),
    options: z.array(extensionOptionV1),
    allowsPre: z.boolean(),
    allowsPost: z.boolean(),
  }),
])

export const addonGroupV1 = z.object({
  kind: z.enum(["extras", "excursions", "insurance"]),
  label: z.string(),
  groupBy: z.enum(["port", "day"]).optional(),
  perGuestSelection: z.boolean(),
  items: z.array(addonOfferV1),
})

export const travelerFieldRequirementV1 = z.object({
  key: z.string(),
  label: z.string(),
  type: z.string(),
  required: z.boolean(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  appliesToBands: z.array(z.string()).optional(),
})

export const bookingFieldRequirementV1 = z.object({
  key: z.string(),
  label: z.string(),
  type: z.string(),
  required: z.boolean(),
  group: z.enum(["billing", "company", "preferences"]),
})

export const bookingRequirementsV1 = z.object({
  showsConfigure: z.boolean(),
  showsBilling: z.boolean(),
  showsTravelers: z.boolean(),
  showsAccommodation: z.boolean(),
  showsAddons: z.boolean(),
  showsPayment: z.boolean(),
  showsReview: z.literal(true),
  configureSubSteps: z.array(configureSubStepV1).optional(),
  paxBands: z.array(paxBandSpecV1),
  paxBandsAllowedTotal: z.object({ min: z.number().int(), max: z.number().int() }),
  paxBandDependencies: z.array(paxBandDependencyV1).optional(),
  travelerFields: z.array(travelerFieldRequirementV1),
  bookingFields: z.array(bookingFieldRequirementV1),
  accommodation: z
    .object({
      roomOptions: z.array(roomOptionV1).optional(),
      sharedRoomAllowed: z.boolean(),
      subSteps: z.array(accommodationSubStepV1).optional(),
    })
    .optional(),
  addons: z
    .object({
      catalog: z.array(addonOfferV1).optional(),
      groups: z.array(addonGroupV1).optional(),
    })
    .optional(),
  paymentIntents: z.array(z.enum(["hold", "card", "bank_transfer", "ticket_on_credit", "inquiry"])),
})

// ─────────────────────────────────────────────────────────────────
// PricingBreakdown — richer than PricingBasis, carries lines + taxes
// ─────────────────────────────────────────────────────────────────

export const pricingLineV1 = z.object({
  kind: z.enum(["base", "addon", "accommodation", "supplement", "discount", "fee"]),
  label: z.string(),
  quantity: z.number().nonnegative().optional(),
  unitAmount: z.number().int(),
  totalAmount: z.number().int(),
  taxIncluded: z.boolean().optional(),
  /** How quantity is interpreted for this line. Booking UIs use this to
   * distinguish inventory held from travelers charged. */
  pricingBasis: z.enum(["per_person", "per_unit", "per_booking"]).optional(),
  /** Aggregate Quote provenance for one Trip Component. */
  componentId: z.string().min(1).optional(),
  authority: z.enum(["booking_quote", "accepted_proposal_manual"]).optional(),
})

export const pricingTaxV1 = z.object({
  code: z.string(),
  label: z.string(),
  rate: z.number().nonnegative(),
  amount: z.number().int(),
  base: z.number().int(),
  includedInPrice: z.boolean().optional(),
  scope: z.enum(["included", "excluded", "withheld"]).optional(),
  componentId: z.string().min(1).optional(),
})

export const bookingPolicyEvidenceV1 = z.object({
  cancellation: z.unknown().optional(),
  bookingTerms: z.unknown().optional(),
})

export const pricingBreakdownV1 = z.object({
  currency: z.string().length(3),
  lines: z.array(pricingLineV1),
  taxes: z.array(pricingTaxV1),
  subtotal: z.number().int(),
  taxTotal: z.number().int(),
  total: z.number().int(),
  /** Fresh policy evidence for a leaf Quote. */
  policyEvidence: bookingPolicyEvidenceV1.optional(),
  /** Component-tagged policy evidence for an aggregate Trip Quote. */
  componentPolicies: z
    .array(bookingPolicyEvidenceV1.extend({ componentId: z.string().min(1) }))
    .optional(),
})

export const bookingPaymentScheduleV1 = z.object({
  scheduleType: z.enum(["deposit", "installment", "balance", "hold", "other"]),
  status: z.enum(["pending", "due", "paid", "waived", "cancelled", "expired"]),
  dueDate: z.string(),
  currency: z.string().length(3),
  amountCents: z.number().int().nonnegative(),
  notes: z.string().nullable().optional(),
})

// ─────────────────────────────────────────────────────────────────
// Draft state — what survives across step transitions
// ─────────────────────────────────────────────────────────────────

export const bookingDraftV1 = z.object({
  // What's being booked — populated from the catalog row, never mutated.
  entity: z.object({
    module: z.string(),
    id: z.string(),
    sourceKind: z.string(),
    sourceConnectionId: z.string().optional(),
    sourceRef: z.string().optional(),
  }),

  // Step 1 — Configure
  configure: z
    .object({
      departureSlotId: z.string().optional(),
      departureDate: z.string().optional(), // ISO yyyy-MM-dd
      departureTime: z.string().optional(), // ISO HH:mm
      // Pax counts keyed by band code — `paxBandCodeSchema` lists the
      // canonical codes but the wizard learns the active bands off the
      // descriptor, so we accept any string key. Counts default to 0
      // when omitted.
      pax: z.record(z.string(), z.number().int().nonnegative()).default(() => ({})),
      variantId: z.string().optional(),
      optionSelections: z
        .array(
          z.object({
            optionId: z.string(),
            optionName: z.string().optional(),
            optionUnitId: z.string().optional(),
            optionUnitName: z.string().optional(),
            quantity: z.number().int().nonnegative(),
          }),
        )
        .optional(),
      cabinCategoryId: z.string().optional(),
      cabinNumberId: z.string().optional(),
      // Sourced stays/package rate pin. The chosen room + rate plan (and its
      // `board` suffix) so the connect adapter re-resolves the EXACT offer the
      // operator clicked, not just the first one for the date. Pin by the
      // stable `ratePlanId`/`roomTypeId` — the per-search `offer.id` is a
      // short-TTL token that can't be replayed. See voyant#1579.
      roomTypeId: z.string().optional(),
      ratePlanId: z.string().optional(),
      board: z.string().optional(),
      dateRange: z
        .object({
          checkIn: z.string(),
          checkOut: z.string(),
        })
        .optional(),
      /** Air-arrangement intent for cruises. Per
       *  booking-journey-architecture §7. Other verticals ignore. */
      airArrangement: z.enum(["cruise_line", "independent", "none"]).optional(),
    })
    .default(() => ({ pax: {} })),

  // Step 2 — Billing
  billing: z
    .object({
      buyerType: z.enum(["B2C", "B2B"]).default("B2C"),
      /** CRM organization id when a company (B2B) lead was picked. */
      organizationId: z.string().optional(),
      contact: z.object({
        firstName: z.string().default(""),
        lastName: z.string().default(""),
        email: optionalEmailStringV1.default(""),
        phone: z.string().optional(),
        /** CRM person id when the lead was picked from CRM (vs typed). */
        personId: z.string().optional(),
      }),
      address: z
        .object({
          line1: z.string().optional(),
          line2: z.string().optional(),
          city: z.string().optional(),
          postal: z.string().optional(),
          country: z.string().optional(),
        })
        .default({}),
      company: z
        .object({
          name: z.string(),
          vatId: z.string().optional(),
          registrationNumber: z.string().optional(),
        })
        .optional(),
      saveAsDefault: z.boolean().optional(),
    })
    .default({
      buyerType: "B2C",
      contact: { firstName: "", lastName: "", email: "" },
      address: {},
    }),

  // Step 3 — Travelers
  travelers: z.array(travelerEntryV1).default([]),

  // Step 4 — Accommodation
  accommodation: z
    .object({
      rooms: z.array(
        z.object({
          optionUnitId: z.string(),
          quantity: z.number().int().min(1),
          /** Selected rate plan (accommodations). When the descriptor's
           *  `RoomOption.ratePlans` is non-empty, the journey
           *  requires this before the Accommodation step is
           *  considered complete. */
          ratePlanId: z.string().optional(),
        }),
      ),
      travelerAssignments: z.record(z.string(), z.string()).default({}),
      sharedRoom: z
        .object({
          mode: z.enum(["create", "join"]),
          groupId: z.string().optional(),
          label: z.string().optional(),
        })
        .optional(),
    })
    .optional(),

  // Step 5 — Add-ons
  addons: z.array(z.object({ extraId: z.string(), quantity: z.number().int().min(1) })).default([]),

  // Step 6 — Payment
  payment: z
    .object({
      intent: z
        .enum(["hold", "card", "bank_transfer", "ticket_on_credit", "inquiry"])
        .default("hold"),
      schedule: z.unknown().optional(),
    })
    .default({ intent: "hold" }),

  paymentSchedules: z.array(bookingPaymentScheduleV1).optional(),
  documentGeneration: z
    .object({
      contractDocument: z.boolean().optional(),
      invoiceDocument: z.boolean().optional(),
      /** `"proforma"` issues a placeholder document; defaults to a final `"invoice"`. */
      invoiceType: z.enum(["invoice", "proforma"]).optional(),
    })
    .optional(),

  /**
   * Operator-only: when true, the booking-create commit suppresses
   * post-commit notifications (e.g. the confirmation email). Set on the
   * admin review step; the owned handler forwards it to booking-create.
   */
  suppressNotifications: z.boolean().optional(),

  /**
   * Operator-only manual price override (admin review step). The owned
   * handler sends `amountCents` as `confirmedSellAmountCents` (which wins
   * over the quote/promotion price), the quote total as
   * `catalogSellAmountCents`, and the reason — booking-create requires a
   * reason when the two differ.
   */
  priceOverride: z
    .object({
      amountCents: z.number().int().min(0),
      reason: z.string(),
    })
    .optional(),

  /**
   * Operator-applied Travel Credit (admin review step).
   * `travelCreditId` + `amountCents` mirror Finance's redemption input
   * exactly; the owned handler forwards them to booking-create, which
   * atomically redeems the Travel Credit inside the create transaction after
   * re-checking status / expiry / balance. The UI validates the code via
   * `/v1/public/finance/travel-credits/validate` before writing this. Distinct from
   * `promotionCode` (a customer discount code) — see the note there.
   */
  travelCreditRedemption: z
    .object({
      travelCreditId: z.string().min(1),
      amountCents: z.number().int().min(1),
    })
    .optional(),

  /**
   * Customer-typed promotion code. Validated case-insensitively against
   * `promotional_offers.code` at quote time when the operator starter
   * wires `evaluatePromotions` on `QuoteEntityDeps`. Surfaces as a
   * `code_*` `invalidReason` on the quote when the code is bad.
   *
   * Per docs/architecture/promotions-architecture.md §7.0 — renamed
   * from the original placeholder code field to avoid
   * collision with Finance Travel Credits.
   */
  promotionCode: z.string().optional(),
  /**
   * Operator-only notes — never shown to the customer. Set on
   * admin-surface review steps (operator dashboard) and surfaced on
   * the booking detail's notes panel.
   */
  internalNotes: z.string().optional(),
  /**
   * Operator-only: land the booking as a draft instead of a live booking.
   * When false (default), the commit picks `confirmed` if the payment is
   * marked paid, else `awaiting_payment`.
   */
  saveAsDraft: z.boolean().optional(),
  /**
   * Customer-facing notes — "anything we should know?" Free-text
   * the customer fills on the storefront review step. Stored on
   * the booking and visible to ops; treat as untrusted input.
   */
  customerNotes: z.string().optional(),

  // Engine-controlled — written when /quote returns
  quoteId: z.string().optional(),
  quoteExpiresAt: z.string().optional(),
})

export type BookingDraftV1 = z.infer<typeof bookingDraftV1>
export type BookingRequirementsV1 = z.infer<typeof bookingRequirementsV1>
export type PricingBreakdownV1 = z.infer<typeof pricingBreakdownV1>
