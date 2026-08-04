"use client"

import { useQuery } from "@tanstack/react-query"
import { useOperatorAdminMessages as useAdminMessages } from "@voyant-travel/admin"
import { type Draft, emptyDraft } from "@voyant-travel/bookings-react/journey"
import { type CatalogSearchHit, useCatalogSearch } from "@voyant-travel/catalog-react"
import { useOfferPreview } from "@voyant-travel/catalog-react/booking-engine"
import { AsyncCombobox } from "@voyant-travel/ui/components/async-combobox"
import { DateTimeField } from "@voyant-travel/ui/components/date-time-field"
import * as React from "react"

import { useVoyantTripsContext } from "../../provider.js"
import { CatalogComponentOptions } from "./catalog-options.js"
import { formatDepartureLabel } from "./display.js"
import {
  type AvailabilitySlot,
  type CatalogVertical,
  catalogHitLabel,
  catalogHitSourceConnectionId,
  catalogHitSourceKind,
  catalogHitSourceRef,
  catalogHitStringField,
  catalogHitThumbnailUrl,
  Field,
  type PendingComponent,
  verticalForKind,
} from "./shared.js"

export function CatalogConfigurator({
  pending,
  onChange,
  paxAdult,
}: {
  pending: Extract<PendingComponent, { kind: "product" | "stay" }>
  onChange(next: PendingComponent): void
  paxAdult: number
}) {
  const t = useAdminMessages().trips.adminComposer.panels
  const vertical = verticalForKind(pending.kind)
  const [catalogSearch, setCatalogSearch] = React.useState("")
  const [selectedCatalogHit, setSelectedCatalogHit] = React.useState<CatalogSearchHit | null>(null)

  const catalogQuery = useCatalogSearch({
    vertical,
    query: catalogSearch,
    mode: "keyword",
    pagination: { limit: 20 },
    enabled: true,
  })
  const catalogHits = React.useMemo(() => {
    return catalogQuery.data?.hits ?? []
  }, [catalogQuery.data?.hits])
  const selectedCatalog =
    catalogHits.find((hit) => hit.id === pending.catalogEntityId) ?? selectedCatalogHit
  const departureQuery = useProductDepartures(
    pending.kind === "product" ? pending.catalogEntityId : null,
  )
  const selectedDeparture = React.useMemo(
    () =>
      departureQuery.data?.rows.find(
        (slot) => slot.id === pending.bookingDraft?.configure.departureSlotId,
      ) ?? null,
    [departureQuery.data?.rows, pending.bookingDraft?.configure.departureSlotId],
  )
  const quoteDraft =
    pending.bookingDraft && (pending.bookingDraft.configure.pax?.adult ?? 0) !== paxAdult
      ? updateDraftPax(pending.bookingDraft, paxAdult)
      : pending.bookingDraft
  // Non-binding price + requirements probe. The beta `POST /catalog/quote`
  // this configurator used is gone; Offer Preview is its stateless successor,
  // so browsing catalog components still does not open a Booking Session.
  const previewTarget = React.useMemo(
    () => offerPreviewTargetFor(vertical, pending.catalogEntityId, pending.catalogSourceKind),
    [vertical, pending.catalogEntityId, pending.catalogSourceKind],
  )
  const quote = useOfferPreview({
    surface: "admin",
    target: previewTarget,
    selection: quoteDraft,
    scope: { locale: "en-GB", market: "default" },
    enabled: Boolean(pending.bookingDraft && previewTarget),
  })
  const shape = quote.data?.requirements ?? null

  React.useEffect(() => {
    if (!pending.bookingDraft) return
    const currentAdult = pending.bookingDraft.configure.pax?.adult ?? 0
    if (currentAdult === paxAdult) return
    onChange({ ...pending, bookingDraft: updateDraftPax(pending.bookingDraft, paxAdult) })
  }, [onChange, paxAdult, pending])

  const fieldLabel =
    pending.kind === "stay" ? t.catalogSearch.hotelLabel : t.catalogSearch.productLabel
  const placeholder =
    pending.kind === "stay"
      ? t.catalogSearch.hotelSearchPlaceholder
      : t.catalogSearch.productSearchPlaceholder
  const emptyText =
    pending.kind === "stay" ? t.catalogSearch.hotelEmpty : t.catalogSearch.productEmpty

  return (
    <div className="flex flex-col gap-4">
      <Field label={fieldLabel}>
        <AsyncCombobox<CatalogSearchHit>
          value={pending.catalogEntityId}
          onChange={(value) => {
            const hit = value ? catalogHits.find((item) => item.id === value) : null
            setSelectedCatalogHit(hit ?? null)
            const nextEntityId = value
            const nextSourceKind = hit ? catalogHitSourceKind(hit) : null
            const nextSourceConnectionId = hit ? catalogHitSourceConnectionId(hit) : null
            const nextSourceRef = hit ? catalogHitSourceRef(hit) : null
            onChange({
              ...pending,
              catalogEntityId: nextEntityId,
              catalogEntityName: hit ? catalogHitLabel(hit) : null,
              catalogSourceKind: nextSourceKind,
              catalogSourceConnectionId: nextSourceConnectionId,
              catalogSourceRef: nextSourceRef,
              catalogThumbnailUrl: hit ? catalogHitThumbnailUrl(hit) : null,
              bookingDraft:
                nextEntityId && nextSourceKind
                  ? createCatalogBookingDraft({
                      vertical,
                      entityId: nextEntityId,
                      sourceKind: nextSourceKind,
                      sourceConnectionId: nextSourceConnectionId,
                      sourceRef: nextSourceRef,
                      paxAdult,
                      startsAt: pending.startsAt,
                      endsAt: pending.endsAt,
                    })
                  : null,
            })
          }}
          items={catalogHits}
          selectedItem={selectedCatalog}
          getKey={(hit) => hit.id}
          getLabel={catalogHitLabel}
          getSecondary={(hit) => catalogHitStringField(hit, "source.kind") ?? undefined}
          onSearchChange={setCatalogSearch}
          placeholder={placeholder}
          emptyText={emptyText}
          triggerClassName="w-full"
          clearable
        />
      </Field>

      {pending.kind === "product" ? (
        <ProductDeparturePicker
          slots={departureQuery.data?.rows ?? []}
          isLoading={departureQuery.isLoading}
          isError={departureQuery.isError}
          value={selectedDeparture?.id ?? ""}
          disabled={!pending.catalogEntityId}
          onChange={(slotId) => {
            const slot = departureQuery.data?.rows.find((candidate) => candidate.id === slotId)
            if (!slot) return
            onChange({
              ...pending,
              startsAt: slot.startsAt,
              endsAt: slot.endsAt ?? "",
              bookingDraft: pending.bookingDraft
                ? updateDraftDeparture(pending.bookingDraft, slot)
                : null,
            })
          }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.fromLabel}>
            <DateTimeField
              value={pending.startsAt}
              onChange={(value) => {
                const startsAt = value ?? ""
                onChange({
                  ...pending,
                  startsAt,
                  bookingDraft: pending.bookingDraft
                    ? updateDraftSchedule(pending.bookingDraft, startsAt, pending.endsAt)
                    : null,
                })
              }}
            />
          </Field>
          <Field label={t.toLabel}>
            <DateTimeField
              value={pending.endsAt}
              onChange={(value) => {
                const endsAt = value ?? ""
                onChange({
                  ...pending,
                  endsAt,
                  bookingDraft: pending.bookingDraft
                    ? updateDraftSchedule(pending.bookingDraft, pending.startsAt, endsAt)
                    : null,
                })
              }}
            />
          </Field>
        </div>
      )}

      {shape ? (
        <CatalogComponentOptions
          draft={pending.bookingDraft}
          shape={shape}
          onDraftChange={(bookingDraft) => onChange({ ...pending, bookingDraft })}
        />
      ) : pending.bookingDraft && quote.isSettling ? (
        <p className="text-muted-foreground text-sm">{t.loadingOptions}</p>
      ) : null}
    </div>
  )
}

