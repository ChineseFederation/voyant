/**
 * Booking selection V1 schemas — what the buyer has chosen so far.
 *
 * The selection is the counterpart of `bookingRequirementsV1`: requirements
 * say what a booking of this target *needs*, the selection says what has been
 * *picked*. It is the state that survives across journey step transitions.
 *
 * It is declared in three parts so that privilege is a property of the schema
 * rather than of a denylist someone has to remember to extend:
 *
 * - `bookingSelectionPublicV1` — what any caller may send.
 * - `bookingSelectionStaffOnlyV1` — operator-only commercial authority.
 * - `bookingSelectionEngineOwnedV1` — what the engine writes, never a caller.
 *
 * `bookingSelectionV1` is the union of the three: the full draft an operator
 * surface edits in place.
 */

import { z } from "zod"

import { bookingPaymentScheduleV1 } from "./pricing-contracts.js"

/** The canonical traveler categories a pax band can belong to. */
export const paxBandCodeSchema = z.enum(["adult", "child", "infant", "senior", "student", "other"])
export type PaxBandCode = z.infer<typeof paxBandCodeSchema>

/**
 * A band code as it travels on the wire. Either a canonical code or a
 * tier-qualified one (`"child:pricing_categories_01j…"`) for a product
 * selling several tiers of one category — see `paxBandBaseCode` in
 * `requirements-defaults.ts`.
 *
 * Deliberately open: the wizard learns the active bands off the
 * requirements, and the requirements are per product. Narrowing this to
 * an enum is what made a second child tier unrepresentable (voyant#4121).
 * Every canonical code stays valid, so selections written before tiers
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
   * Open-shape document map populated according to the requirements'
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
// Selection state — what survives across step transitions
// ─────────────────────────────────────────────────────────────────

/**
 * What the engine writes onto a selection, never the caller.
 *
 * A Booking Session derives the entity from its own target, so a Session
 * selection that carries one is either stale or an attempt to book something
 * other than what the Session was opened against.
 */
export const bookingSelectionEngineOwnedV1 = z.object({
  // What's being booked — populated from the catalog row, never mutated.
  entity: z.object({
    module: z.string(),
    id: z.string(),
    sourceKind: z.string(),
    sourceConnectionId: z.string().optional(),
    sourceRef: z.string().optional(),
  }),
})

/**
 * The public selection — everything any caller may send.
 *
 * This is the authoritative list of selection keys, not a suggestion: the
 * Booking Session rejects a top-level key this schema does not declare rather
 * than dropping it, so a field added here is admitted deliberately and a field
 * added anywhere else is denied by default.
 */
