/**
 * Owned-arm booking handler for the `products` vertical.
 * agent-quality: file-size exception -- Product booking handler keeps quote and hold behavior together until booking-engine handlers are split by operation.
 *
 * Per `docs/architecture/booking-journey-architecture.md` §6 +
 * §10 Phase A. Composes:
 *
 *   - The products vertical's existing pricing primitives
 *     (`products.sellAmountCents` / `sellCurrency`) for pricing
 *     basis, with option/unit-specific pax tiers from
 *     `product_pax_pricing_tiers` when the draft selects units.
 *   - `getProductContent` + `buildProductDraftShape` for the journey
 *     wizard's step descriptor.
 * Phase A scope (deliberately narrow):
 *   - Price = product.sellAmountCents × pax_count unless option/unit
 *     pricing, taxes, addons, or Travel Credits are present.
 *
 * Phase C+ extensions land on this same handler without re-architecting
 * the dispatch.
 */

import {
  type AddonOffer,
  type BookingDraftShape,
  type ComputeQuoteRequest,
  type ComputeQuoteResult,
  DEFAULT_PAX_BANDS,
  DEFAULT_PAYMENT_INTENTS,
  defaultBookingFields,
  defaultDraftShapeFlags,
  defaultTravelerFields,
  type OwnedBookingHandler,
  type OwnedHandlerContext,
  type PaxBandDependency,
  type PaxBandSpec,
  type ProductVariantOption,
  paxBandsAllowedTotalFrom,
  type TravelerFieldRequirement,
} from "@voyant-travel/catalog/booking-engine"

import {
  applyAddonSelections,
  bookingExtraLinesFromAddonSelections,
  bookingItemLinesFromOptionSelections,
  fillMissingBookingItemSellAmounts,
  loadProduct,
  normalizeOptionSelections,
  priceOptionSelections,
  priceQuote,
  resolveSellAmountCentsOverride,
  sumPax,
} from "./handler-support.js"

// ─────────────────────────────────────────────────────────────────
// Draft shape — what the wizard reads off the quote response
// ─────────────────────────────────────────────────────────────────

export interface DraftLike {
  configure?: {
    pax?: Partial<Record<string, number>>
    departureSlotId?: string
    departureDate?: string
    departureTime?: string
    variantId?: string
    optionSelections?: Array<{
      optionId: string
      optionName?: string
      optionUnitId?: string
      optionUnitName?: string
      quantity: number
    }>
  }
  billing?: {
    buyerType?: "B2C" | "B2B"
    contact?: { firstName?: string; lastName?: string; email?: string; phone?: string }
    address?: { country?: string }
  }
  travelers?: Array<{
    rowId?: string
    firstName: string
    lastName: string
    email?: string
    phone?: string
    band?: string
  }>
  accommodation?: {
    travelerAssignments?: Record<string, string>
  }
  addons?: Array<{
    extraId: string
    quantity: number
  }>
}

export interface BuildOwnedProductDraftShapeOptions {
  /**
   * Per-traveler field requirements pulled from
   * `@voyant-travel/bookings/requirements` for this product. Caller-supplied
   * so the Inventory package doesn't depend on booking requirements.
   */
  travelerFields?: ReadonlyArray<TravelerFieldRequirement>
  /**
   * Add-on catalog projected from extras. Caller-supplied so products
   * doesn't depend on the Inventory/Bookings extras owner facades. When omitted,
   * `showsAddons` is false.
   */
  addonCatalog?: ReadonlyArray<AddonOffer>
  /**
   * Product options / variants. These select `draft.configure.variantId`
   * and are distinct from extras: one option changes the underlying
   * booking configuration, while extras add optional line items.
   */
  productOptions?: ReadonlyArray<ProductVariantOption>
  /**
   * Traveler bands derived from the product's configured traveler types
   * (e.g. pricing categories like "Adult" / "Child under 6"). When
   * omitted or empty, falls back to the generic adult/child/infant
   * defaults. `code` must stay aligned with the pricing resolver's
   * traveler-category codes so per-band pricing keeps matching.
   */
  paxBands?: ReadonlyArray<PaxBandSpec>
  /**
   * Cross-band occupancy rules (e.g. "Child under 6 requires an Adult"),
   * derived from the product's pricing-category dependencies. Codes must
   * match the `paxBands` codes.
   */
  paxBandDependencies?: ReadonlyArray<PaxBandDependency>
}

