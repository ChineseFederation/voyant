"use client"

import {
  Badge,
  Button,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@voyant-travel/ui/components"
import { Image as MediaImage } from "@voyant-travel/ui/components/image"
import { ArrowRight, Calendar, ImageIcon, Layers, MapPin, Route, Tag } from "lucide-react"
import type { ReactNode } from "react"
import { useProductsUiI18nOrDefault, useProductsUiMessagesOrDefault } from "../i18n/provider.js"
import {
  type ProductRecord,
  useProduct,
  useProductDays,
  useProductMedia,
  useProductOptions,
} from "../index.js"

export interface ProductQuickViewSheetProps {
  productId: string | null | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Wired to the "View full product" footer button. Receives the product
   * so the host can route to its detail page. When omitted, the footer
   * action is suppressed.
   */
  onViewFull?: (product: ProductRecord) => void
  /** Optional locale override; defaults to the active i18n locale. */
  locale?: string
}

/**
 * Right-side sheet that previews the core info for a product without
 * navigating away. Mirrors `BookingQuickViewSheet` shape (header with
 * status badge + total, sectioned body, "View full" footer) so the
 * pair feels native on the slot detail / allocation views where both
 * sheets coexist.
 */
export function ProductQuickViewSheet({
  productId,
  open,
  onOpenChange,
  onViewFull,
  locale,
}: ProductQuickViewSheetProps) {
  const i18n = useProductsUiI18nOrDefault()
  const messages = useProductsUiMessagesOrDefault()
  const detail = messages.productDetailPage
  const resolvedLocale = locale ?? i18n.locale

  const query = useProduct(productId ?? undefined, {
    enabled: open && Boolean(productId),
  })
  const product = query.data ?? null
  const isLoading = Boolean(productId) && query.fetchStatus === "fetching" && !product

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="data-[side=right]:w-full sm:max-w-md">
        <SheetHeader className="border-b">
          {product ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <SheetTitle className="text-base font-semibold">{product.name}</SheetTitle>
                <Badge variant="outline" className="shrink-0 capitalize">
                  {messages.common.productStatusLabels[product.status] ?? product.status}
                </Badge>
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {formatAmount(
                  product.sellAmountCents,
                  product.sellCurrency,
                  resolvedLocale,
                  detail.states.noDescription,
                )}
              </div>
            </>
          ) : (
            <SheetTitle>{detail.states.loading}</SheetTitle>
          )}
        </SheetHeader>
        <SheetBody className="flex flex-col gap-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{messages.common.loading}</p>
          ) : !product ? (
            <p className="text-sm text-muted-foreground">{detail.states.notFoundDescription}</p>
          ) : (
            <QuickViewBody product={product} locale={resolvedLocale} />
          )}
        </SheetBody>
        {onViewFull && product ? (
          <SheetFooter>
            <Button type="button" className="w-full" onClick={() => onViewFull(product)}>
              {/* i18n-literal-ok scoped quick-view CTA, paired with ArrowRight */}
              View full product
              <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Button>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function QuickViewBody({ product, locale }: { product: ProductRecord; locale: string }) {
  const messages = useProductsUiMessagesOrDefault()
  const detail = messages.productDetailPage
  const mediaQuery = useProductMedia(product.id, { limit: 1 })
  const cover =
    (mediaQuery.data?.data ?? []).find((m) => m.isCover) ?? mediaQuery.data?.data?.[0] ?? null
  const daysQuery = useProductDays(product.id)
  const days = (daysQuery.data?.data ?? []).slice().sort((a, b) => a.dayNumber - b.dayNumber)
  const optionsQuery = useProductOptions({ productId: product.id, limit: 25 })
  const options = (optionsQuery.data?.data ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder)

  const dateRange = product.startDate
    ? product.endDate && product.endDate !== product.startDate
      ? `${formatDate(product.startDate, locale, detail.states.noDescription)} - ${formatDate(
          product.endDate,
          locale,
          detail.states.noDescription,
        )}`
      : formatDate(product.startDate, locale, detail.states.noDescription)
    : null

  return (
    <div className="flex flex-col gap-4">
      {cover ? (
        <div className="overflow-hidden rounded-md border bg-muted">
          <MediaImage
            src={cover.url}
            alt={product.name}
            className="aspect-video w-full object-cover"
          />
        </div>
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-md border bg-muted text-muted-foreground">
          <ImageIcon className="size-6" aria-hidden="true" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="capitalize">
          {messages.common.productBookingModeLabels[product.bookingMode] ?? product.bookingMode}
        </Badge>
        <Badge variant="outline" className="capitalize">
          {messages.common.productCapacityModeLabels[product.capacityMode] ?? product.capacityMode}
        </Badge>
      </div>

      {product.description ? (
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{product.description}</p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        {dateRange ? (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span>{dateRange}</span>
          </div>
        ) : null}
      </div>

      {options.length > 0 ? (
        <Section
          icon={<Layers className="h-3.5 w-3.5" />}
          /* i18n-literal-ok scoped section heading */
          label="Options"
          count={String(options.length)}
        >
          <ul className="flex flex-col gap-2">
            {options.map((option) => (
              <li
                key={option.id}
                className="flex items-start justify-between gap-3 border-l-2 border-border pl-3"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">{option.name}</span>
                  {option.description ? (
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {option.isDefault ? (
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {/* i18n-literal-ok scoped quick-view marker */}
                      Default
                    </Badge>
                  ) : null}
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {messages.common.optionStatusLabels[option.status] ?? option.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {days.length > 0 ? (
        <Section
          icon={<Route className="h-3.5 w-3.5" />}
          label={detail.sections.itinerary.title}
          count={String(days.length)}
        >
          <ol className="flex flex-col gap-3">
            {days.map((day) => (
              <li key={day.id} className="flex flex-col gap-1 border-l-2 border-border pl-3">
                <div className="flex items-baseline gap-2 text-sm font-medium">
                  {/* i18n-literal-ok numeric day prefix; the title carries the localized copy */}
                  <span className="text-muted-foreground">{`Day ${day.dayNumber}`}</span>
                  {day.title ? <span className="truncate">{day.title}</span> : null}
                </div>
                {day.location ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{day.location}</span>
                  </div>
                ) : null}
                {day.description ? (
                  <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                    {day.description}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {product.tags.length > 0 ? (
        <Section icon={<Tag className="h-3.5 w-3.5" />} label={detail.fields.tags}>
          <div className="flex flex-wrap items-center gap-1.5">
            {product.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  )
}

function Section({
  icon,
  label,
  count,
  children,
}: {
  icon: ReactNode
  label: string
  count?: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2 border-t pt-4">
      <header className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span className="flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        {count ? <span className="font-mono normal-case">{count}</span> : null}
      </header>
      {children}
    </section>
  )
}

function formatAmount(
  cents: number | null,
  currency: string,
  locale: string,
  empty: string,
): string {
  if (cents == null) return empty
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

function formatDate(iso: string | null, locale: string, empty: string): string {
  if (!iso) return empty
  return new Date(iso).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}
