// agent-quality: file-size exception -- booking-engine pricing and draft helpers stay together until the owned products handler support layer is split.
import type {
  AddonOffer,
  OwnedHandlerContext,
  PaxBandSpec,
  PricingBasis,
  ProductVariantOption,
} from "@voyant-travel/catalog/booking-engine"
import { paxBandBaseCode } from "@voyant-travel/catalog/booking-engine"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { and, eq, gte, isNull, lte, or } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { productPaxPricingTiers, products } from "../schema-core.js"
import type {
  CreateProductsBookingHandlerOptions,
  DraftLike,
  OptionUnitBandCandidate,
  ResolvedOptionPrice,
  ResolvedPaxPricingTier,
} from "./handler.js"
import { deriveTravelerCategory } from "./product-runtime-support.js"

export async function loadProduct(
  db: AnyDrizzleDb,
  productId: string,
): Promise<typeof products.$inferSelect | undefined> {
  const drizzle = db as PostgresJsDatabase
  const rows = (await drizzle
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1)) as Array<typeof products.$inferSelect>
  return rows[0]
}

export function sumPax(pax: Partial<Record<string, number>> | undefined): number {
  if (!pax) return 0
  let total = 0
  for (const v of Object.values(pax)) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) total += v
  }
  return total
}

export interface PricedLine {
  kind: "base" | "addon"
  label: string
  quantity: number
  unitAmount: number
  totalAmount: number
  pricingBasis?: "per_person" | "per_unit" | "per_booking"
  /** Internal quote provenance used to persist the accepted price per booking item. */
  optionId?: string
  optionUnitId?: string
}

export interface PricedQuote {
  totalCents: number
  lines: PricedLine[]
}

export interface NormalizedOptionSelection {
  optionId: string
  optionUnitId?: string
  optionName?: string
  optionUnitName?: string
  quantity: number
}

type DraftOptionSelection = NonNullable<
  NonNullable<DraftLike["configure"]>["optionSelections"]
>[number]

export function normalizeOptionSelections(
  selections: ReadonlyArray<DraftOptionSelection> | undefined,
): NormalizedOptionSelection[] {
  if (!Array.isArray(selections)) return []
  return selections.flatMap((selection) => {
    if (
      !selection ||
      typeof selection !== "object" ||
      typeof selection.optionId !== "string" ||
      selection.optionId.length === 0
    ) {
      return []
    }
    const quantity =
      typeof selection.quantity === "number" && Number.isFinite(selection.quantity)
        ? Math.floor(selection.quantity)
        : 0
    if (quantity <= 0) return []
    return [
      {
        optionId: selection.optionId,
        ...(typeof selection.optionUnitId === "string" && selection.optionUnitId.length > 0
          ? { optionUnitId: selection.optionUnitId }
          : {}),
        ...(typeof selection.optionName === "string" ? { optionName: selection.optionName } : {}),
        ...(typeof selection.optionUnitName === "string"
          ? { optionUnitName: selection.optionUnitName }
          : {}),
        quantity,
      },
    ]
  })
}