export function buildOwnedProductDraftShape(
  options: BuildOwnedProductDraftShapeOptions = {},
): BookingDraftShape {
  // Use the product's configured traveler types when supplied; otherwise
  // the generic adult/child/infant defaults.
  const paxBands =
    options.paxBands && options.paxBands.length > 0 ? options.paxBands : DEFAULT_PAX_BANDS
  const fields = options.travelerFields ?? defaultTravelerFields()
  const addons = options.addonCatalog ?? []
  const variants = options.productOptions ?? []
  const flags = defaultDraftShapeFlags()
  // Room/vehicle-style products sell inventory units (rooms) the operator
  // must pick a quantity of; person-only products price by pax band alone.
  const hasInventoryUnits = variants.some((variant) =>
    variant.units?.some((unit) => unit.unitType === "room" || unit.unitType === "vehicle"),
  )
  return {
    ...flags,
    showsAddons: addons.length > 0,
    paxBands,
    paxBandsAllowedTotal: paxBandsAllowedTotalFrom(paxBands),
    ...(options.paxBandDependencies && options.paxBandDependencies.length > 0
      ? { paxBandDependencies: options.paxBandDependencies }
      : {}),
    travelerFields: fields,
    bookingFields: defaultBookingFields(),
    // Full engine allow list; deployment/surface capabilities narrow it
    // at render time (storefront → card + bank transfer + inquiry). Owned
    // products previously hardcoded ["hold", "card"], which collapsed the
    // storefront's Payment step to card-only (voyant#2741).
    paymentIntents: DEFAULT_PAYMENT_INTENTS,
    configureSubSteps: [
      ...(variants.length > 0 ? [{ kind: "product-option" as const, options: variants }] : []),
      // Owned products are scheduled — the operator picks a real departure.
      // The journey renders an injected slot picker for this kind, falling
      // back to a free date when the product has no scheduled departures.
      { kind: "departure" as const, required: true },
      // Inventory products: the operator picks room/unit quantities for the
      // chosen option + departure. The journey renders an injected units
      // picker that writes `configure.optionSelections`.
      ...(hasInventoryUnits ? [{ kind: "option-units" as const }] : []),
      { kind: "occupancy", bands: paxBands },
    ],
    addons: addons.length > 0 ? { catalog: addons } : undefined,
  }
}

// ─────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────

/** A per-unit price within a resolved option price rule, returned by
 *  `loadResolvedOptionPrice`. The handler matches `travelerCategory`
 *  to the draft's pax-band codes ("adult" / "child" / "infant" /
 *  "senior") to compute per-band totals. Units that don't map to a
 *  band — or whose band has zero count — are dropped. */
export interface ResolvedUnitPrice {
  unitId: string
  unitType: "person" | "room" | "vehicle" | "service" | "group" | "other" | string
  travelerCategory: "adult" | "child" | "infant" | "senior" | null
  pricingMode?: "per_unit" | "per_person" | "per_booking" | "included" | "free" | "on_request"
  sellAmountCents: number | null
}

/** Output of `loadResolvedOptionPrice`. The handler prefers
 *  `unitPrices` (per-band pricing) when present and any unit matches a
 *  pax band; otherwise falls back to `baseSellAmountCents × paxCount`
 *  for per-booking rules; otherwise back to `product.sellAmountCents`. */
export interface ResolvedOptionPrice {
  baseSellAmountCents: number | null
  unitPrices: ReadonlyArray<ResolvedUnitPrice>
}

/** Option/unit-specific pax-tier price from `product_pax_pricing_tiers`. */
export interface ResolvedPaxPricingTier {
  pricePerPaxCents: number
}

