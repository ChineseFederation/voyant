import type { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@voyant-travel/ui/components/badge"
import { Image as ImageIcon } from "lucide-react"

import type { useCatalogUiMessagesOrDefault } from "../i18n/index.js"
import type { CatalogSearchHit } from "../index.js"
import {
  formatHitPrice,
  numberField,
  type PriceUnit,
  resolveHitPriceUnit,
  stringField,
} from "./catalog-hit.js"
import {
  formatBoard,
  formatCountry,
  formatDepartureMonth,
  formatStars,
  formatTransport,
} from "./catalog-page-cards.js"
import type { CatalogFilterField } from "./catalog-search-page.js"

export type CatalogPageMessages = ReturnType<typeof useCatalogUiMessagesOrDefault>["catalogPage"]

export function makeProductColumns(
  formatSupplier: (id: string | number) => string,
  messages: CatalogPageMessages,
  locale: string,
): ColumnDef<CatalogSearchHit, unknown>[] {
  return [
    nameColumn(messages.fallbacks.productName, messages),
    statusColumn(messages),
    sourceColumn(messages),
    lookupColumn("supplierId", messages.columns.supplier, formatSupplier, messages),
    durationColumn(messages),
    priceColumn("sellAmountCents", "sellCurrency", messages.columns.price, messages, locale),
  ]
}

export function makeExtraColumns(
  formatSupplier: (id: string | number) => string,
  messages: CatalogPageMessages,
): ColumnDef<CatalogSearchHit, unknown>[] {
  return [
    nameColumn(messages.fallbacks.extraName, messages),
    activeColumn(messages),
    sourceColumn(messages),
    lookupColumn("supplierId", messages.columns.supplier, formatSupplier, messages),
    textColumn("selectionType", messages.columns.selection, messages),
    textColumn("pricingMode", messages.columns.pricing, messages),
    textColumn("defaultQuantity", messages.columns.defaultQuantity, messages),
  ]
}

export function makeCruiseColumns(
  formatSupplier: (id: string | number) => string,
  messages: CatalogPageMessages,
  locale: string,
): ColumnDef<CatalogSearchHit, unknown>[] {
  return [
    nameColumn(messages.fallbacks.cruiseName, messages),
    statusColumn(messages),
    sourceColumn(messages),
    textColumn("cruiseType", messages.columns.type, messages),
    lookupColumn("lineSupplierId", messages.columns.supplier, formatSupplier, messages),
    textColumn("nights", messages.columns.nights, messages),
    priceColumn(
      "lowestPriceCached",
      "lowestPriceCurrencyCached",
      messages.columns.price,
      messages,
      locale,
      "major",
      "lowestPriceUnit",
    ),
  ]
}

export function makeCharterColumns(
  formatSupplier: (id: string | number) => string,
  messages: CatalogPageMessages,
  locale: string,
): ColumnDef<CatalogSearchHit, unknown>[] {
  return [
    nameColumn(messages.fallbacks.charterName, messages, "heroImageUrl"),
    statusColumn(messages),
    sourceColumn(messages),
    lookupColumn("lineSupplierId", messages.columns.supplier, formatSupplier, messages),
    textColumn("defaultYachtId", messages.columns.yacht, messages),
    priceColumn(
      "lowestPriceCachedAmount",
      "lowestPriceCachedCurrency",
      messages.columns.from,
      messages,
      locale,
    ),
  ]
}

export function makeAccommodationColumns(
  formatSupplier: (id: string | number) => string,
  messages: CatalogPageMessages,
  _locale: string,
): ColumnDef<CatalogSearchHit, unknown>[] {
  return [
    nameColumn(messages.fallbacks.roomName, messages),
    activeColumn(messages),
    sourceColumn(messages),
    lookupColumn("supplierId", messages.columns.supplier, formatSupplier, messages),
    textColumn("roomClass", messages.columns.class, messages),
    textColumn("maxOccupancy", messages.columns.maxPax, messages),
    textColumn("bedroomCount", messages.columns.bedrooms, messages),
  ]
}

export function makeProductFilters(
  formatSupplier: (id: string | number) => string,
  messages: CatalogPageMessages,
  locale: string,
): CatalogFilterField[] {
  return [
    { field: "status", label: messages.filters.status },
    {
      field: "countryCodes",
      label: messages.filters.country,
      formatValue: (value) => formatCountry(value, locale),
    },
    { field: "destinations", label: messages.filters.destination },
    {
      field: "board",
      label: messages.filters.board,
      formatValue: (value) => formatBoard(String(value), messages) ?? String(value),
    },
    {
      field: "stars",
      label: messages.filters.stars,
      formatValue: (value) => formatStars(value) ?? String(value),
      // Show 5★ → 0, not by item count.
      sortValues: "value-desc",
    },
    {
      field: "transport",
      label: messages.filters.transport,
      formatValue: (value) => formatTransport(String(value), messages) ?? String(value),
    },
    {
      field: "source.kind",
      label: messages.filters.source,
      formatValue: (value) => formatSourceKind(value, messages),
    },
    { field: "supplierId", label: messages.filters.supplier, formatValue: formatSupplier },
    { field: "bookingMode", label: messages.filters.bookingMode },
    // Merchandising family + subtype facets, keyed on the stable codes. The
    // Tour view locks `familyCode`; the Boat Tour facet locks `subtypeCode`.
    { field: "familyCode", label: messages.filters.family },
    { field: "subtypeCode", label: messages.filters.subtype },
    { field: "capacityMode", label: messages.filters.capacity },
    { field: "facilityId", label: messages.filters.facility },
    {
      kind: "range",
      field: "sellAmountCents",
      label: messages.filters.price,
      format: "currency",
      currency: "EUR",
      step: 100,
      minPlaceholder: "0",
      maxPlaceholder: messages.filters.any,
    },
    {
      kind: "range",
      field: "pax",
      label: messages.filters.pax,
      minPlaceholder: "0",
      maxPlaceholder: messages.filters.any,
    },
  ]
}

export function makeExtraFilters(
  formatSupplier: (id: string | number) => string,
  messages: CatalogPageMessages,
): CatalogFilterField[] {
  return [
    { field: "active", label: messages.filters.active },
    {
      field: "source.kind",
      label: messages.filters.source,
      formatValue: (value) => formatSourceKind(value, messages),
    },
    { field: "supplierId", label: messages.filters.supplier, formatValue: formatSupplier },
    { field: "selectionType", label: messages.filters.selection },
    { field: "pricingMode", label: messages.filters.pricingMode },
    { field: "pricedPerPerson", label: messages.filters.perPerson },
    {
      kind: "range",
      field: "minQuantity",
      label: messages.filters.minQuantity,
      minPlaceholder: "0",
      maxPlaceholder: messages.filters.any,
    },
    {
      kind: "range",
      field: "maxQuantity",
      label: messages.filters.maxQuantity,
      minPlaceholder: "0",
      maxPlaceholder: messages.filters.any,
    },
  ]
}

export function makeCruiseFilters(
  formatSupplier: (id: string | number) => string,
  messages: CatalogPageMessages,
  locale: string,
): CatalogFilterField[] {
  return [
    { field: "status", label: messages.filters.status },
    {
      field: "source.kind",
      label: messages.filters.source,
      formatValue: (value) => formatSourceKind(value, messages),
    },
    { field: "cruiseType", label: messages.filters.type },
    {
      // Departure month/year facet — `YYYY-MM` values sorted chronologically,
      // shown as "Mar 2027".
      field: "departureMonths",
      label: messages.filters.departureMonth,
      formatValue: (value) => formatDepartureMonth(value, locale),
      sortValues: "value-asc",
    },
    { field: "lineSupplierId", label: messages.filters.supplier, formatValue: formatSupplier },
    { field: "defaultShipId", label: messages.filters.ship },
    { field: "embarkPortFacilityId", label: messages.filters.embark },
    { field: "disembarkPortFacilityId", label: messages.filters.disembark },
    { field: "regions", label: messages.filters.region },
    { field: "themes", label: messages.filters.theme },
    {
      kind: "range",
      field: "nights",
      label: messages.filters.nights,
      minPlaceholder: "0",
      maxPlaceholder: messages.filters.any,
    },
  ]
}

export function makeCharterFilters(
  formatSupplier: (id: string | number) => string,
  messages: CatalogPageMessages,
): CatalogFilterField[] {
  return [
    { field: "status", label: messages.filters.status },
    {
      field: "source.kind",
      label: messages.filters.source,
      formatValue: (value) => formatSourceKind(value, messages),
    },
    { field: "lineSupplierId", label: messages.filters.supplier, formatValue: formatSupplier },
    { field: "defaultYachtId", label: messages.filters.yacht },
    { field: "defaultBookingModes", label: messages.filters.bookingMode },
    { field: "regions", label: messages.filters.region },
    { field: "themes", label: messages.filters.theme },
    {
      kind: "range",
      field: "lowestPriceCachedAmount",
      label: messages.filters.price,
      format: "currency",
      currency: "EUR",
      step: 100,
      minPlaceholder: "0",
      maxPlaceholder: messages.filters.any,
    },
    {
      kind: "range",
      field: "defaultApaPercent",
      label: messages.filters.apaPercent,
      step: 1,
      minPlaceholder: "0",
      maxPlaceholder: "100",
    },
  ]
}

export function makeAccommodationFilters(
  formatSupplier: (id: string | number) => string,
  messages: CatalogPageMessages,
): CatalogFilterField[] {
  return [
    { field: "active", label: messages.filters.active },
    {
      field: "source.kind",
      label: messages.filters.source,
      formatValue: (value) => formatSourceKind(value, messages),
    },
    { field: "supplierId", label: messages.filters.supplier, formatValue: formatSupplier },
    { field: "inventoryMode", label: messages.filters.inventory },
    { field: "roomClass", label: messages.filters.class },
    { field: "smokingAllowed", label: messages.filters.smoking },
    { field: "propertyId", label: messages.filters.property },
    {
      kind: "range",
      field: "maxOccupancy",
      label: messages.filters.maxPax,
      minPlaceholder: "0",
      maxPlaceholder: messages.filters.any,
    },
    {
      kind: "range",
      field: "bedroomCount",
      label: messages.filters.bedrooms,
      minPlaceholder: "0",
      maxPlaceholder: messages.filters.any,
    },
    {
      kind: "range",
      field: "bathroomCount",
      label: messages.filters.bathrooms,
      minPlaceholder: "0",
      maxPlaceholder: messages.filters.any,
    },
  ]
}

function nameColumn(
  fallback: string,
  messages: CatalogPageMessages,
  urlField = "thumbnailUrl",
): ColumnDef<CatalogSearchHit, unknown> {
  return {
    id: "name",
    header: messages.columns.name,
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <CatalogThumbnail hit={row.original} urlField={urlField} />
        <span className="font-medium">{stringField(row.original, "name", fallback)}</span>
      </div>
    ),
  }
}