export async function priceOptionSelections(input: {
  ctx: OwnedHandlerContext
  options: CreateProductsBookingHandlerOptions
  product: typeof products.$inferSelect
  productOptions: ReadonlyArray<ProductVariantOption>
  selections: ReadonlyArray<NormalizedOptionSelection>
  slotDate: string | null
  effectivePax: number
  /** Booking-level pax counts by band code, for per-traveler-type room prices. */
  pax?: Partial<Record<string, number>>
  /** Explicit traveler-to-room assignments from the booking draft. */
  travelerAssignments?: Record<string, string>
  /** Traveler band by draft row key, used to scope category pricing to assigned rooms. */
  travelerBands?: Record<string, string>
  /** The bands the shopper was offered, used to label the per-band lines. */
  paxBands?: ReadonlyArray<PaxBandSpec> | undefined
}): Promise<PricedQuote> {
  const lines: PricedLine[] = []
  let totalCents = 0
  const optionsById = new Map(input.productOptions.map((option) => [option.id, option]))
  const hasExplicitTravelerAssignments = Object.keys(input.travelerAssignments ?? {}).length > 0
  // Per-traveler-category room prices (a Double room whose price is set per
  // "Adult"/"Child" via the product editor's Rooms & prices matrix) price
  // per-person by band — `pax[band] × price` — NOT per room, so they're
  // collected here and charged once per selected option after the per-unit
  // loop when assignments are absent. Explicit assignments instead scope the
  // band charge to that room unit, matching booking-create item allocation.
  const perBandPrice = new Map<
    string,
    {
      band: string
      cents: number
      count: number
      label: string
      optionId: string
      optionUnitId?: string
    }
  >()
  const totalInventoryUnits = input.selections.reduce((sum, selection) => {
    const unit = findProductOptionUnit(
      input.productOptions,
      selection.optionId,
      selection.optionUnitId,
    )
    return unit && unit.unitType !== "person" ? sum + selection.quantity : sum
  }, 0)
  const totalPersonUnits = input.selections.reduce((sum, selection) => {
    const unit = findProductOptionUnit(
      input.productOptions,
      selection.optionId,
      selection.optionUnitId,
    )
    return unit?.unitType === "person" ? sum + selection.quantity : sum
  }, 0)

  for (const selection of input.selections) {
    const resolvedPrice =
      input.slotDate && input.options.loadResolvedOptionPrice
        ? await input.options.loadResolvedOptionPrice(input.ctx, {
            productId: input.product.id,
            optionId: selection.optionId,
            date: input.slotDate,
          })
        : null
    const unitRows =
      selection.optionUnitId && resolvedPrice?.unitPrices
        ? resolvedPrice.unitPrices.filter((unit) => unit.unitId === selection.optionUnitId)
        : []
    // A category-less unit price follows its configured pricing mode. Per-
    // category rows (the Rooms & prices matrix — "Double / Adult") price per
    // traveler band instead, so collect them for the booking-level charge below
    // and skip the category-less line for this selection.
    const categoryUnitRows = unitRows.filter((unit) => unit.travelerCategory)
    const defaultUnitPrice = unitRows.find((unit) => !unit.travelerCategory) ?? null
    const unitPrice = defaultUnitPrice?.sellAmountCents ?? null
    const assignedTravelerKeys = selection.optionUnitId
      ? Object.entries(input.travelerAssignments ?? {}).flatMap(([travelerKey, assignedUnitId]) =>
          assignedUnitId === selection.optionUnitId ? [travelerKey] : [],
        )
      : []
    const assignedTravelerBandCounts = new Map<string, number>()
    for (const travelerKey of assignedTravelerKeys) {
      const band = input.travelerBands?.[travelerKey]?.trim() || "adult"
      assignedTravelerBandCounts.set(band, (assignedTravelerBandCounts.get(band) ?? 0) + 1)
    }
    if (unitPrice == null && categoryUnitRows.length > 0) {
      const unitLabel =
        findProductOptionUnit(input.productOptions, selection.optionId, selection.optionUnitId)
          ?.name ??
        selection.optionUnitName ??
        optionsById.get(selection.optionId)?.name ??
        input.product.name
      for (const row of categoryUnitRows) {
        const band = row.travelerCategory
        const count = band
          ? hasExplicitTravelerAssignments
            ? (assignedTravelerBandCounts.get(band) ?? 0)
            : (input.pax?.[band] ?? 0)
          : 0
        const optionBandKey = hasExplicitTravelerAssignments
          ? `${selection.optionId}\u0000${selection.optionUnitId ?? ""}\u0000${band ?? ""}`
          : `${selection.optionId}\u0000${band ?? ""}`
        if (
          !band ||
          count <= 0 ||
          (row.sellAmountCents ?? 0) <= 0 ||
          perBandPrice.has(optionBandKey)
        ) {
          continue
        }
        perBandPrice.set(optionBandKey, {
          band,
          cents: row.sellAmountCents ?? 0,
          count,
          label: `${unitLabel} — ${paxBandLabel(band, input.paxBands)}`,
          optionId: selection.optionId,
          ...(selection.optionUnitId ? { optionUnitId: selection.optionUnitId } : {}),
        })
      }
      continue
    }
    const assignedTravelerCount = assignedTravelerKeys.length
    const pricingQuantity =
      defaultUnitPrice?.pricingMode === "per_person"
        ? hasExplicitTravelerAssignments
          ? assignedTravelerCount
          : input.selections.length === 1
            ? input.effectivePax
            : selection.quantity
        : defaultUnitPrice?.pricingMode === "per_booking"
          ? 1
          : selection.quantity
    const paxTier =
      unitPrice == null && selection.optionUnitId
        ? await resolveSelectionPaxTier({
            ctx: input.ctx,
            options: input.options,
            productId: input.product.id,
            optionUnitId: selection.optionUnitId,
            tierPax: tierPaxForSelection({
              productOptions: input.productOptions,
              selection,
              effectivePax: input.effectivePax,
              totalInventoryUnits,
              totalPersonUnits,
            }),
            date: input.slotDate,
          })
        : null
    const paxTierUnitAmount = paxTier
      ? unitAmountForPaxTier({
          productOptions: input.productOptions,
          selection,
          tierPax: paxTier.tierPax,
          pricePerPaxCents: paxTier.price.pricePerPaxCents,
        })
      : null
    const unitAmount =
      unitPrice ??
      paxTierUnitAmount ??
      resolvedPrice?.baseSellAmountCents ??
      input.product.sellAmountCents ??
      0
    if (unitAmount <= 0 || pricingQuantity <= 0) continue
    const totalAmount = unitAmount * pricingQuantity
    totalCents += totalAmount
    lines.push({
      kind: "base",
      // Prefer the specific room/unit name ("Standard - Single"); fall back to
      // the option name, then the product name.
      label:
        (selection.optionUnitId
          ? findProductOptionUnit(input.productOptions, selection.optionId, selection.optionUnitId)
              ?.name
          : null) ??
        selection.optionUnitName ??
        optionsById.get(selection.optionId)?.name ??
        input.product.name,
      quantity: pricingQuantity,
      unitAmount,
      totalAmount,
      pricingBasis:
        defaultUnitPrice?.pricingMode === "per_person"
          ? "per_person"
          : defaultUnitPrice?.pricingMode === "per_booking"
            ? "per_booking"
            : "per_unit",
      optionId: selection.optionId,
      ...(selection.optionUnitId ? { optionUnitId: selection.optionUnitId } : {}),
    })
  }

  // Per-traveler-category room prices: charge each band once per selected
  // option (`pax[band] × option price`), independent of how many rooms were
  // selected within that option — rooms are capacity, while the per-person
  // rate is what the traveler pays. Explicit room assignments narrow each
  // selection to the bands assigned to that unit, matching booking creation.
  for (const price of perBandPrice.values()) {
    const count = price.count
    if (count <= 0 || price.cents <= 0) continue
    const totalAmount = price.cents * count
    totalCents += totalAmount
    lines.push({
      kind: "base",
      label: price.label,
      quantity: count,
      unitAmount: price.cents,
      totalAmount,
      pricingBasis: "per_person",
      optionId: price.optionId,
      ...(price.optionUnitId ? { optionUnitId: price.optionUnitId } : {}),
    })
  }

  return { totalCents, lines }
}

