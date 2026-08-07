"use client"

import { useProduct } from "@voyant-travel/inventory-react"
import { classifyOccupancyPrice } from "@voyant-travel/products-contracts/occupancy-pricing"
import { Button, Label, Textarea } from "@voyant-travel/ui/components"
import { CurrencyInput } from "@voyant-travel/ui/components/currency-input"
import * as React from "react"
import { useBookingsUiI18nOrDefault, useBookingsUiMessagesOrDefault } from "../i18n/provider.js"
import { usePricingPreview } from "../index.js"

export interface PriceBreakdownLine {
  unitId: string
  pricingCategoryId?: string | null
  label: string
  quantity: number
  /** Per-unit price for the matched tier/row. `null` = on-request pricing. */
  unitAmountCents: number | null
  /** `unitAmountCents * quantity` or null when on-request. */
  totalAmountCents: number | null
  /**
   * Populated when a non-default tier matched — operator-visible "N × 100 EUR
   * — group rate" kind of hint. Null for the default tier / single-price row.
   */
  tierLabel: string | null
  isGroupRate: boolean
  pricingBasis?: "per_person" | "per_unit" | "per_booking"
}

export interface PriceBreakdownValue {
  catalogAmountCents: number | null
  confirmedAmountCents: number | null
  currency: string | null
  priceOverrideReason: string
  isManualOverride: boolean
  requiresReason: boolean
  lines: PriceBreakdownLine[]
}

export interface PriceBreakdownSectionProps {
  productId?: string
  optionId?: string | null
  /** Quantity per option_unit id, typically from OptionUnitsStepperSection. */
  unitQuantities: Record<string, number>
  /** Display labels keyed by option_unit id. */
  unitLabels?: Record<string, string>
  /** Traveler pricing quantities keyed by option_unit id and pricing_category id. */
  pricingCategoryQuantities?: Record<string, Record<string, number>>
  /** Display labels keyed by pricing_category id. */
  pricingCategoryLabels?: Record<string, string>
  /**
   * Force a specific catalog. Defaults to the public catalog the storefront
   * uses — matches what a customer would see.
   */
  catalogId?: string | null
  /** Authoritative live quote for a supplier-sourced product. */
  providedPricing?: {
    totalAmountCents: number
    currency: string
    label?: string
    lines?: ReadonlyArray<{
      kind: string
      label: string
      quantity?: number
      unitAmount: number
      totalAmount: number
      pricingBasis?: "per_person" | "per_unit" | "per_booking"
    }>
  }
  labels?: {
    heading?: string
    total?: string
    onRequest?: string
    groupRate?: string
    empty?: string
    noPricing?: string
    confirmedTotal?: string
    manualTotal?: string
    useCatalogTotal?: string
    overrideReason?: string
    overrideReasonPlaceholder?: string
    overrideReasonRequired?: string
    perPerson?: string
    perUnit?: string
    perBooking?: string
  }
  onChange?: (value: PriceBreakdownValue) => void
  /**
   * When true, the section drops its bordered card wrapper and the
   * heading label — for embedding inside another card (e.g. the
   * booking-summary panel) where the parent owns the chrome.
   */
  flat?: boolean
}

interface TierRow {
  minQuantity: number
  maxQuantity: number | null
  sellAmountCents: number | null
}

interface UnitPriceLookupRow {
  unitId: string
  pricingCategoryId?: string | null
}

export function createUnitPriceLookup<TUnitPrice extends UnitPriceLookupRow>(
  unitPrices: ReadonlyArray<TUnitPrice>,
): (unitId: string, pricingCategoryId: string | null) => TUnitPrice | undefined {
  const defaultUnitPricesByUnit = new Map<string, TUnitPrice>()
  const unitPricesByUnitAndCategory = new Map<string, TUnitPrice>()
  for (const unitPrice of unitPrices) {
    if (unitPrice.pricingCategoryId) {
      unitPricesByUnitAndCategory.set(
        `${unitPrice.unitId}:${unitPrice.pricingCategoryId}`,
        unitPrice,
      )
      continue
    }

    if (!defaultUnitPricesByUnit.has(unitPrice.unitId)) {
      defaultUnitPricesByUnit.set(unitPrice.unitId, unitPrice)
    }
  }

  return (unitId, pricingCategoryId) => {
    if (!pricingCategoryId) return defaultUnitPricesByUnit.get(unitId)
    return (
      unitPricesByUnitAndCategory.get(`${unitId}:${pricingCategoryId}`) ??
      defaultUnitPricesByUnit.get(unitId)
    )
  }
}