/** A resolved tax-rate decision — resolved from `tax_classes` ×
 *  `tax_regimes` × buyer country at quote time. */
export interface ResolvedTaxRate {
  /** Stable code (e.g. "vat-ro-19", "exempt-art311"). */
  code: string
  /** Display label for the breakdown. */
  label: string
  /** Rate as a fraction (0..1). 0 means exempt / zero-rated. */
  rate: number
  /** Whether the configured product price already includes this tax. */
  priceMode?: "inclusive" | "exclusive"
}

/** Caller-supplied loaders for descriptor enrichment. Each is
 *  optional — when omitted the handler returns the default shape.
 *  Templates wire these to the modules they have on hand
 *  (booking requirements, Inventory/Bookings extras, finance). */
export interface OwnedProductsShapeLoaders {
  /**
   * Resolve per-traveler field requirements from
   * @voyant-travel/bookings/requirements. Called per-quote so the descriptor
   * reflects current configuration.
   */
  loadTravelerFields?: (
    ctx: OwnedHandlerContext,
    productId: string,
  ) => Promise<ReadonlyArray<TravelerFieldRequirement>>

  /**
   * Resolve the addon catalog for the product (typically a projection
   * over `extras` + `option_extra_configs`). Caller-supplied to keep
   * the Inventory package free of an extras-owner dependency.
   */
  loadAddonCatalog?: (
    ctx: OwnedHandlerContext,
    productId: string,
  ) => Promise<ReadonlyArray<AddonOffer>>

  /**
   * Resolve product options / variants from the owning products module.
   * Optional for tests and deployments that do not expose option
   * variants in the booking flow.
   */
  loadProductOptions?: (
    ctx: OwnedHandlerContext,
    productId: string,
  ) => Promise<ReadonlyArray<ProductVariantOption>>

  /**
   * Resolve the product's configured traveler types as pax bands
   * (e.g. from Commerce pricing categories). Caller-supplied
   * so the journey's Configure step offers exactly the traveler types
   * the product is priced for ("Adult", "Child under 6", …) instead of
   * the generic adult/child/infant defaults. Returns undefined/empty to
   * fall back to the defaults.
   */
  loadPaxBands?: (
    ctx: OwnedHandlerContext,
    productId: string,
  ) => Promise<ReadonlyArray<PaxBandSpec> | undefined>

  /**
   * Resolve cross-band occupancy rules (e.g. "Child requires an Adult")
   * from the product's pricing-category dependencies. Caller-supplied;
   * codes must match `loadPaxBands`. Returns undefined/empty when the
   * product has no dependency rules.
   */
  loadPaxBandDependencies?: (
    ctx: OwnedHandlerContext,
    productId: string,
  ) => Promise<ReadonlyArray<PaxBandDependency> | undefined>

  /**
   * Resolve the tax rate for a given (product, buyer country) pair.
   * Templates wire this to a function that reads
   * `products.tax_class_id`, `tax_classes.default_regime_id`, and
   * `tax_regimes.rate_percent`. Returns null when tax can't be
   * resolved — the engine renders the breakdown without a tax line.
   *
   * Per booking-journey-architecture §9.
   */
  loadTaxRate?: (
    ctx: OwnedHandlerContext,
    args: {
      productId: string
      buyerCountry?: string
      buyerType?: "B2C" | "B2B"
    },
  ) => Promise<ResolvedTaxRate | null>

  /**
   * Resolve the option price rule for a given (product, option, date)
   * — typically backed by Commerce's
   * `resolveOptionPriceRulesForDate` plus a join into per-unit prices.
   * Returns null when no rule applies or the resolver can't run; the
   * handler then falls back to `product.sellAmountCents × pax`.
   *
   * Caller-supplied so Inventory does not import
   * `@voyant-travel/commerce` (the dependency direction is commerce →
   * inventory, not the reverse).
   */
  loadResolvedOptionPrice?: (
    ctx: OwnedHandlerContext,
    args: {
      productId: string
      optionId: string
      /** ISO yyyy-mm-dd in the slot's local timezone. */
      date: string
      catalogId?: string
    },
  ) => Promise<ResolvedOptionPrice | null>