interface SelectionPaxTier {
  tierPax: number
  price: ResolvedPaxPricingTier
}

async function resolveSelectionPaxTier(input: {
  ctx: OwnedHandlerContext
  options: CreateProductsBookingHandlerOptions
  productId: string
  optionUnitId: string
  tierPax: number
  date: string | null
}): Promise<SelectionPaxTier | null> {
  if (input.tierPax <= 0) return null
  const loader = input.options.loadPaxPricingTier ?? loadProductPaxPricingTier
  const price = await loader(input.ctx, {
    productId: input.productId,
    optionUnitId: input.optionUnitId,
    tierPax: input.tierPax,
    date: input.date,
  })
  return price ? { tierPax: input.tierPax, price } : null
}

export async function loadProductPaxPricingTier(
  ctx: OwnedHandlerContext,
  args: {
    productId: string
    optionUnitId: string
    tierPax: number
    date?: string | null
  },
): Promise<ResolvedPaxPricingTier | null> {
  const drizzle = ctx.db as PostgresJsDatabase
  const predicates = [
    eq(productPaxPricingTiers.productId, args.productId),
    eq(productPaxPricingTiers.tierPax, args.tierPax),
    ...paxTierDatePredicates(args.date),
  ]

  const [unitTier] = await drizzle
    .select({
      pricePerPaxCents: productPaxPricingTiers.pricePerPaxCents,
    })
    .from(productPaxPricingTiers)
    .where(and(...predicates, eq(productPaxPricingTiers.optionUnitId, args.optionUnitId)))
    .limit(1)
  if (unitTier) return unitTier

  const [productTier] = await drizzle
    .select({
      pricePerPaxCents: productPaxPricingTiers.pricePerPaxCents,
    })
    .from(productPaxPricingTiers)
    .where(and(...predicates, isNull(productPaxPricingTiers.optionUnitId)))
    .limit(1)
  return productTier ?? null
}

function paxTierDatePredicates(date: string | null | undefined) {
  if (!date) {
    return [
      isNull(productPaxPricingTiers.effectiveFrom),
      isNull(productPaxPricingTiers.effectiveTo),
    ]
  }
  return [
    or(
      isNull(productPaxPricingTiers.effectiveFrom),
      lte(productPaxPricingTiers.effectiveFrom, date),
    ),
    or(isNull(productPaxPricingTiers.effectiveTo), gte(productPaxPricingTiers.effectiveTo, date)),
  ]
}

function findProductOptionUnit(
  productOptions: ReadonlyArray<ProductVariantOption>,
  optionId: string,
  optionUnitId: string | undefined,
) {
  if (!optionUnitId) return undefined
  return productOptions
    .find((option) => option.id === optionId)
    ?.units?.find((unit) => unit.id === optionUnitId)
}

function tierPaxForSelection(input: {
  productOptions: ReadonlyArray<ProductVariantOption>
  selection: NormalizedOptionSelection
  effectivePax: number
  totalInventoryUnits: number
  totalPersonUnits: number
}): number {
  const unit = findProductOptionUnit(
    input.productOptions,
    input.selection.optionId,
    input.selection.optionUnitId,
  )
  if (!unit) return input.effectivePax > 0 ? input.effectivePax : input.selection.quantity
  if (unit.unitType === "person") {
    return Math.max(1, input.effectivePax, input.totalPersonUnits)
  }
  if (input.effectivePax <= 0) return input.selection.quantity
  return Math.max(1, Math.ceil(input.effectivePax / Math.max(1, input.totalInventoryUnits)))
}