function statusColumn(messages: CatalogPageMessages): ColumnDef<CatalogSearchHit, unknown> {
  return {
    id: "status",
    header: messages.columns.status,
    cell: ({ row }) => {
      const status = stringField(row.original, "status", null)
      if (!status) return null
      return (
        <Badge variant={status === "active" ? "default" : "secondary"} className="capitalize">
          {status}
        </Badge>
      )
    },
  }
}

function activeColumn(messages: CatalogPageMessages): ColumnDef<CatalogSearchHit, unknown> {
  return {
    id: "active",
    header: messages.columns.active,
    cell: ({ row }) => {
      const v = stringField(row.original, "active", null)
      if (v == null) return null
      const isActive = v === "true" || v === "1"
      return (
        <Badge variant={isActive ? "default" : "secondary"}>
          {isActive ? messages.values.active : messages.values.inactive}
        </Badge>
      )
    },
  }
}

function textColumn(
  field: string,
  header: string,
  messages: CatalogPageMessages,
): ColumnDef<CatalogSearchHit, unknown> {
  return {
    id: field,
    header,
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {stringField(row.original, field, messages.values.empty)}
      </span>
    ),
  }
}

function durationColumn(messages: CatalogPageMessages): ColumnDef<CatalogSearchHit, unknown> {
  return {
    id: "duration",
    header: messages.columns.duration,
    cell: ({ row }) => {
      const minutes = numberField(row.original, "durationMinutes")
      if (minutes != null) {
        return (
          <span className="tabular-nums">
            {messages.card.minutes.replace("{minutes}", String(minutes))}
          </span>
        )
      }
      const days = numberField(row.original, "durationDays")
      if (days == null)
        return <span className="text-muted-foreground">{messages.values.empty}</span>
      return (
        <span className="tabular-nums">
          {messages.card.daysNights
            .replace("{days}", String(days))
            .replace("{nights}", String(Math.max(0, days - 1)))}
        </span>
      )
    },
  }
}

