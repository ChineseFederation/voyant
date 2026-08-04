import type { ContentResolution } from "@voyant-travel/catalog-react/storefront"
import { Button } from "@voyant-travel/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components/card"
import { Label } from "@voyant-travel/ui/components/label"
import { Skeleton } from "@voyant-travel/ui/components/skeleton"
import type React from "react"

import { StorefrontLink, type StorefrontUiMessages, useStorefrontUi } from "./context.js"

type DetailSharedMessages = StorefrontUiMessages["shopDetailShared"]

export interface AvailabilitySlot {
  id: string
  dateLocal: string
  startsAt: string
  endsAt?: string | null
  timezone: string
  status: string
  unlimited: boolean
  remainingPax?: number | null
  initialPax?: number | null
  nights?: number | null
  days?: number | null
}

export function DetailLayout({
  body,
  sidebar,
}: {
  body: React.ReactNode
  sidebar?: React.ReactNode
}): React.ReactElement {
  if (sidebar == null) {
    return <div className="pb-24 lg:pb-0">{body}</div>
  }

  return (
    <div className="grid grid-cols-1 gap-6 pb-24 lg:grid-cols-3 lg:pb-0">
      <div className="space-y-4 lg:col-span-2">{body}</div>
      <aside className="space-y-4 lg:sticky lg:top-6 lg:h-fit">{sidebar}</aside>
    </div>
  )
}

/**
 * The price panel on a detail page.
 *
 * It is fed by the non-binding Offer Preview (voyant#4188), not by a Quote:
 * nothing on a detail page has committed to booking yet, so no Booking Session
 * exists to quote against. `preview` is therefore a preview result, and
 * `unavailableReason` is the preview's vocabulary for "there is no price".
 */
export function BookingSidebar({
  children,
  totalPax,
  totalCents,
  currency,
  isPreviewing,
  preview,
  disabled,
  onBook,
}: {
  children: React.ReactNode
  totalPax: number
  totalCents: number
  currency: string | undefined
  isPreviewing: boolean
  preview: { available?: boolean; unavailableReason?: string } | null | undefined
  disabled: boolean
  onBook?: () => void
}): React.ReactElement {
  const t = useStorefrontUi().messages.shopDetailShared
  const priceLabel =
    totalCents > 0 && currency
      ? t.priceFrom.replace("{amount}", formatMoney(totalCents, currency))
      : preview?.unavailableReason
        ? "—"
        : t.pricePending
  const guestsLabel = totalPax === 1 ? t.guestSingular : t.guestPlural

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t.bookThis}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {totalPax} {guestsLabel}
            </span>
            {isPreviewing && !preview ? <Skeleton className="h-4 w-20" /> : null}
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-medium">{t.subtotal}</span>
            <span className="font-medium text-xl">{priceLabel}</span>
          </div>
          {preview?.unavailableReason ? (
            <p className="text-amber-600 text-xs">
              {humanizeUnavailableReason(preview.unavailableReason, t)}
            </p>
          ) : null}
          {onBook ? (
            <>
              <Button type="button" className="w-full" disabled={disabled} onClick={onBook}>
                {t.book}
              </Button>
              <p className="text-muted-foreground text-xs">{t.noChargeYet}</p>
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* Mobile fixed bottom panel — collapses sidebar on narrow viewports */}
      {onBook ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background p-3 shadow-lg lg:hidden">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-muted-foreground text-xs">
                {totalPax} {guestsLabel}
              </div>
              <div className="font-medium">{priceLabel}</div>
            </div>
            <Button type="button" disabled={disabled} onClick={onBook}>
              {t.book}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  )
}