function unitAmountForPaxTier(input: {
  productOptions: ReadonlyArray<ProductVariantOption>
  selection: NormalizedOptionSelection
  tierPax: number
  pricePerPaxCents: number
}): number {
  const unit = findProductOptionUnit(
    input.productOptions,
    input.selection.optionId,
    input.selection.optionUnitId,
  )
  return unit && unit.unitType !== "person"
    ? input.pricePerPaxCents * input.tierPax
    : input.pricePerPaxCents
}

export function applyAddonSelections(input: {
  priced: PricedQuote
  addons: DraftLike["addons"] | undefined
  addonCatalog: ReadonlyArray<AddonOffer>
  effectivePax: number
}): PricedQuote {
  const extraLines = bookingExtraLinesFromAddonSelections({
    addons: input.addons,
    addonCatalog: input.addonCatalog,
    currency: "EUR",
  })
  if (!extraLines?.length) return input.priced

  const lines: PricedLine[] = [...input.priced.lines]
  let totalCents = input.priced.totalCents
  for (const extra of extraLines) {
    const unitAmount = extra.unitSellAmountCents ?? 0
    const quantity =
      extra.pricingMode === "per_person" || extra.pricedPerPerson
        ? Math.max(1, input.effectivePax) * extra.quantity
        : extra.quantity
    const totalAmount = unitAmount * quantity
    if (totalAmount <= 0) continue
    totalCents += totalAmount
    lines.push({
      kind: "addon",
      label: extra.name,
      quantity,
      unitAmount,
      totalAmount,
      pricingBasis:
        extra.pricingMode === "per_person" || extra.pricedPerPerson ? "per_person" : "per_unit",
    })
  }
  return { totalCents, lines }
}

export interface BookingExtraLine {
  productExtraId: string
  name: string
  description?: string | null
  pricingMode?: string | null
  pricedPerPerson?: boolean | null
  quantity: number
  sellCurrency: string
  unitSellAmountCents?: number | null
  totalSellAmountCents?: number | null
}

export function bookingExtraLinesFromAddonSelections(input: {
  addons: DraftLike["addons"] | undefined
  addonCatalog: ReadonlyArray<AddonOffer> | undefined
  currency: string
  quantityMultiplier?: number
}): BookingExtraLine[] | undefined {
  if (!Array.isArray(input.addons) || input.addons.length === 0) return undefined
  const catalogById = new Map((input.addonCatalog ?? []).map((offer) => [offer.id, offer]))
  const lines = input.addons.flatMap((selection) => {
    const offer = catalogById.get(selection.extraId)
    const quantity =
      typeof selection.quantity === "number" && Number.isFinite(selection.quantity)
        ? Math.floor(selection.quantity)
        : 0
    if (!offer || quantity <= 0) return []
    const unitSellAmountCents = offer.unitAmountCents ?? null
    const chargedQuantity =
      offer.pricingMode === "per_person" || offer.pricedPerPerson
        ? quantity * Math.max(1, input.quantityMultiplier ?? 1)
        : quantity
    return [
      {
        productExtraId: offer.id,
        name: offer.name,
        description: offer.description ?? null,
        pricingMode: offer.pricingMode ?? null,
        pricedPerPerson: offer.pricedPerPerson ?? null,
        quantity,
        sellCurrency: offer.currency ?? input.currency,
        unitSellAmountCents,
        totalSellAmountCents:
          unitSellAmountCents == null ? null : unitSellAmountCents * chargedQuantity,
      },
    ]
  })
  return lines.length > 0 ? lines : undefined
}

/**
 * One (option unit × pax band) charge resolved from an option price rule.
 *
 * `priceQuote` renders these as the quote's base lines and
 * `bookingItemLinesFromPaxBands` turns the same list into the commit's booking
 * item lines. Deriving both from one function is what keeps the quote and the
 * commit from disagreeing about which units a person-priced product reserves.
 */
/**
 * The operator's own name for a band ("Child 6-12"), for quote lines and
 * booking item titles. Falls back to the raw code when the bands are not to
 * hand — legible for a canonical code, and never worse than not labelling.
 */
export function paxBandLabel(code: string, bands: ReadonlyArray<PaxBandSpec> | undefined): string {
  return bands?.find((band) => band.code === code)?.label ?? code
}

export interface PaxBandUnitCharge {
  unitId: string
  travelerCategory: string
  count: number
  sellAmountCents: number
}

