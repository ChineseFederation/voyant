// agent-quality: file-size exception -- booking-engine pricing and draft helpers stay together until the owned products handler support layer is split.
import type {
  AddonOffer,
  OwnedHandlerContext,
  ProductVariantOption,
} from "@voyant-travel/catalog/booking-engine"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { and, eq, gte, isNull, lte, or } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { productPaxPricingTiers, products } from "../schema-core.js"
import type {
  CreateProductsBookingHandlerOptions,
  DraftLike,
  ResolvedOptionPrice,
  ResolvedPaxPricingTier,
} from "./handler.js"

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
}): Promise<PricedQuote> {
  const lines: PricedLine[] = []
  let totalCents = 0
  const optionsById = new Map(input.productOptions.map((option) => [option.id, option]))
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
          ? assignedTravelerKeys.length > 0
            ? (assignedTravelerBandCounts.get(band) ?? 0)
            : (input.pax?.[band] ?? 0)
          : 0
        const optionBandKey =
          assignedTravelerKeys.length > 0
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
          label: `${unitLabel} — ${band}`,
          optionId: selection.optionId,
          ...(selection.optionUnitId ? { optionUnitId: selection.optionUnitId } : {}),
        })
      }
      continue
    }
    const assignedTravelerCount = assignedTravelerKeys.length
    const pricingQuantity =
      defaultUnitPrice?.pricingMode === "per_person"
        ? assignedTravelerCount > 0
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
    if (unitAmount <= 0) continue
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
}): PricedQuote {
  const { product, resolvedPrice, pax, effectivePax } = input

  if (resolvedPrice && resolvedPrice.unitPrices.length > 0) {
    const bandLines: PricedLine[] = []
    let total = 0
    for (const unit of resolvedPrice.unitPrices) {
      if (!unit.travelerCategory) continue
      const count = pax?.[unit.travelerCategory] ?? 0
      if (count <= 0) continue
      const sell = unit.sellAmountCents ?? 0
      if (sell <= 0) continue
      const lineTotal = sell * count
      total += lineTotal
      bandLines.push({
        kind: "base",
        label: `${product.name} — ${unit.travelerCategory}`,
        quantity: count,
        unitAmount: sell,
        totalAmount: lineTotal,
        pricingBasis: "per_person",
      })
    }
    if (bandLines.length > 0) {
      return { totalCents: total, lines: bandLines }
    }
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