  /**
   * Resolve Inventory-owned pax pricing for a selected option unit.
   * Defaults to `product_pax_pricing_tiers`, with the selected unit's
   * tier winning over product-level tiers.
   */
  loadPaxPricingTier?: (
    ctx: OwnedHandlerContext,
    args: {
      productId: string
      optionUnitId: string
      tierPax: number
      /** ISO yyyy-mm-dd when the quote is tied to a departure. */
      date?: string | null
    },
  ) => Promise<ResolvedPaxPricingTier | null>

  /**
   * Look up the local date of a departure slot (`availability_slots`).
   * Caller-supplied so the Inventory package does not import
   * `@voyant-travel/operations`. Returns null when the slot is missing.
   *
   * Used together with `loadResolvedOptionPrice` to convert a draft's
   * `departureSlotId` into a date the resolver can match against.
   */
  loadSlotDate?: (ctx: OwnedHandlerContext, slotId: string) => Promise<string | null>
}

/**
 * Caller-supplied availability-hold bridge — keeps the products
 * package free of an `@voyant-travel/operations` dependency. When
 * wired, the handler's `placeHold/extendHold/releaseHold` route
 * through `availability_holds` (real inventory locks). When
 * omitted, the handler falls back to stamping no-ops.
 */
export interface AvailabilityHoldBridge {
  place: (
    ctx: OwnedHandlerContext,
    input: {
      draftId: string
      productId: string
      slotId: string
      paxCount: number
      ttlMs: number
      holdToken?: string
    },
  ) => Promise<
    | { status: "ok"; holdToken: string; expiresAt: Date }
    | { status: "slot_not_found" }
    | { status: "insufficient_capacity"; remaining: number; needed: number }
  >
  extend: (
    ctx: OwnedHandlerContext,
    input: {
      holdToken: string
      ttlMs: number
    },
  ) => Promise<{ status: "ok"; expiresAt: Date } | { status: "not_found" }>
  release: (ctx: OwnedHandlerContext, holdToken: string) => Promise<void>
}

export interface CreateProductsBookingHandlerOptions extends OwnedProductsShapeLoaders {
  /**
   * Optional inventory-hold bridge. When wired, `placeHold`
   * decrements `availability_slots.remainingPax` against the
   * draft's chosen slot; `releaseHold` restores it. When omitted,
   * the handler returns a stamping token without touching
   * inventory.
   */
  holds?: AvailabilityHoldBridge
}

/**
 * Run an optional enrichment loader so a single failure (a missing
 * migration, a flaky query) never rejects the quote. The journey
 * descriptor — steps, pax bands, options, extras, units — must always
 * render; a broken enrichment source degrades to `undefined`, not a
 * collapsed booking shape. Logs the cause for diagnosis.
 */
async function safeLoad<T>(label: string, promise: Promise<T> | undefined): Promise<T | undefined> {
  if (!promise) return undefined
  try {
    return await promise
  } catch (error) {
    console.warn(`[products/booking-engine] ${label} failed; continuing without it`, error)
    return undefined
  }
}