export function paxBandUnitCharges(
  resolvedPrice: ResolvedOptionPrice | null | undefined,
  pax: Partial<Record<string, number>> | undefined,
): PaxBandUnitCharge[] {
  if (!resolvedPrice) return []
  const claimed = new Set<string>()
  return sortedByOperatorOrder(resolvedPrice.unitPrices).flatMap((unit) => {
    if (!unit.travelerCategory) return []
    // One unit per band. A price row tied to a pricing category now carries
    // that tier's own band code, so "Child 6-12" and "Child 0-5" no longer
    // contend and this guard never fires for them (voyant#4121). It still
    // holds for price rows with no pricing category, where the band is
    // derived from the unit's age window and `deriveTravelerCategory`
    // collapses every tier under 18 onto `child`: charging both would bill
    // the same child twice and reserve two seats (voyant#4118).
    if (claimed.has(unit.travelerCategory)) return []
    const count = pax?.[unit.travelerCategory] ?? 0
    if (count <= 0) return []
    const sellAmountCents = unit.sellAmountCents ?? 0
    if (sellAmountCents <= 0) return []
    claimed.add(unit.travelerCategory)
    return [
      {
        unitId: unit.unitId,
        travelerCategory: unit.travelerCategory,
        count,
        sellAmountCents,
      },
    ]
  })
}

/**
 * Order unit prices the way the operator ordered the units.
 *
 * Which unit wins a contested band has to be the operator's call, and it has
 * to be the same call twice: the quote and the commit each resolve the price
 * in a separate query, and the underlying `option_unit_price_rules` select
 * carries no `ORDER BY`, so relying on the returned order would let the two
 * disagree. `unitId` breaks ties so units sharing a `sort_order` — and the
 * several category rows a single unit can carry — still land in a stable
 * order.
 */
function sortedByOperatorOrder(
  unitPrices: ReadonlyArray<ResolvedOptionPrice["unitPrices"][number]>,
): ResolvedOptionPrice["unitPrices"][number][] {
  return [...unitPrices].sort((left, right) => {
    const leftOrder = left.sortOrder ?? Number.MAX_SAFE_INTEGER
    const rightOrder = right.sortOrder ?? Number.MAX_SAFE_INTEGER
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    return left.unitId.localeCompare(right.unitId)
  })
}

/**
 * Three-way price computation:
 *
 * 1. **Per-band** (preferred): when `resolvedPrice.unitPrices` matches
 *    at least one band with positive count, sum `pax[band] ×
 *    unit.sellAmountCents` for each matching band. One breakdown line
 *    per band.
 *
 * 2. **Per-booking**: when no per-band match but `baseSellAmountCents`
 *    is set, charge a single `base × paxCount` line.
 *
 * 3. **Fallback**: `product.sellAmountCents × paxCount`. Same shape as
 *    Phase A behavior, kept for bookings without an option/slot
 *    configured yet.
 */
export function priceQuote(input: {
  product: typeof products.$inferSelect
  resolvedPrice: ResolvedOptionPrice | null
  pax: Partial<Record<string, number>> | undefined
  effectivePax: number
  /** Option the resolved price belongs to, stamped onto the band lines as
   *  quote provenance so the commit can match them back to its item lines. */
  optionId?: string | null
  /** The bands the shopper was offered, used to label the per-band lines. */
  paxBands?: ReadonlyArray<PaxBandSpec> | undefined
}): PricedQuote {
  const { product, resolvedPrice, pax, effectivePax } = input

  const bandCharges = paxBandUnitCharges(resolvedPrice, pax)
  if (bandCharges.length > 0) {
    let total = 0
    const bandLines: PricedLine[] = bandCharges.map((charge) => {
      const lineTotal = charge.sellAmountCents * charge.count
      total += lineTotal
      return {
        kind: "base",
        label: `${product.name} — ${paxBandLabel(charge.travelerCategory, input.paxBands)}`,
        quantity: charge.count,
        unitAmount: charge.sellAmountCents,
        totalAmount: lineTotal,
        pricingBasis: "per_person",
        ...(input.optionId ? { optionId: input.optionId } : {}),
        optionUnitId: charge.unitId,
      }
    })
    return { totalCents: total, lines: bandLines }
  }

  if (resolvedPrice && resolvedPrice.baseSellAmountCents !== null) {
    const unitCents = resolvedPrice.baseSellAmountCents
    const totalCents = unitCents * effectivePax
    return {
      totalCents,
      lines: [
        {
          kind: "base",
          label: product.name,
          quantity: effectivePax,
          unitAmount: unitCents,
          totalAmount: totalCents,
          pricingBasis: "per_person",
        },
      ],
    }
  }

  const unitCents = product.sellAmountCents ?? 0
  const totalCents = unitCents * effectivePax
  return {
    totalCents,
    lines: [
      {
        kind: "base",
        label: product.name,
        quantity: effectivePax,
        unitAmount: unitCents,
        totalAmount: totalCents,
        pricingBasis: "per_person",
      },
    ],
  }
}

// ─────────────────────────────────────────────────────────────────────
// Self-service command derivation helpers
//
// Restored from the pricing half of the removed owned-commit path. These
// are pure: they turn an accepted quote plus the selected units into the
// booking item lines a create command needs, and never write anything.
// ─────────────────────────────────────────────────────────────────────

/** Booking item lines as the create command expects them. */
export type SelfServiceItemLines = Array<{
  optionId?: string
  optionUnitId?: string
  title?: string | null
  quantity: number
  unitSellAmountCents?: number | null
  totalSellAmountCents?: number | null
}>