/**
 * Picks the tier whose quantity range contains `qty`. Tiers are expected
 * oldest-to-newest, `minQuantity`-ascending. Ties are broken by first-match —
 * the server sorts by sort_order and then min_quantity, so the selection here
 * mirrors the storefront engine.
 */
function matchTier(tiers: ReadonlyArray<TierRow>, qty: number): TierRow | null {
  for (const tier of tiers) {
    if (
      qty >= tier.minQuantity &&
      (tier.maxQuantity === null || qty <= tier.maxQuantity) // i18n-literal-ok numeric bounds
    ) {
      return tier
    }
  }
  return null
}

/**
 * Live price-breakdown preview for booking-create flows. Read-only — uses
 * `usePricingPreview` (#237) to fetch the catalog-resolved snapshot the
 * storefront also uses, then computes lines against the operator's current
 * unit quantities so the operator sees the same numbers the customer would.
 *
 * ### Pricing mode handling
 *
 * - `per_unit` — multiply the matched tier's `sellAmountCents` by quantity.
 * - `free` / `included` — render 0.00 without an on-request badge.
 * - `on_request` / anything else — render "On request"; total excludes it.
 */
export function PriceBreakdownSection({
  productId,
  optionId,
  unitQuantities,
  unitLabels,
  pricingCategoryQuantities,
  pricingCategoryLabels,
  catalogId,
  providedPricing,
  labels,
  onChange,
  flat = false,
}: PriceBreakdownSectionProps) {
  const { formatCurrency, formatNumber } = useBookingsUiI18nOrDefault()
  const messages = useBookingsUiMessagesOrDefault()
  const merged = { ...messages.priceBreakdownSection.labels, ...labels }
  const preview = usePricingPreview({
    productId: productId ?? "",
    optionId: optionId ?? null,
    catalogId: catalogId ?? null,
    enabled: Boolean(productId) && !providedPricing,
  })
  const productQuery = useProduct(productId, {
    enabled: Boolean(productId) && !providedPricing,
  })
  const quantitiesKey = React.useMemo(() => JSON.stringify(unitQuantities), [unitQuantities])
  const [manualAmountCents, setManualAmountCents] = React.useState<number | null>(null)
  const [overrideReason, setOverrideReason] = React.useState("")

  // biome-ignore lint/correctness/useExhaustiveDependencies: #935 reset manual confirmation when the priced selection changes
  React.useEffect(() => {
    setManualAmountCents(null)
    setOverrideReason("")
  }, [
    productId,
    optionId,
    catalogId,
    quantitiesKey,
    providedPricing?.totalAmountCents,
    providedPricing?.currency,
  ])

  const snapshot = preview.data?.data
  const fallbackProduct = productQuery.data
  const fallbackUnitAmountCents = fallbackProduct?.sellAmountCents ?? null
  const currency =
    providedPricing?.currency ??
    snapshot?.catalog.currencyCode ??
    fallbackProduct?.sellCurrency ??
    null
  const formatAmount = React.useCallback(
    (cents: number) =>
      currency
        ? formatCurrency(cents / 100, currency)
        : formatNumber(cents / 100, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
    [currency, formatCurrency, formatNumber],
  )

  const { lines, total } = React.useMemo(() => {
    if (providedPricing) {
      const providedLines = providedPricing.lines ?? []
      const lines: PriceBreakdownLine[] =
        providedLines.length > 0
          ? providedLines.map((line, index) => ({
              unitId: `quote:${line.kind}:${index}`,
              label: line.label,
              quantity: line.quantity ?? 1,
              unitAmountCents: line.unitAmount,
              totalAmountCents: line.totalAmount,
              tierLabel: null,
              isGroupRate: false,
              pricingBasis: line.pricingBasis,
            }))
          : [
              {
                unitId: "quote:total",
                label: providedPricing.label ?? merged.total,
                quantity: 1,
                unitAmountCents: providedPricing.totalAmountCents,
                totalAmountCents: providedPricing.totalAmountCents,
                tierLabel: null,
                isGroupRate: false,
                pricingBasis: "per_booking",
              },
            ]
      return {
        lines,
        total: providedPricing.totalAmountCents,
      }
    }
    const out: PriceBreakdownLine[] = []
    let runningTotal = 0
    let anyOnRequest = false

    if (!snapshot) {
      if (fallbackUnitAmountCents === null) return { lines: out, total: null as number | null }

      for (const [unitId, quantity] of Object.entries(unitQuantities)) {
        if (quantity <= 0) continue
        const lineTotal = fallbackUnitAmountCents * quantity
        out.push({
          unitId,
          label: unitLabels?.[unitId] ?? fallbackProduct?.name ?? unitId,
          quantity,
          unitAmountCents: fallbackUnitAmountCents,
          totalAmountCents: lineTotal,
          tierLabel: null,
          isGroupRate: false,
        })
        runningTotal += lineTotal
      }

      return { lines: out, total: runningTotal }
    }

    // Pick the default price rule for the resolved option (snapshot already
    // filters options by the caller's optionId; rules keep isDefault-first
    // ordering from the server).
    const rulesByOption = new Map<string, (typeof snapshot.rules)[number][]>()
    for (const rule of snapshot.rules) {
      const existing = rulesByOption.get(rule.optionId) ?? []
      existing.push(rule)
      rulesByOption.set(rule.optionId, existing)
    }

    const findUnitPrice = createUnitPriceLookup(snapshot.unitPrices)
    const selectedRules = new Map<
      string,
      {
        rule: (typeof snapshot.rules)[number]
        hasRoomPrice: boolean
        roomAmountCents: number
        travelerCount: number
        fallbackCount: number
      }
    >()

    for (const [unitId, quantity] of Object.entries(unitQuantities)) {
      if (quantity <= 0) continue
      const categoryEntries = Object.entries(pricingCategoryQuantities?.[unitId] ?? {}).filter(
        ([, categoryQuantity]) => categoryQuantity > 0,
      )
      const selections =
        categoryEntries.length > 0
          ? categoryEntries.map(([pricingCategoryId, categoryQuantity]) => ({
              pricingCategoryId,
              quantity: categoryQuantity,
              unitPrice: findUnitPrice(unitId, pricingCategoryId),
            }))
          : [
              {
                pricingCategoryId: null,
                quantity,
                unitPrice: findUnitPrice(unitId, null),
              },
            ]

      for (const selection of selections) {
        const up = selection.unitPrice
        if (!up) {
          // The unit isn't priced in this catalog — show it on-request so the
          // operator knows they need to quote manually.
          out.push({
            unitId,
            pricingCategoryId: selection.pricingCategoryId,
            label: unitLabels?.[unitId] ?? unitId,
            quantity: selection.quantity,
            unitAmountCents: null,
            totalAmountCents: null,
            tierLabel: null,
            isGroupRate: false,
          })
          anyOnRequest = true
          continue
        }

        const rule = snapshot.rules.find((candidate) => candidate.id === up.optionPriceRuleId)
        if (rule) {
          const selected = selectedRules.get(rule.id) ?? {
            rule,
            hasRoomPrice: false,
            roomAmountCents: 0,
            travelerCount: 0,
            fallbackCount: 0,
          }
          if (up.unitType === "room") selected.hasRoomPrice = true
          if (up.unitType === "person") selected.travelerCount += selection.quantity
          selected.fallbackCount = Math.max(selected.fallbackCount, selection.quantity)
          selectedRules.set(rule.id, selected)
        }

        const categoryLabel = selection.pricingCategoryId
          ? pricingCategoryLabels?.[selection.pricingCategoryId]
          : null
        const unitLabel = unitLabels?.[unitId] ?? up.unitName ?? unitId
        const label = categoryLabel ? `${unitLabel} · ${categoryLabel}` : unitLabel

        if (up.pricingMode === "on_request") {
          out.push({
            unitId,
            pricingCategoryId: selection.pricingCategoryId,
            label,
            quantity: selection.quantity,
            unitAmountCents: null,
            totalAmountCents: null,
            tierLabel: merged.onRequest,
            isGroupRate: false,
          })
          anyOnRequest = true
          continue
        }

        if (up.pricingMode === "free" || up.pricingMode === "included") {
          out.push({
            unitId,
            pricingCategoryId: selection.pricingCategoryId,
            label,
            quantity: selection.quantity,
            unitAmountCents: 0,
            totalAmountCents: 0,
            tierLabel: null,
            isGroupRate: false,
          })
          continue
        }

        // per_unit (and anything else that falls through to explicit amounts).
        const matchedTier = matchTier(up.tiers, selection.quantity)
        const unitAmount = matchedTier?.sellAmountCents ?? up.sellAmountCents
        if (unitAmount === null) {
          out.push({
            unitId,
            pricingCategoryId: selection.pricingCategoryId,
            label,
            quantity: selection.quantity,
            unitAmountCents: null,
            totalAmountCents: null,
            tierLabel: merged.onRequest,
            isGroupRate: false,
          })
          anyOnRequest = true
          continue
        }

        const lineTotal = unitAmount * selection.quantity
        const isGroupRate = matchedTier !== null && matchedTier.minQuantity > 1
        out.push({
          unitId,
          pricingCategoryId: selection.pricingCategoryId,
          label,
          quantity: selection.quantity,
          unitAmountCents: unitAmount,
          totalAmountCents: lineTotal,
          tierLabel: isGroupRate ? merged.groupRate : null,
          isGroupRate,
        })
        runningTotal += lineTotal
        if (up.unitType === "room" && rule) {
          const selected = selectedRules.get(rule.id)
          if (selected) selected.roomAmountCents += lineTotal
        }
      }
    }

    for (const selected of selectedRules.values()) {
      const baseAmountCents = selected.rule.baseSellAmountCents ?? 0
      let includeBase = baseAmountCents > 0
      if (selected.hasRoomPrice) {
        const classification = classifyOccupancyPrice({
          occupancyPriceBasis: selected.rule.occupancyPriceBasis,
          travelerBaseFareAmountCents: baseAmountCents,
          occupancyAmountCents: selected.roomAmountCents,
        })
        if (classification.status === "ambiguous") {
          anyOnRequest = true
          includeBase = false
        } else if (classification.occupancyPriceBasis === "all_in") {
          includeBase = false
        }
      }
      if (!includeBase) continue

      const quantity =
        selected.rule.pricingMode === "per_person"
          ? Math.max(1, selected.travelerCount || selected.fallbackCount)
          : 1
      const totalAmountCents = baseAmountCents * quantity
      out.unshift({
        unitId: `base:${selected.rule.id}`,
        label: merged.total,
        quantity,
        unitAmountCents: baseAmountCents,
        totalAmountCents,
        tierLabel: null,
        isGroupRate: false,
        pricingBasis: selected.rule.pricingMode === "per_person" ? "per_person" : "per_booking",
      })
      runningTotal += totalAmountCents
    }

    return { lines: out, total: anyOnRequest ? null : runningTotal }
  }, [
    snapshot,
    fallbackProduct?.name,
    fallbackUnitAmountCents,
    unitQuantities,
    unitLabels,
    pricingCategoryQuantities,
    pricingCategoryLabels,
    merged.onRequest,
    merged.groupRate,
    merged.total,
    providedPricing,
  ])

  const confirmedAmountCents = manualAmountCents ?? total
  const isManualOverride =
    manualAmountCents != null && (total === null || manualAmountCents !== total)
  const requiresReason = isManualOverride && overrideReason.trim().length === 0

  React.useEffect(() => {
    onChange?.({
      catalogAmountCents: total,
      confirmedAmountCents,
      currency,
      priceOverrideReason: overrideReason,
      isManualOverride,
      requiresReason,
      lines,
    })
  }, [
    confirmedAmountCents,
    currency,
    isManualOverride,
    lines,
    onChange,
    overrideReason,
    requiresReason,
    total,
  ])

  const manualTotalControls = (
    <div className="flex flex-col gap-2 border-t pt-2">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">{merged.manualTotal}</Label>
          <CurrencyInput
            value={manualAmountCents}
            onChange={setManualAmountCents}
            currency={currency ?? undefined}
            // CurrencyInput already renders the currency symbol + code
            // as addons; the placeholder must be the bare number so we
            // don't end up with `€ €790.00 EUR` showing.
            placeholder={
              total === null
                ? merged.onRequest
                : formatNumber(total / 100, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
            }
          />
        </div>
        {manualAmountCents != null ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setManualAmountCents(null)}
          >
            {merged.useCatalogTotal}
          </Button>
        ) : null}
      </div>
      {isManualOverride ? (
        <div className="flex flex-col gap-1">
          <Label className="text-xs">{merged.overrideReason}</Label>
          <Textarea
            value={overrideReason}
            onChange={(event) => setOverrideReason(event.target.value)}
            placeholder={merged.overrideReasonPlaceholder}
            rows={2}
          />
          {requiresReason ? (
            <p className="text-xs text-destructive">{merged.overrideReasonRequired}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )

  // Empty states
  if (!productId) return null
  const wrapperClassName = flat
    ? "flex flex-col gap-2" // i18n-literal-ok: tailwind utilities
    : "flex flex-col gap-2 rounded-md border p-3" // i18n-literal-ok: tailwind utilities
  if (
    !providedPricing &&
    (preview.isError || (preview.isSuccess && !snapshot)) &&
    fallbackUnitAmountCents === null
  ) {
    return (
      <div className={wrapperClassName}>
        {flat ? null : <Label>{merged.heading}</Label>}
        <p className="text-xs text-muted-foreground">{merged.noPricing}</p>
        {manualTotalControls}
      </div>
    )
  }
  if (lines.length === 0) {
    return (
      <div className={wrapperClassName}>
        {flat ? null : <Label>{merged.heading}</Label>}
        <p className="text-xs text-muted-foreground">{merged.empty}</p>
        {manualTotalControls}
      </div>
    )
  }

  return (
    <div className={wrapperClassName}>
      {flat ? null : <Label>{merged.heading}</Label>}
      <div className="flex flex-col gap-1.5">
        {lines.map((line) => (
          <div
            key={`${line.unitId}:${line.pricingCategoryId ?? "default"}`}
            className="flex items-baseline justify-between text-sm"
          >
            <div className="flex items-baseline gap-2">
              <span className="tabular-nums">{formatNumber(line.quantity)}x</span>
              <span>{line.label}</span>
              {line.tierLabel ? (
                <span className="text-xs text-muted-foreground">· {line.tierLabel}</span>
              ) : null}
              {line.pricingBasis ? (
                <span className="text-xs text-muted-foreground">
                  ·{" "}
                  {line.pricingBasis === "per_person"
                    ? merged.perPerson
                    : line.pricingBasis === "per_booking"
                      ? merged.perBooking
                      : merged.perUnit}
                </span>
              ) : null}
            </div>
            <div className="tabular-nums">
              {line.totalAmountCents === null
                ? merged.onRequest
                : formatAmount(line.totalAmountCents)}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex items-baseline justify-between border-t pt-2 text-sm font-medium">
        <span>{merged.total}</span>
        <span className="tabular-nums">
          {total === null ? merged.onRequest : formatAmount(total)}
        </span>
      </div>
      <div className="flex items-baseline justify-between text-sm font-medium">
        <span>{merged.confirmedTotal}</span>
        <span className="tabular-nums">
          {confirmedAmountCents === null ? merged.onRequest : formatAmount(confirmedAmountCents)}
        </span>
      </div>
      {manualTotalControls}
    </div>
  )
}