export const bookingSelectionPublicV1 = z.object({
  // Step 1 — Configure
  configure: z
    .object({
      departureSlotId: z.string().optional(),
      departureDate: z.string().optional(), // ISO yyyy-MM-dd
      departureTime: z.string().optional(), // ISO HH:mm
      // Pax counts keyed by band code — `paxBandCodeSchema` lists the
      // canonical codes but the wizard learns the active bands off the
      // requirements, so we accept any string key. Counts default to 0
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
      /**
       * Billing address.
       *
       * Field widths match the `contact_*` columns these land in via
       * booking-create, so an address this schema admits cannot be rejected
       * later by the commit — the failure belongs at the Session edge, where
       * the caller can still see which field was too long.
       */
      address: z
        .object({
          line1: z.string().max(500).optional(),
          line2: z.string().max(500).optional(),
          city: z.string().max(100).optional(),
          /**
           * Administrative subdivision below the country — state, province,
           * county, `judet`. Free-form because the Booking column it lands in
           * is, and it already holds both codes and names; **ISO 3166-2
           * subdivision codes (`RO-CJ`, `US-CA`) are the recommended
           * encoding** because they are the only country-agnostic one.
           *
           * Romania needs it twice over: an invoice carries the `judet`, and
           * Bucharest has no ordinary city/county pair — it is six Sectors
           * acting as the county-level subdivision. Model that as the Sector
           * in `city` and `RO-B` in `region`, not by overloading an address
           * line (voyant#4290).
           */
          region: z.string().max(100).optional(),
          postal: z.string().max(20).optional(),
          /** ISO 3166-1 alpha-2 country code. */
          country: z.string().max(2).optional(),
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
          /** Selected rate plan (accommodations). When the requirements'
           *  `RoomOptionV1.ratePlans` is non-empty, the journey
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

  /**
   * Customer-typed promotion code, validated case-insensitively against
   * `promotional_offers.code`.
   *
   * Not evaluated today: its only evaluation hook was the beta
   * `QuoteEntityDeps.evaluatePromotions`, deleted in voyant#4188. The field
   * stays because it is what a caller sends; wiring it onto the v1 Session
   * `composeQuote` is separate work.
   *
   * Per docs/architecture/promotions-architecture.md §7.0 — renamed
   * from the original placeholder code field to avoid
   * collision with Finance Travel Credits.
   */
  promotionCode: z.string().optional(),
  /**
   * Customer-facing notes — "anything we should know?" Free-text
   * the customer fills on the storefront review step. Stored on
   * the booking and visible to ops; treat as untrusted input.
   */
  customerNotes: z.string().optional(),
})
export type BookingSelectionPublicV1 = z.infer<typeof bookingSelectionPublicV1>

/**
 * Operator-only selection fields — commercial authority a buyer must never
 * hold: overriding the price, redeeming an operator-held Travel Credit,
 * silencing the confirmation email, choosing which documents are issued,
 * writing notes the customer never sees, or landing the booking as a draft.
 *
 * They are not part of `bookingSelectionPublicV1` and are never accepted from
 * a public payload at any depth. On the v1 Booking Session they arrive under
 * `selection.staffBooking`, behind the staff booking authority gate; the
 * authoritative shape of that payload is finance's
 * `bookingSessionStaffSelectionV1`, which supersets these fields with the rest
 * of the manual-booking operator input. They are declared here so the public
 * schema can be stated as their complement and the Session's default-deny
 * boundary can be derived from a schema instead of hand-maintained.
 */
export const bookingSelectionStaffOnlyV1 = z.object({
  documentGeneration: z
    .object({
      contractDocument: z.boolean().optional(),
      invoiceDocument: z.boolean().optional(),
      /** `"proforma"` issues a placeholder document; defaults to a final `"invoice"`. */
      invoiceType: z.enum(["invoice", "proforma"]).optional(),
    })
    .optional(),

  /**
   * When true, the booking-create commit suppresses post-commit notifications
   * (e.g. the confirmation email). Set on the admin review step; the owned
   * handler forwards it to booking-create.
   */
  suppressNotifications: z.boolean().optional(),

  /**
   * Manual price override (admin review step). The owned handler sends
   * `amountCents` as `confirmedSellAmountCents` (which wins over the
   * quote/promotion price), the quote total as `catalogSellAmountCents`, and
   * the reason — booking-create requires a reason when the two differ.
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
   * Notes never shown to the customer. Set on admin-surface review steps
   * (operator dashboard) and surfaced on the booking detail's notes panel.
   */
  internalNotes: z.string().optional(),

  /**
   * Land the booking as a draft instead of a live booking. When false
   * (default), the commit picks `confirmed` if the payment is marked paid,
   * else `awaiting_payment`.
   */
  saveAsDraft: z.boolean().optional(),
})
export type BookingSelectionStaffOnlyV1 = z.infer<typeof bookingSelectionStaffOnlyV1>

/**
 * The full journey draft an operator surface edits in place: the public
 * selection plus the engine-owned entity plus the operator-only fields.
 *
 * This is the client-side draft type, not what a Booking Session accepts —
 * the Session takes `bookingSelectionPublicV1` and receives operator choices
 * only under `selection.staffBooking`.
 */
export const bookingSelectionV1 = bookingSelectionPublicV1
  .extend(bookingSelectionEngineOwnedV1.shape)
  .extend(bookingSelectionStaffOnlyV1.shape)

export type BookingSelectionV1 = z.infer<typeof bookingSelectionV1>

/**
 * Selection keys any caller may write. Derived from the public schema so that
 * adding a field there — and only there — widens what a Session admits.
 */
export const BOOKING_SELECTION_PUBLIC_KEYS: ReadonlySet<string> = new Set(
  Object.keys(bookingSelectionPublicV1.shape),
)

/**
 * Selection keys a public caller may never write, at any depth.
 *
 * The engine-owned and operator-only entries are derived from the two schemas
 * that own them, so extending either schema extends the boundary without
 * anyone remembering to also deny the new field — the inversion this replaces
 * a hand-maintained denylist for.
 *
 * The reserved tail is Booking-record and supplier-result vocabulary that no
 * selection schema describes (there is no shape to derive from). Reserving the
 * names keeps a nested payload from smuggling one through into the commit-side
 * command merge, where a stray `status` or `sellAmountCentsOverride` would be
 * read as authoritative.
 */
export const BOOKING_SELECTION_PRIVILEGED_KEYS: ReadonlySet<string> = new Set([
  ...Object.keys(bookingSelectionEngineOwnedV1.shape),
  ...Object.keys(bookingSelectionStaffOnlyV1.shape),
  "source",
  "status",
  "supplierResult",
  "bookingNumber",
  "sellAmountCentsOverride",
  "manualPriceOverride",
  "operatorOnly",
])