export function bookingItemLinesFromOptionSelections(
  selections: ReadonlyArray<NormalizedOptionSelection>,
): SelfServiceItemLines | undefined {
  const lines = selections.flatMap((selection) =>
    selection.optionUnitId
      ? [
          {
            optionId: selection.optionId,
            optionUnitId: selection.optionUnitId,
            quantity: selection.quantity,
          },
        ]
      : [],
  )
  return lines.length > 0 ? lines : undefined
}

/**
 * Item lines for a product the journey never showed a units step for.
 *
 * `buildOwnedProductRequirements` renders the `option-units` sub-step only for
 * options that sell room/vehicle inventory, so a person-priced product's draft
 * carries pax bands and no `configure.optionSelections`. Without this the
 * commit arrived with no item lines at all and booking creation refused it
 * (voyant#4113).
 *
 * Preferred source: the option price rule's per-band unit prices, which is
 * exactly what `priceQuote` charged for. Deriving from the same
 * `paxBandUnitCharges` list means each line corresponds 1:1 to an accepted
 * quote base line, so `fillMissingBookingItemSellAmounts` can reconcile them
 * by provenance and the customer is billed per unit what they were quoted.
 *
 * Amounts are deliberately left unset: the accepted quote is authoritative, so
 * the price the shopper saw wins over whatever the resolver says at commit
 * time.
 */
export function bookingItemLinesFromPaxBands(input: {
  optionId: string
  resolvedPrice: ResolvedOptionPrice | null | undefined
  pax: Partial<Record<string, number>> | undefined
}): SelfServiceItemLines | undefined {
  const lines = paxBandUnitCharges(input.resolvedPrice, input.pax).map((charge) => ({
    optionId: input.optionId,
    optionUnitId: charge.unitId,
    quantity: charge.count,
  }))
  return lines.length > 0 ? lines : undefined
}

/**
 * Fallback item lines for a person-priced option whose price is configured at
 * the option or product level rather than per unit — there is no per-band unit
 * price to derive from, but the units still exist and each pax band still has
 * to reserve one.
 *
 * When the shape's bands are known, each band claims the unit whose own age
 * window it falls inside — so "Child 0-5" reserves the 0-5 unit and
 * "Child 6-12" the 6-12 one, rather than both landing on whichever unit sorts
 * first. Two bands never share a unit.
 *
 * Without bands (or when none matched by age) the mapping falls back to the
 * unit's derived category, the same rule the price resolver uses. There, two
 * units deriving the same band — "Child 6-12" and "Child 0-5" both derive
 * `child` — mean the first in sort order takes the whole band's count rather
 * than each taking it in full, which would reserve the party twice.
 *
 * A band with no matching unit is dropped: the option has nothing to reserve
 * for it, and inventing a unit would bill a traveler against someone else's
 * rate.
 */
export function bookingItemLinesFromPaxBandUnits(input: {
  optionId: string
  units: ReadonlyArray<OptionUnitBandCandidate>
  pax: Partial<Record<string, number>> | undefined
  /** The bands the shopper was offered, in the order the journey showed them. */
  bands?: ReadonlyArray<PaxBandSpec> | undefined
}): SelfServiceItemLines | undefined {
  const claimedUnits = new Set<string>()
  const lines: SelfServiceItemLines = []

  for (const band of input.bands ?? []) {
    const quantity = input.pax?.[band.code] ?? 0
    if (quantity <= 0) continue
    const unit = findUnitForBand(input.units, band, claimedUnits)
    if (!unit) continue
    claimedUnits.add(unit.id)
    lines.push({ optionId: input.optionId, optionUnitId: unit.id, quantity })
  }
  if (lines.length > 0) return lines

  const claimedBands = new Set<string>()
  const derived = input.units.flatMap((unit) => {
    const band = deriveTravelerCategory(unit)
    if (!band || claimedBands.has(band)) return []
    const quantity = input.pax?.[band] ?? 0
    if (quantity <= 0) return []
    claimedBands.add(band)
    return [{ optionId: input.optionId, optionUnitId: unit.id, quantity }]
  })
  return derived.length > 0 ? derived : undefined
}

/**
 * The unit a band reserves: same traveler category, and — when both declare
 * one — overlapping age windows, so a tiered band lands on its own unit
 * rather than on the first unit of its category.
 */
function findUnitForBand(
  units: ReadonlyArray<OptionUnitBandCandidate>,
  band: PaxBandSpec,
  claimedUnits: ReadonlySet<string>,
): OptionUnitBandCandidate | undefined {
  const base = paxBandBaseCode(band.code)
  const candidates = units.filter(
    (unit) => !claimedUnits.has(unit.id) && deriveTravelerCategory(unit) === base,
  )
  return candidates.find((unit) => ageWindowsOverlap(unit, band)) ?? candidates[0]
}