function sourceColumn(messages: CatalogPageMessages): ColumnDef<CatalogSearchHit, unknown> {
  return {
    id: "source.kind",
    header: messages.columns.source,
    cell: ({ row }) => {
      const kind = stringField(row.original, "source.kind", null)
      if (!kind) return <span className="text-muted-foreground">{messages.values.empty}</span>
      return (
        <Badge variant={kind === "owned" ? "secondary" : "outline"}>
          {formatSourceKind(kind, messages)}
        </Badge>
      )
    },
  }
}

export function formatSourceKind(value: unknown, messages: CatalogPageMessages): string {
  const raw = String(value)
  const known: Record<string, string> = {
    owned: messages.sourceKinds.owned,
    "voyant-connect": messages.sourceKinds.voyantConnect,
    manual: messages.sourceKinds.manual,
    "gds:amadeus": messages.sourceKinds.gdsAmadeus,
    "gds:sabre": messages.sourceKinds.gdsSabre,
    "gds:travelport": messages.sourceKinds.gdsTravelport,
    "bedbank:hotelbeds": messages.sourceKinds.bedbankHotelbeds,
    "bedbank:expedia": messages.sourceKinds.bedbankExpedia,
  }
  if (known[raw]) return known[raw]
  if (raw.startsWith("direct:")) {
    return `${raw.slice("direct:".length).toUpperCase()} ${messages.sourceKinds.directSuffix}`
  }
  return raw
    .split(/[:\-_]/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ")
}

function lookupColumn(
  field: string,
  header: string,
  format: (id: string | number) => string,
  messages: CatalogPageMessages,
): ColumnDef<CatalogSearchHit, unknown> {
  return {
    id: field,
    header,
    cell: ({ row }) => {
      const id = stringField(row.original, field, null)
      if (!id) return <span className="text-muted-foreground">{messages.values.empty}</span>
      return <span>{format(id)}</span>
    },
  }
}

function priceColumn(
  amountField: string,
  currencyField: string,
  header: string,
  messages: CatalogPageMessages,
  locale: string,
  unit: PriceUnit = "minor",
  unitField?: string,
): ColumnDef<CatalogSearchHit, unknown> {
  return {
    id: amountField,
    header,
    cell: ({ row }) => {
      const resolvedUnit = resolveHitPriceUnit(row.original, unit, unitField)
      const formatted = formatHitPrice(
        row.original,
        amountField,
        currencyField,
        locale,
        resolvedUnit,
      )
      return (
        <span className="font-medium">
          {formatted ?? <span className="text-muted-foreground">{messages.values.empty}</span>}
        </span>
      )
    },
  }
}

function CatalogThumbnail({ hit, urlField }: { hit: CatalogSearchHit; urlField: string }) {
  const url = stringField(hit, urlField, null)
  const name = stringField(hit, "name", "")

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="h-9 w-9 shrink-0 rounded-md object-cover"
        loading="lazy"
      />
    )
  }

  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
      aria-hidden="true"
    >
      <ImageIcon className="h-4 w-4" />
    </div>
  )
}