export function DepartureSelect({
  slots,
  isLoading,
  isError,
  value,
  onChange,
}: {
  slots: ReadonlyArray<AvailabilitySlot>
  isLoading: boolean
  isError: boolean
  value: string | undefined
  onChange: (id: string) => void
}): React.ReactElement {
  const t = useStorefrontUi().messages.shopDetailShared
  return (
    <div className="space-y-1">
      <Label htmlFor="departure-select">{t.departure}</Label>
      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : isError ? (
        <p className="text-destructive text-sm">{t.departuresUnavailable}</p>
      ) : slots.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t.noUpcomingDepartures}</p>
      ) : (
        <select
          id="departure-select"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        >
          {slots.map((slot) => (
            <option key={slot.id} value={slot.id}>
              {formatSlotLabel(slot, t.slotLeft, t.nightsShort, t.daysShort)}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

/**
 * Fallback pax bounds, used only until the server says otherwise.
 *
 * They are guesses — "8 adults, 6 children, 4 infants" is true of no product in
 * particular. `bands` below replaces them with the target's real Booking
 * Requirements as soon as the Offer Preview returns them.
 */
const FALLBACK_PAX_BOUNDS: Record<string, { min: number; max: number }> = {
  adult: { min: 1, max: 8 },
  child: { min: 0, max: 6 },
  infant: { min: 0, max: 4 },
}

export function PaxBlock({
  adult,
  child,
  infant,
  setAdult,
  setChild,
  setInfant,
  showInfants = true,
  bands,
}: {
  adult: number
  child: number
  infant: number
  setAdult: (n: number) => void
  setChild: (n: number) => void
  setInfant: (n: number) => void
  showInfants?: boolean
  /**
   * The server's `requirements.paxBands` from the Offer Preview. When present,
   * each band's own `minCount`/`maxCount` bounds its stepper instead of the
   * hardcoded guess — a product that sells at most two adults stops offering a
   * third. Absent (no preview yet) falls back to {@link FALLBACK_PAX_BOUNDS},
   * so the steppers are usable before the first price lands.
   */
  bands?: ReadonlyArray<{ code: string; minCount: number; maxCount: number }>
}): React.ReactElement {
  const t = useStorefrontUi().messages.shopDetailShared
  const bound = (code: string) => paxBandBounds(bands, code)
  return (
    <div className="space-y-3">
      <Label>{t.travelers}</Label>
      <PaxStepper
        label={t.adults}
        hint={t.adultsHint}
        value={adult}
        setValue={setAdult}
        min={bound("adult").min}
        max={bound("adult").max}
      />
      <PaxStepper
        label={t.children}
        hint={t.childrenHint}
        value={child}
        setValue={setChild}
        min={bound("child").min}
        max={bound("child").max}
      />
      {showInfants ? (
        <PaxStepper
          label={t.infants}
          hint={t.infantsHint}
          value={infant}
          setValue={setInfant}
          min={bound("infant").min}
          max={bound("infant").max}
        />
      ) : null}
    </div>
  )
}

/**
 * Bounds for one canonical band.
 *
 * Band codes arrive either canonical (`"child"`) or tier-qualified
 * (`"child:pricing_categories_01j…"`) for a product selling several tiers of one
 * category, so match on the base code and take the widest window across the
 * tiers — the stepper counts the category as a whole.
 */
export function paxBandBounds(
  bands: ReadonlyArray<{ code: string; minCount: number; maxCount: number }> | undefined,
  code: string,
  /** What to use before the first preview lands. Defaults per canonical code. */
  fallback: { min: number; max: number } = FALLBACK_PAX_BOUNDS[code] ?? { min: 0, max: 8 },
): { min: number; max: number } {
  const matching = (bands ?? []).filter((band) => band.code.split(":")[0] === code)
  if (matching.length === 0) return fallback
  return {
    min: Math.min(...matching.map((band) => band.minCount)),
    max: Math.max(...matching.map((band) => band.maxCount)),
  }
}

export function PaxStepper({
  label,
  hint,
  value,
  setValue,
  min,
  max,
}: {
  label: string
  hint: string
  value: number
  setValue: (n: number) => void
  min: number
  max: number
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="font-medium text-sm">{label}</div>
        <div className="text-muted-foreground text-xs">{hint}</div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={value <= min}
          onClick={() => setValue(value - 1)}
        >
          −
        </Button>
        <span className="min-w-6 text-center">{value}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={value >= max}
          onClick={() => setValue(value + 1)}
        >
          +
        </Button>
      </div>
    </div>
  )
}

export function ContentResolutionHint({
  resolution,
}: {
  resolution: ContentResolution | null
}): React.ReactElement | null {
  const t = useStorefrontUi().messages.shopDetailShared
  if (!resolution) return null
  const hints: string[] = []
  if (resolution.match_kind && resolution.match_kind !== "exact" && resolution.served_locale) {
    hints.push(t.servedIn.replace("{locale}", resolution.served_locale))
  }
  if (resolution.machine_translated) {
    hints.push(t.machineTranslated)
  }
  if (resolution.source === "synthesized") {
    hints.push(t.limitedContent)
  }
  if (resolution.served_stale) {
    hints.push(t.refreshing)
  }
  if (hints.length === 0) return null
  return <div className="text-muted-foreground text-xs">{hints.join(" · ")}</div>
}

export function HeroImage({ url, alt }: { url: string; alt: string }): React.ReactElement {
  return (
    <div className="overflow-hidden rounded-lg border">
      <img src={url} alt={alt} className="aspect-[16/9] w-full object-cover" />
    </div>
  )
}

export function BackLink(): React.ReactElement {
  const t = useStorefrontUi().messages.shopDetailShared
  return (
    <p>
      <StorefrontLink href="/shop" to="/shop" className="text-sm underline">
        {t.backToAll}
      </StorefrontLink>
    </p>
  )
}

export function BodySkeleton(): React.ReactElement {
  return (
    <Card>
      <CardContent className="space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-64 w-full" />
      </CardContent>
    </Card>
  )
}

export function BodyMissing({
  entityModule,
  entityId,
}: {
  entityModule: string
  entityId: string
}): React.ReactElement {
  const t = useStorefrontUi().messages.shopDetailShared
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">
          {entityModule} · {entityId}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-muted-foreground text-sm">
        <p>{t.detailUnavailable}</p>
        <BackLink />
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function formatSlotLabel(
  slot: AvailabilitySlot,
  leftLabel: string,
  nightsShort: string,
  daysShort: string,
): string {
  const date = new Date(slot.startsAt)
  const dateStr = date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  const duration = slot.nights
    ? ` · ${nightsShort.replace("{count}", String(slot.nights))}`
    : slot.days
      ? ` · ${daysShort.replace("{count}", String(slot.days))}`
      : ""
  const capacity = slot.unlimited
    ? ""
    : slot.remainingPax != null
      ? ` · ${slot.remainingPax} ${leftLabel}`
      : ""
  return `${dateStr} ${time}${duration}${capacity}`
}

export function formatSailingDate(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}

/**
 * The Offer Preview reports why there is no price with
 * `bookingQuoteUnavailableReasonV1` — five reasons, not the open per-vertical
 * strings beta's `/quote` returned. Every member is translated, so a shopper
 * can never be shown a raw enum member; the fallback exists only for a reason
 * added to the contract before this switch catches up.
 */
function humanizeUnavailableReason(reason: string, t: DetailSharedMessages): string {
  switch (reason) {
    case "target_not_found":
      return t.unavailableTargetNotFound
    case "target_not_bookable":
      return t.unavailableTargetNotBookable
    case "price_unavailable":
      return t.unavailablePriceUnavailable
    case "policy_unavailable":
      return t.unavailablePolicyUnavailable
    case "selection_unavailable":
      return t.unavailableSelectionUnavailable
    default:
      return t.unavailableTargetNotBookable
  }
}