function ageWindowsOverlap(
  unit: { minAge: number | null; maxAge: number | null },
  band: { minAge?: number; maxAge?: number },
): boolean {
  const unitMin = unit.minAge ?? 0
  const unitMax = unit.maxAge ?? Number.POSITIVE_INFINITY
  const bandMin = band.minAge ?? 0
  const bandMax = band.maxAge ?? Number.POSITIVE_INFINITY
  return unitMin <= bandMax && bandMin <= unitMax
}

interface AcceptedBasePriceLine {
  optionId?: string
  optionUnitId?: string
  quantity: number
  unitAmountCents: number
  totalAmountCents: number
  label: string | null
}

/**
 * Populate missing booking-item amounts from the accepted quote.
 *
 * Quote lines carrying option provenance are matched directly. Legacy quotes
 * without provenance retain their itemized amounts when their line ordering
 * and quantities still identify the selected units. Any residual (promotion,
 * operator override, or cent rounding) is allocated by the accepted base-line
 * weights, with quantity as the final fallback. Explicit caller amounts are
 * never replaced and the authoritative line totals sum exactly to `target`.
 * `target` is the booking sell amount: gross when tax is included, pre-tax
 * when tax is excluded (the separate booking tax lines carry excluded tax).
 */
export function fillMissingBookingItemSellAmounts(input: {
  itemLines: SelfServiceItemLines | undefined
  pricing: PricingBasis | undefined
  targetSellAmountCents: number | null
  extraLines?: readonly BookingExtraLine[]
}): SelfServiceItemLines | undefined {
  if (!input.itemLines?.length) return input.itemLines

  const target = input.targetSellAmountCents
  if (target == null || target < 0) return input.itemLines

  const extraTotal = (input.extraLines ?? []).reduce(
    (sum, line) => sum + Math.max(0, line.totalSellAmountCents ?? 0),
    0,
  )
  if (extraTotal > target) {
    throw new Error("Accepted booking pricing is inconsistent: add-ons exceed the sell total.")
  }
  const itemTarget = target - extraTotal
  const quoteLines = acceptedBasePriceLines(input.pricing)
  const quoteBySelection = matchAcceptedBasePriceLines(input.itemLines, quoteLines)

  const explicitTotal = input.itemLines.reduce(
    (sum, line) => sum + Math.max(0, line.totalSellAmountCents ?? 0),
    0,
  )
  if (explicitTotal > itemTarget) {
    throw new Error(
      "Accepted booking pricing is inconsistent: explicit item lines exceed the item total.",
    )
  }
  const missingIndexes = input.itemLines.flatMap((line, index) =>
    line.totalSellAmountCents == null ? [index] : [],
  )
  if (missingIndexes.length === 0) {
    if (explicitTotal !== itemTarget) {
      throw new Error(
        "Accepted booking pricing is inconsistent: explicit item lines do not equal the item total.",
      )
    }
    return input.itemLines
  }

  const remaining = itemTarget - explicitTotal
  const weights = missingIndexes.map((index) => {
    const quoted = quoteBySelection.get(index)?.totalAmountCents
    return quoted != null && quoted > 0
      ? quoted
      : Math.max(1, input.itemLines?.[index]?.quantity ?? 1)
  })
  const allocated = allocateExactTotal(remaining, weights)

  return input.itemLines.map((line, index) => {
    if (line.totalSellAmountCents != null) return line
    const missingIndex = missingIndexes.indexOf(index)
    if (missingIndex < 0) return line
    const totalSellAmountCents = allocated[missingIndex] ?? 0
    const quoted = quoteBySelection.get(index)
    const unitSellAmountCents =
      quoted && quoted.totalAmountCents === totalSellAmountCents
        ? quoted.unitAmountCents
        : Math.floor(totalSellAmountCents / Math.max(1, line.quantity))
    return {
      ...line,
      ...(line.title == null && quoted?.label ? { title: quoted.label } : {}),
      unitSellAmountCents,
      totalSellAmountCents,
    }
  })
}

function acceptedBasePriceLines(pricing: PricingBasis | undefined): AcceptedBasePriceLine[] {
  const breakdown = pricing?.breakdown
  if (!breakdown || typeof breakdown !== "object" || Array.isArray(breakdown)) return []
  const lines = (breakdown as { lines?: unknown }).lines
  if (!Array.isArray(lines)) return []
  return lines.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return []
    const line = value as Record<string, unknown>
    if (line.kind !== "base") return []
    const quantity = asFiniteInteger(line.quantity)
    const unitAmountCents = asFiniteInteger(line.unitAmount)
    const totalAmountCents = asFiniteInteger(line.totalAmount)
    if (
      quantity == null ||
      quantity <= 0 ||
      unitAmountCents == null ||
      unitAmountCents < 0 ||
      totalAmountCents == null ||
      totalAmountCents < 0
    ) {
      return []
    }
    return [
      {
        ...(typeof line.optionId === "string" ? { optionId: line.optionId } : {}),
        ...(typeof line.optionUnitId === "string" ? { optionUnitId: line.optionUnitId } : {}),
        quantity,
        unitAmountCents,
        totalAmountCents,
        label: typeof line.label === "string" ? line.label : null,
      },
    ]
  })
}