/**
 * Name the component for Offer Preview.
 *
 * `createBookingSessionTargetV1` admits `product` and `catalog_item` only —
 * there is no `owned_entity` member on the create-side union — so an owned
 * stay cannot be named at all and returns `null` rather than being mislabelled
 * as a sourced catalog item, which would price the wrong thing.
 */
function offerPreviewTargetFor(
  vertical: CatalogVertical,
  entityId: string | null,
  sourceKind: string | null,
): { kind: "product"; productId: string } | { kind: "catalog_item"; catalogItemId: string } | null {
  if (!entityId) return null
  if (sourceKind && sourceKind !== "owned") return { kind: "catalog_item", catalogItemId: entityId }
  return vertical === "products" ? { kind: "product", productId: entityId } : null
}

function createCatalogBookingDraft({
  vertical,
  entityId,
  sourceKind,
  sourceConnectionId,
  sourceRef,
  paxAdult,
  startsAt,
  endsAt,
}: {
  vertical: CatalogVertical
  entityId: string
  sourceKind: string
  sourceConnectionId: string | null
  sourceRef: string | null
  paxAdult: number
  startsAt: string
  endsAt: string
}): Draft {
  const draft = emptyDraft(
    {
      module: vertical,
      id: entityId,
      sourceKind,
      ...(sourceConnectionId ? { sourceConnectionId } : {}),
      ...(sourceRef ? { sourceRef } : {}),
    },
    { buyerType: "B2C" },
  )
  return updateDraftSchedule(
    {
      ...draft,
      configure: { ...draft.configure, pax: { adult: paxAdult } },
    },
    startsAt,
    endsAt,
  )
}

