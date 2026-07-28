"use client"

import { useProduct, useProductMedia } from "@voyant-travel/inventory-react"
import { ImageIcon } from "lucide-react"
import * as React from "react"
import type { BookingsUiMessages } from "../i18n/messages.js"
import { useBookingsUiI18nOrDefault } from "../i18n/provider.js"
import type { BookingCreateExtraLineInput } from "../index.js"
import { useBookingTaxPreview } from "../index.js"
import { PriceBreakdownSection, type PriceBreakdownValue } from "./price-breakdown-section.js"
import type { TravelerEntry } from "./travelers-section.js"

/**
 * Right-rail live preview for the booking-create dialog. Mirrors the
 * operator's in-progress selections — product (with thumbnail),
 * departure, options + quantities, travelers, and the current
 * confirmed price — so the operator gets a "what am I about to book"
 * summary without scrolling back through the form.
 */
export function BookingPreviewCard({
  productId,
  productName,
  isSourcedProduct = false,
  quotePricing,
  optionId,
  slotId,
  slotLabel,
  unitQuantities,
  unitLabels,
  pricingCategoryQuantities,
  pricingCategoryLabels,
  extraLines,
  travelers,
  messages,
  onPricingChange,
}: {
  productId: string
  productName?: string | null
  isSourcedProduct?: boolean
  quotePricing?: {
    totalAmountCents: number
    currency: string
    lines?: ReadonlyArray<{
      kind: string
      label: string
      quantity?: number
      unitAmount: number
      totalAmount: number
    }>
  }
  optionId: string | null
  slotId: string | null
  slotLabel: string | null
  unitQuantities: Record<string, number>
  unitLabels: Record<string, string>
  pricingCategoryQuantities: Record<string, Record<string, number>>
  pricingCategoryLabels: Record<string, string>
  extraLines: BookingCreateExtraLineInput[]
  travelers: TravelerEntry[]
  messages: BookingsUiMessages
  onPricingChange: (value: PriceBreakdownValue) => void
}) {
  const { formatCurrency, formatNumber } = useBookingsUiI18nOrDefault()
  const productQuery = useProduct(productId || undefined, {
    enabled: Boolean(productId) && !isSourcedProduct,
  })
  const mediaQuery = useProductMedia(productId, {
    limit: 1,
    enabled: Boolean(productId) && !isSourcedProduct,
  })
  const product = productQuery.data ?? null
  const cover = (mediaQuery.data?.data ?? []).find((m) => m.isCover) ?? mediaQuery.data?.data?.[0]
  const labels = messages.bookingCreateDialog.labels
  // Mirror the breakdown locally so we can drive the tax preview hook
  // off the same `confirmedAmountCents` the parent receives via
  // onPricingChange. Manual overrides flow through the same field, so
  // the tax line follows whatever the operator decides to charge.
  const [breakdown, setBreakdown] = React.useState<PriceBreakdownValue | null>(null)
  const lastBreakdownKeyRef = React.useRef("")
  const handlePricingChange = React.useCallback(
    (value: PriceBreakdownValue) => {
      const extraTotal = extraLines.reduce((sum, line) => sum + (line.totalSellAmountCents ?? 0), 0)
      const next =
        extraTotal > 0 && !isSourcedProduct
          ? {
              ...value,
              catalogAmountCents:
                value.catalogAmountCents == null ? null : value.catalogAmountCents + extraTotal,
              confirmedAmountCents:
                value.confirmedAmountCents == null ? null : value.confirmedAmountCents + extraTotal,
              lines: [
                ...value.lines,
                ...extraLines.map((line) => ({
                  unitId: `extra:${line.productExtraId}`,
                  label: line.name,
                  quantity: line.quantity,
                  unitAmountCents: line.unitSellAmountCents ?? null,
                  totalAmountCents: line.totalSellAmountCents ?? null,
                  tierLabel: null,
                  isGroupRate: false,
                })),
              ],
            }
          : value
      const nextKey = JSON.stringify(next)
      if (nextKey === lastBreakdownKeyRef.current) return
      lastBreakdownKeyRef.current = nextKey
      setBreakdown(next)
      onPricingChange(next)
    },
    [extraLines, isSourcedProduct, onPricingChange],
  )
  const providedPricing = React.useMemo(
    () =>
      quotePricing
        ? {
            ...quotePricing,
            label: productName ?? undefined,
          }
        : undefined,
    [productName, quotePricing],
  )
  const taxSubtotalCents = breakdown?.confirmedAmountCents ?? breakdown?.catalogAmountCents ?? 0
  const taxCurrency = breakdown?.currency ?? "EUR"
  const taxPreview = useBookingTaxPreview({
    productId,
    subtotalCents: taxSubtotalCents,
    currency: taxCurrency,
    enabled: Boolean(productId) && taxSubtotalCents > 0 && !isSourcedProduct,
  })
  const previewMessages = {
    heading: labels.previewHeading,
    empty: labels.previewEmpty,
    product: labels.previewProduct,
    departure: labels.previewDeparture,
    travelers: labels.previewTravelers,
    loading: labels.previewLoading,
    travelerUnnamed: labels.previewTravelerUnnamed,
  }

  const showPriceBreakdown = Boolean(productId && (isSourcedProduct ? quotePricing : slotId))
  const hasContent =
    Boolean(productId) || slotLabel != null || travelers.length > 0 || showPriceBreakdown

  return (
    <aside>
      <div className="flex flex-col gap-4 rounded-md border bg-muted/10 p-4">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {previewMessages.heading}
        </div>

        {!hasContent ? (
          <p className="text-xs text-muted-foreground">{previewMessages.empty}</p>
        ) : null}

        {productId ? (
          <div className="flex gap-3">
            {cover?.url ? (
              <img
                src={cover.url}
                alt={product?.name ?? productName ?? ""}
                className="h-14 w-14 shrink-0 rounded-md object-cover ring-1 ring-border"
                loading="lazy"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <ImageIcon className="h-5 w-5" />
              </div>
            )}
            <div className="flex min-w-0 flex-col">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {previewMessages.product}
              </span>
              <span className="truncate text-sm font-medium">
                {product?.name ?? productName ?? previewMessages.loading}
              </span>
            </div>
          </div>
        ) : null}

        {slotLabel ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {previewMessages.departure}
            </span>
            <span className="text-sm">{slotLabel}</span>
          </div>
        ) : null}

        {travelers.length > 0 ? (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {previewMessages.travelers}
            </span>
            <ul className="flex flex-col gap-0.5 text-sm">
              {travelers.map((traveler, idx) => {
                const name = [traveler.firstName, traveler.lastName]
                  .filter((part) => part.trim().length > 0)
                  .join(" ")
                  .trim()
                const categoryLabel = traveler.pricingCategoryId
                  ? pricingCategoryLabels[traveler.pricingCategoryId]
                  : null
                return (
                  <li
                    key={traveler.clientTravelerKey ?? traveler.personId ?? `traveler-${idx}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="truncate text-muted-foreground">
                      {name || previewMessages.travelerUnnamed}
                    </span>
                    <span className="shrink-0 text-xs uppercase tracking-wider text-muted-foreground">
                      {categoryLabel ?? traveler.role}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        {/* Priced lines + totals + manual override live inside the same
            summary card now — the standalone price-breakdown card was
            duplicating the option/total rows shown above. */}
        {showPriceBreakdown ? (
          <div className="border-t pt-3">
            <PriceBreakdownSection
              flat
              productId={productId}
              optionId={optionId}
              unitQuantities={unitQuantities}
              unitLabels={unitLabels}
              pricingCategoryQuantities={pricingCategoryQuantities}
              pricingCategoryLabels={pricingCategoryLabels}
              providedPricing={providedPricing}
              labels={{
                heading: labels.breakdownHeading,
                total: labels.breakdownTotal,
                onRequest: labels.breakdownOnRequest,
                groupRate: labels.breakdownGroupRate,
                empty: labels.breakdownEmpty,
                noPricing: labels.breakdownNoPricing,
                confirmedTotal: labels.breakdownConfirmedTotal,
                manualTotal: labels.breakdownManualTotal,
                useCatalogTotal: labels.breakdownUseCatalogTotal,
                overrideReason: labels.breakdownOverrideReason,
                overrideReasonPlaceholder: labels.breakdownOverrideReasonPlaceholder,
                overrideReasonRequired: labels.breakdownOverrideReasonRequired,
              }}
              onChange={handlePricingChange}
            />
            {extraLines.length > 0 ? (
              <div className="mt-2 flex flex-col gap-1.5 border-t pt-2 text-sm">
                {extraLines.map((line) => (
                  <div
                    key={line.productExtraId}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="tabular-nums">{formatNumber(line.quantity)}x</span>
                      <span>{line.name}</span>
                    </div>
                    <div className="tabular-nums">
                      {line.totalSellAmountCents == null || !line.sellCurrency
                        ? labels.breakdownOnRequest
                        : formatCurrency(line.totalSellAmountCents / 100, line.sellCurrency)}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {taxPreview.data?.data && taxPreview.data.data.taxCents > 0 ? (
              <TaxPreviewRows
                snapshot={taxPreview.data.data}
                labels={{
                  subtotal: labels.breakdownSubtotal,
                  tax: labels.breakdownTax,
                  taxIncluded: labels.breakdownTaxIncluded,
                  total: labels.breakdownTotal,
                }}
                formatAmount={(cents, currency) => formatCurrency(cents / 100, currency)}
                formatRate={(basisPoints) =>
                  formatNumber(basisPoints / 100, {
                    maximumFractionDigits: 2,
                    minimumFractionDigits: 0,
                  })
                }
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  )
}

function TaxPreviewRows({
  snapshot,
  labels,
  formatAmount,
  formatRate,
}: {
  snapshot: {
    subtotalCents: number
    taxCents: number
    totalCents: number
    currency: string
    taxRate: { code: string; label: string; rateBasisPoints: number; priceMode: string } | null
  }
  labels: { subtotal: string; tax: string; taxIncluded: string; total: string }
  formatAmount: (cents: number, currency: string) => string
  formatRate: (basisPoints: number) => string
}) {
  const inclusive = snapshot.taxRate?.priceMode === "inclusive"
  const ratePart = snapshot.taxRate ? ` (${formatRate(snapshot.taxRate.rateBasisPoints)}%)` : ""
  const inclTag = inclusive ? ` · ${labels.taxIncluded}` : ""
  return (
    <div className="mt-3 flex flex-col gap-1 border-t pt-3 text-sm">
      <div className="flex items-center justify-between text-muted-foreground">
        <span>{labels.subtotal}</span>
        <span>{formatAmount(snapshot.subtotalCents, snapshot.currency)}</span>
      </div>
      <div className="flex items-center justify-between text-muted-foreground">
        <span>
          {snapshot.taxRate?.label ?? labels.tax}
          {ratePart}
          {inclTag}
        </span>
        <span>{formatAmount(snapshot.taxCents, snapshot.currency)}</span>
      </div>
      <div className="flex items-center justify-between font-medium">
        <span>{labels.total}</span>
        <span>{formatAmount(snapshot.totalCents, snapshot.currency)}</span>
      </div>
    </div>
  )
}