function matchAcceptedBasePriceLines(
  itemLines: NonNullable<SelfServiceItemLines>,
  quoteLines: readonly AcceptedBasePriceLine[],
): Map<number, AcceptedBasePriceLine> {
  const matched = new Map<number, AcceptedBasePriceLine>()
  const claimed = new Set<number>()
  for (const [itemIndex, item] of itemLines.entries()) {
    const quoteIndexes = quoteLines.flatMap((line, index) =>
      !claimed.has(index) &&
      line.optionUnitId === item.optionUnitId &&
      (line.optionId == null || item.optionId == null || line.optionId === item.optionId)
        ? [index]
        : [],
    )
    if (quoteIndexes.length > 0) {
      for (const quoteIndex of quoteIndexes) claimed.add(quoteIndex)
      const quoted = quoteIndexes.flatMap((index) => (quoteLines[index] ? [quoteLines[index]] : []))
      const totalAmountCents = quoted.reduce((sum, line) => sum + line.totalAmountCents, 0)
      matched.set(itemIndex, {
        optionId: item.optionId ?? undefined,
        optionUnitId: item.optionUnitId,
        quantity: item.quantity,
        unitAmountCents:
          quoted.length === 1 && quoted[0]?.quantity === item.quantity
            ? quoted[0].unitAmountCents
            : Math.floor(totalAmountCents / Math.max(1, item.quantity)),
        totalAmountCents,
        label: quoted[0]?.label ?? null,
      })
    }
  }

  const unmatchedItems = itemLines.flatMap((_, index) => (matched.has(index) ? [] : [index]))
  const unmatchedQuotes = quoteLines.flatMap((line, index) =>
    claimed.has(index) || line.optionUnitId != null ? [] : [{ line, index }],
  )
  if (
    unmatchedItems.length === unmatchedQuotes.length &&
    unmatchedItems.every(
      (itemIndex, index) =>
        itemLines[itemIndex]?.quantity === unmatchedQuotes[index]?.line.quantity,
    )
  ) {
    for (const [index, itemIndex] of unmatchedItems.entries()) {
      const quoted = unmatchedQuotes[index]?.line
      if (quoted) matched.set(itemIndex, quoted)
    }
  }
  return matched
}

function allocateExactTotal(total: number, weights: readonly number[]): number[] {
  if (weights.length === 0) return []
  const positiveWeights = weights.map((weight) => Math.max(0, weight))
  const denominator = positiveWeights.reduce((sum, weight) => sum + weight, 0)
  if (denominator <= 0) return positiveWeights.map((_, index) => (index === 0 ? total : 0))

  let allocated = 0
  return positiveWeights.map((weight, index) => {
    const amount =
      index === positiveWeights.length - 1
        ? total - allocated
        : Math.floor((total * weight) / denominator)
    allocated += amount
    return amount
  })
}

// Mirrors `isRealEmail` in @voyant-travel/finance's `requireCompleteBookingParty`
// (and the trips copy). The owned booking handler resolves a CRM person from the
// billing contact before calling `createBooking`, which rejects a blank or
// placeholder email — so the resolver must apply the same rule up front, or it
// orphans a CRM person on every failed checkout. Keep this set in sync with
// finance's `placeholderEmails`.
const placeholderBillingEmails = new Set([
  "noreply@example.com",
  "tbd@example.com",
  "traveler@example.com",
])

export function isRealBillingEmail(value: string | null | undefined): value is string {
  const normalized = value?.trim().toLowerCase() ?? ""
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) && !placeholderBillingEmails.has(normalized)
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export function resolveSellAmountCentsOverride(pricing: PricingBasis | undefined): number | null {
  if (!pricing) return null
  const breakdown = pricing.breakdown
  if (hasInclusiveTaxLine(breakdown)) {
    const total = readBreakdownTotal(breakdown)
    if (total != null) return total
  }
  return pricing.base_amount != null ? Math.round(pricing.base_amount) : null
}

export function hasInclusiveTaxLine(breakdown: unknown): boolean {
  if (!breakdown || typeof breakdown !== "object" || Array.isArray(breakdown)) return false
  const taxes = (breakdown as { taxes?: unknown }).taxes
  if (!Array.isArray(taxes)) return false
  return taxes.some((tax) => {
    if (!tax || typeof tax !== "object" || Array.isArray(tax)) return false
    const row = tax as Record<string, unknown>
    return row.includedInPrice === true || row.scope === "included"
  })
}

export function readBreakdownTotal(breakdown: unknown): number | null {
  if (!breakdown || typeof breakdown !== "object" || Array.isArray(breakdown)) return null
  const total = (breakdown as { total?: unknown }).total
  return typeof total === "number" && Number.isFinite(total) ? Math.round(total) : null
}

export function asFiniteInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return Math.round(value)
}