function useProductDepartures(productId: string | null) {
  const { baseUrl, fetcher } = useVoyantTripsContext()
  return useQuery({
    queryKey: ["admin-trips-product-departures", productId],
    queryFn: async (): Promise<{ rows: AvailabilitySlot[] }> => {
      if (!productId) return { rows: [] }
      const res = await fetcher(
        `${baseUrl}/v1/admin/catalog/slots?entityModule=products&entityId=${encodeURIComponent(productId)}`,
      )
      if (!res.ok) throw new Error(`Departures request failed: ${res.status}`)
      return res.json()
    },
    enabled: Boolean(productId),
    staleTime: 30_000,
  })
}

function ProductDeparturePicker({
  slots,
  isLoading,
  isError,
  value,
  disabled,
  onChange,
}: {
  slots: ReadonlyArray<AvailabilitySlot>
  isLoading: boolean
  isError: boolean
  value: string
  disabled: boolean
  onChange(slotId: string): void
}) {
  const t = useAdminMessages().trips.adminComposer.panels
  const [search, setSearch] = React.useState("")
  const filteredSlots = React.useMemo(() => {
    const trimmed = search.trim().toLowerCase()
    if (!trimmed) return slots
    return slots.filter((slot) => formatDepartureLabel(slot).toLowerCase().includes(trimmed))
  }, [search, slots])
  const selectedSlot = slots.find((slot) => slot.id === value) ?? null

  return (
    <Field label={t.departureLabel}>
      {isLoading ? (
        <div className="h-10 rounded-md border bg-muted/40" />
      ) : isError ? (
        <p className="text-destructive text-sm">{t.departuresUnavailable}</p>
      ) : slots.length === 0 && !disabled ? (
        <p className="text-muted-foreground text-sm">{t.noUpcomingDepartures}</p>
      ) : (
        <AsyncCombobox<AvailabilitySlot>
          value={value || null}
          onChange={(slotId) => {
            if (slotId) onChange(slotId)
          }}
          items={filteredSlots}
          selectedItem={selectedSlot}
          getKey={(slot) => slot.id}
          getLabel={formatDepartureLabel}
          getSecondary={(slot) => slot.timezone}
          onSearchChange={setSearch}
          placeholder={t.searchDeparturesPlaceholder}
          emptyText={t.noDeparturesFound}
          triggerClassName="w-full"
          disabled={disabled || slots.length === 0}
          clearable={false}
        />
      )}
    </Field>
  )
}

function updateDraftSchedule(draft: Draft, startsAt: string, endsAt: string): Draft {
  const departureDate = startsAt ? startsAt.slice(0, 10) : undefined
  const departureTime = startsAt?.includes("T") ? startsAt.slice(11, 16) : undefined
  const dateRange =
    startsAt && endsAt
      ? {
          checkIn: startsAt.slice(0, 10),
          checkOut: endsAt.slice(0, 10),
        }
      : undefined
  return {
    ...draft,
    configure: {
      ...draft.configure,
      departureDate,
      departureTime,
      dateRange,
    },
  }
}

function updateDraftDeparture(draft: Draft, slot: AvailabilitySlot): Draft {
  const scheduledDraft = updateDraftSchedule(draft, slot.startsAt, slot.endsAt ?? "")
  return {
    ...scheduledDraft,
    configure: {
      ...scheduledDraft.configure,
      departureSlotId: slot.id,
    },
  }
}

function updateDraftPax(draft: Draft, paxAdult: number): Draft {
  return {
    ...draft,
    configure: {
      ...draft.configure,
      pax: {
        ...draft.configure.pax,
        adult: paxAdult,
      },
    },
  }
}