export function createProductsBookingHandler(
  options: CreateProductsBookingHandlerOptions,
): OwnedBookingHandler {
  return {
    entityModule: "products",

    async computeQuote(
      ctx: OwnedHandlerContext,
      request: ComputeQuoteRequest,
    ): Promise<ComputeQuoteResult> {
      const product = await loadProduct(ctx.db, request.entityId)
      if (!product) {
        return { available: false, invalidReason: "product_not_found" }
      }
      if (product.status !== "active" && product.status !== "draft") {
        return {
          available: false,
          invalidReason: `product_status_${product.status}`,
        }
      }

      const draft = (request.draft ?? {}) as DraftLike
      const optionId = draft.configure?.variantId
      const optionSelections = normalizeOptionSelections(draft.configure?.optionSelections)
      const slotId = draft.configure?.departureSlotId

      // Concurrent enrichment + slot-date lookup. The slot date is
      // needed before we can call loadResolvedOptionPrice, so it
      // joins this batch.
      const [
        travelerFields,
        addonCatalog,
        productOptionCatalog,
        paxBands,
        paxBandDependencies,
        taxRate,
        slotDate,
      ] = await Promise.all([
        safeLoad("loadTravelerFields", options.loadTravelerFields?.(ctx, request.entityId)),
        safeLoad("loadAddonCatalog", options.loadAddonCatalog?.(ctx, request.entityId)),
        safeLoad("loadProductOptions", options.loadProductOptions?.(ctx, request.entityId)),
        safeLoad("loadPaxBands", options.loadPaxBands?.(ctx, request.entityId)),
        safeLoad(
          "loadPaxBandDependencies",
          options.loadPaxBandDependencies?.(ctx, request.entityId),
        ),
        safeLoad(
          "loadTaxRate",
          options.loadTaxRate?.(ctx, {
            productId: request.entityId,
            buyerCountry: draft.billing?.address?.country,
            buyerType: draft.billing?.buyerType,
          }),
        ),
        slotId && options.loadSlotDate
          ? safeLoad("loadSlotDate", options.loadSlotDate(ctx, slotId)).then(
              (date) => date ?? draft.configure?.departureDate ?? null,
            )
          : Promise.resolve(draft.configure?.departureDate ?? null),
      ])

      // The journey descriptor never depends on pricing — build it
      // unconditionally so the wizard always renders the right steps,
      // bands, options, extras and units. Pricing is best-effort: a
      // failure here returns the shape with no price rather than 500ing
      // the quote (which would collapse the shape to the bare default).
      const shape = buildOwnedProductDraftShape({
        travelerFields,
        addonCatalog,
        productOptions: productOptionCatalog,
        paxBands,
        paxBandDependencies,
      })

      let available = false
      let pricing: ComputeQuoteResult["pricing"]
      try {
        const resolvedPrice =
          optionSelections.length === 0 && optionId && slotDate && options.loadResolvedOptionPrice
            ? await options.loadResolvedOptionPrice(ctx, {
                productId: request.entityId,
                optionId,
                date: slotDate,
              })
            : null

        const paxCount = sumPax(draft.configure?.pax)
        // Per-pax pricing fallback: when no pax is supplied yet, quote a
        // single-occupant baseline so the wizard can render a starter
        // total before the user picks counts.
        const effectivePax = paxCount > 0 ? paxCount : 1

        const priced =
          optionSelections.length > 0
            ? await priceOptionSelections({
                ctx,
                options,
                product,
                productOptions: productOptionCatalog ?? [],
                selections: optionSelections,
                slotDate,
                effectivePax,
                pax: draft.configure?.pax,
                travelerAssignments: draft.accommodation?.travelerAssignments,
                travelerBands: Object.fromEntries(
                  (draft.travelers ?? []).flatMap((traveler) => {
                    const travelerKey = traveler.rowId?.trim()
                    return travelerKey && traveler.band
                      ? [[travelerKey, traveler.band] as const]
                      : []
                  }),
                ),
              })
            : priceQuote({
                product,
                resolvedPrice,
                pax: draft.configure?.pax,
                effectivePax,
              })
        const pricedWithAddons = applyAddonSelections({
          priced,
          addons: draft.addons,
          addonCatalog: addonCatalog ?? [],
          effectivePax,
        })

        // Tax computation. The base is taxable; addons/accommodation
        // get the same rate in this MVP cut. Per-line override (the
        // `applies_to` axis on tax_classes.lines) lands in a follow-up
        // when the catalog actually carries mixed treatments.
        const taxIsInclusive = taxRate?.priceMode === "inclusive"
        const grossCents = pricedWithAddons.totalCents
        const taxCents =
          taxRate && taxRate.rate > 0
            ? taxIsInclusive
              ? Math.round(grossCents - grossCents / (1 + taxRate.rate))
              : Math.round(grossCents * taxRate.rate)
            : 0
        const netCents = taxIsInclusive ? grossCents - taxCents : grossCents
        const payableCents = taxIsInclusive ? grossCents : netCents + taxCents

        available = grossCents > 0
        pricing = available
          ? {
              base_amount: netCents,
              taxes: taxCents,
              fees: 0,
              surcharges: 0,
              currency: product.sellCurrency,
              breakdown: {
                // `currency` is required for the API serializer to use this
                // itemized breakdown instead of synthesizing a single "Base"
                // line from base_amount.
                currency: product.sellCurrency,
                lines: pricedWithAddons.lines.map((line) => ({
                  ...line,
                  taxIncluded: taxIsInclusive,
                })),
                taxes:
                  taxRate && taxCents > 0
                    ? [
                        {
                          code: taxRate.code,
                          label: taxRate.label,
                          rate: taxRate.rate,
                          amount: taxCents,
                          base: netCents,
                          includedInPrice: taxIsInclusive,
                          scope: taxIsInclusive ? "included" : "excluded",
                        },
                      ]
                    : [],
                subtotal: netCents,
                taxTotal: taxCents,
                total: payableCents,
                paxCount: effectivePax,
              } as Record<string, unknown>,
            }
          : undefined
      } catch (error) {
        console.warn(
          "[products/booking-engine] pricing failed; returning shape without a price",
          error,
        )
        available = false
        pricing = undefined
      }

      return {
        available,
        invalidReason: available ? undefined : "no_sell_amount_configured",
        pricing,
        shape,
      }
    },

    /**
     * Place a soft hold on the row's chosen slot. When the
     * `holds` bridge is wired, decrements
     * `availability_slots.remainingPax` against the slot for the
     * pax count; concurrent placeHold attempts are serialized via
     * a row-level lock inside the bridge. When omitted, returns a
     * stamping token without touching inventory.
     *
     * The slot id and pax count are pulled off
     * `request.parameters.slotId` / `request.parameters.paxCount`
     * — the journey wizard threads these from the draft's
     * Configure step (`departureSlotId` + summed `pax`).
     */
    async placeHold(ctx: OwnedHandlerContext, request) {
      const token = request.draftId ?? `product_${Date.now().toString(36)}`
      if (!options.holds) {
        return { status: "unavailable", reason: "unsupported" }
      }
      const params = (request.parameters ?? {}) as {
        slotId?: string
        paxCount?: number
        productId?: string
      }
      const slotId = params.slotId
      const paxCount = params.paxCount ?? 1
      if (!slotId || !request.draftId) {
        return { status: "unavailable", reason: "selection_incomplete" }
      }
      const result = await options.holds.place(ctx, {
        draftId: request.draftId,
        productId: params.productId ?? request.entityId,
        slotId,
        paxCount,
        ttlMs: request.ttlMs,
        holdToken: token,
      })
      if (result.status === "ok") {
        return { status: "held", holdToken: result.holdToken, expiresAt: result.expiresAt }
      }
      return result.status === "slot_not_found"
        ? { status: "unavailable", reason: "slot_not_found" }
        : {
            status: "unavailable",
            reason: "insufficient_capacity",
            remaining: result.remaining,
            needed: result.needed,
          }
    },

    /**
     * Derive the create command for one public self-service booking.
     *
     * This is the pricing and party half of the removed owned-commit path,
     * with every write taken out — Finance owns the mutation inside its
     * durable claim, and the billing person is resolved by the caller before
     * this runs.
     *
     * Operator-only draft fields are deliberately never read. A public caller
     * can write the draft, so honouring `priceOverride` would let them name
     * their own price, `suppressNotifications` would let them silence the
     * operator, and `internalNotes` / `documentGeneration` would let them
     * write operator-facing state. The staff Tool keeps all four.
     */
    async deriveSelfServiceCommand(ctx: OwnedHandlerContext, request) {
      const product = await loadProduct(ctx.db, request.entityId)
      if (!product) return { status: "rejected" as const, reason: "entity_not_found" as const }
      if (product.status !== "active") {
        return { status: "rejected" as const, reason: "entity_not_bookable" as const }
      }

      const draft = (request.draft ?? {}) as DraftLike
      const travelers = (draft.travelers ?? []).map((traveler) => ({
        firstName: traveler.firstName,
        lastName: traveler.lastName,
        email: traveler.email,
        phone: traveler.phone,
        participantType: "traveler" as const,
        travelerCategory:
          traveler.band === "child" || traveler.band === "infant"
            ? (traveler.band as "child" | "infant")
            : ("adult" as const),
      }))
      if (travelers.length === 0) {
        return { status: "rejected" as const, reason: "incomplete_draft" as const }
      }
      if (!request.billing.personId && !request.billing.organizationId) {
        return { status: "rejected" as const, reason: "incomplete_draft" as const }
      }

      const configuredPax = sumPax(draft.configure?.pax)
      const optionSelections = normalizeOptionSelections(draft.configure?.optionSelections)
      const selectedOptionIds = [...new Set(optionSelections.map((s) => s.optionId))]
      const primaryOptionId =
        selectedOptionIds.length === 1
          ? selectedOptionIds[0]
          : optionSelections.length === 0
            ? (draft.configure?.variantId ?? null)
            : null

      // The quoted amount is authoritative. There is no override path here:
      // the customer pays what the accepted quote said.
      const sellAmountCentsOverride = resolveSellAmountCentsOverride(request.pricing)
      const extraLines = bookingExtraLinesFromAddonSelections({
        addons: draft.addons,
        addonCatalog: await options.loadAddonCatalog?.(ctx, product.id),
        currency: product.sellCurrency,
        quantityMultiplier: Math.max(1, travelers.length),
      })

      let itemLines: ReturnType<typeof fillMissingBookingItemSellAmounts> | undefined
      try {
        itemLines = fillMissingBookingItemSellAmounts({
          itemLines: bookingItemLinesFromOptionSelections(optionSelections),
          pricing: request.pricing,
          targetSellAmountCents: sellAmountCentsOverride,
          extraLines,
        })
      } catch {
        // The accepted quote no longer reconciles against the selection.
        return { status: "rejected" as const, reason: "price_changed" as const }
      }

      return {
        status: "ok" as const,
        command: {
          productId: product.id,
          optionId: primaryOptionId,
          slotId: draft.configure?.departureSlotId ?? null,
          pax: configuredPax > 0 ? configuredPax : travelers.length,
          ...(request.availabilityHoldToken
            ? { availabilityHoldToken: request.availabilityHoldToken }
            : {}),
          personId: request.billing.personId,
          organizationId: request.billing.organizationId,
          contactFirstName: request.billing.contactFirstName,
          contactLastName: request.billing.contactLastName,
          contactEmail: request.billing.contactEmail,
          contactPhone: request.billing.contactPhone,
          travelers,
          ...(itemLines ? { itemLines } : {}),
          ...(extraLines && extraLines.length > 0 ? { extraLines } : {}),
          ...(sellAmountCentsOverride != null ? { sellAmountCentsOverride } : {}),
        },
      }
    },

    async extendHold(_ctx: OwnedHandlerContext, holdToken: string, request?: { ttlMs?: number }) {
      const ttlMs = request?.ttlMs ?? 30 * 60 * 1000
      if (options.holds) {
        const result = await options.holds.extend(_ctx, { holdToken, ttlMs })
        if (result.status === "ok") {
          return { holdToken, expiresAt: result.expiresAt }
        }
      }
      return { holdToken, expiresAt: new Date(Date.now() + ttlMs) }
    },

    async releaseHold(_ctx: OwnedHandlerContext, holdToken: string) {
      if (options.holds) {
        await options.holds.release(_ctx, holdToken)
      }
    },
  }
}
