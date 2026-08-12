"use client"

import { useOperatorAdminMessages as useAdminMessages } from "@voyant-travel/admin"
import { type CatalogSearchHit, useCatalogSearch } from "@voyant-travel/catalog-react"
import type { TripEnvelopeStatus } from "@voyant-travel/trips"
import { AsyncCombobox } from "@voyant-travel/ui/components/async-combobox"
import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import { Checkbox } from "@voyant-travel/ui/components/checkbox"
import { DateRangePicker } from "@voyant-travel/ui/components/date-picker"
import { Input } from "@voyant-travel/ui/components/input"
import { Label } from "@voyant-travel/ui/components/label"
import { Popover, PopoverContent, PopoverTrigger } from "@voyant-travel/ui/components/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components/select"
import { ListFilter } from "lucide-react"
import * as React from "react"

export const TRIP_STATUS_ALL = "__all__"
export type TripStatusFilter = TripEnvelopeStatus | typeof TRIP_STATUS_ALL

function catalogHitLabel(hit: CatalogSearchHit): string {
  return (
    catalogHitStringField(hit, "name") ??
    catalogHitStringField(hit, "title") ??
    catalogHitStringField(hit, "hotel.name") ??
    hit.id
  )
}

function catalogHitStringField(hit: CatalogSearchHit, field: string): string | null {
  const value = hit.document.fields[field]
  return typeof value === "string" && value.trim().length > 0 ? value : null
}

function CatalogFilterCombobox({
  label,
  value,
  onValueChange,
  items,
  selectedItem,
  onSelectedItemChange,
  onSearchChange,
  placeholder,
  emptyText,
  onFiltersChanged,
}: {
  label: string
  value: string | null
  onValueChange(value: string | null): void
  items: CatalogSearchHit[]
  selectedItem: CatalogSearchHit | null
  onSelectedItemChange(value: CatalogSearchHit | null): void
  onSearchChange(value: string): void
  placeholder: string
  emptyText: string
  onFiltersChanged(): void
}) {
  const id = `trips-filter-${label.toLowerCase()}`
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <AsyncCombobox<CatalogSearchHit>
        value={value}
        onChange={(nextValue) => {
          onValueChange(nextValue)
          const match = nextValue ? items.find((hit) => hit.id === nextValue) : null
          onSelectedItemChange(match ?? null)
          onFiltersChanged()
        }}
        items={items}
        selectedItem={selectedItem}
        getKey={(hit) => hit.id}
        getLabel={catalogHitLabel}
        getSecondary={(hit) => catalogHitStringField(hit, "source.kind") ?? undefined}
        onSearchChange={onSearchChange}
        placeholder={placeholder}
        emptyText={emptyText}
      />
    </div>
  )
}

export interface TripListFiltersPopoverProps {
  open: boolean
  onOpenChange(open: boolean): void
  activeFilterCount: number
  status: TripStatusFilter
  onStatusChange(value: TripStatusFilter): void
  productId: string | null
  onProductIdChange(value: string | null): void
  accommodationId: string | null
  onAccommodationIdChange(value: string | null): void
  cruiseId: string | null
  onCruiseIdChange(value: string | null): void
  hasFlight: boolean
  onHasFlightChange(value: boolean): void
  totalMin: string
  onTotalMinChange(value: string): void
  totalMax: string
  onTotalMaxChange(value: string): void
  createdRange: { from: string | null; to: string | null } | null
  onCreatedRangeChange(value: { from: string | null; to: string | null } | null): void
  onFiltersChanged(): void
}

export function TripListFiltersPopover({
  open,
  onOpenChange,
  activeFilterCount,
  status,
  onStatusChange,
  productId,
  onProductIdChange,
  accommodationId,
  onAccommodationIdChange,
  cruiseId,
  onCruiseIdChange,
  hasFlight,
  onHasFlightChange,
  totalMin,
  onTotalMinChange,
  totalMax,
  onTotalMaxChange,
  createdRange,
  onCreatedRangeChange,
  onFiltersChanged,
}: TripListFiltersPopoverProps) {
  const messages = useAdminMessages().trips
  const filterMessages = messages.filters
  const statusOptions: ReadonlyArray<{ value: TripStatusFilter; label: string }> = [
    { value: TRIP_STATUS_ALL, label: filterMessages.allStatuses },
    { value: "draft", label: messages.statuses.draft },
    { value: "priced", label: messages.statuses.priced },
    { value: "reserve_in_progress", label: messages.statuses.reserve_in_progress },
    { value: "reserved", label: messages.statuses.reserved },
    { value: "checkout_started", label: messages.statuses.checkout_started },
    { value: "booked", label: messages.statuses.booked },
    { value: "failed", label: messages.statuses.failed },
    { value: "cancelled", label: messages.statuses.cancelled },
  ]
  const [selectedProduct, setSelectedProduct] = React.useState<CatalogSearchHit | null>(null)
  const [productSearch, setProductSearch] = React.useState("")
  const [selectedStay, setSelectedStay] = React.useState<CatalogSearchHit | null>(null)
  const [staySearch, setStaySearch] = React.useState("")
  const [selectedCruise, setSelectedCruise] = React.useState<CatalogSearchHit | null>(null)
  const [cruiseSearch, setCruiseSearch] = React.useState("")

  const productsQuery = useCatalogSearch({
    vertical: "products",
    query: productSearch,
    mode: "keyword",
    pagination: { limit: 20 },
  })
  const productHits = productsQuery.data?.hits ?? []

  const staysQuery = useCatalogSearch({
    vertical: "accommodations",
    query: staySearch,
    mode: "keyword",
    pagination: { limit: 20 },
  })
  const stayHits = staysQuery.data?.hits ?? []

  const cruisesQuery = useCatalogSearch({
    vertical: "cruises",
    query: cruiseSearch,
    mode: "keyword",
    pagination: { limit: 20 },
  })
  const cruiseHits = cruisesQuery.data?.hits ?? []

  const markChanged = () => onFiltersChanged()

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="default">
            <ListFilter className="mr-2 size-4" />
            {filterMessages.trigger}
            {activeFilterCount > 0 ? (
              <Badge variant="secondary" className="ml-2 px-1.5">
                {activeFilterCount}
              </Badge>
            ) : null}
          </Button>
        }
      />
      <PopoverContent
        align="start"
        className="max-h-[75vh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto p-4"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trips-filter-status">{filterMessages.status}</Label>
            <Select
              value={status}
              onValueChange={(value) => {
                onStatusChange((value ?? TRIP_STATUS_ALL) as TripStatusFilter)
                markChanged()
              }}
            >
              <SelectTrigger id="trips-filter-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <CatalogFilterCombobox
            label={filterMessages.products}
            value={productId}
            onValueChange={onProductIdChange}
            items={productHits}
            selectedItem={selectedProduct}
            onSelectedItemChange={setSelectedProduct}
            onSearchChange={setProductSearch}
            placeholder={filterMessages.anyProduct}
            emptyText={filterMessages.noProducts}
            onFiltersChanged={markChanged}
          />

          <CatalogFilterCombobox
            label={filterMessages.stays}
            value={accommodationId}
            onValueChange={onAccommodationIdChange}
            items={stayHits}
            selectedItem={selectedStay}
            onSelectedItemChange={setSelectedStay}
            onSearchChange={setStaySearch}
            placeholder={filterMessages.anyStay}
            emptyText={filterMessages.noStays}
            onFiltersChanged={markChanged}
          />

          <CatalogFilterCombobox
            label={filterMessages.cruises}
            value={cruiseId}
            onValueChange={onCruiseIdChange}
            items={cruiseHits}
            selectedItem={selectedCruise}
            onSelectedItemChange={setSelectedCruise}
            onSearchChange={setCruiseSearch}
            placeholder={filterMessages.anyCruise}
            emptyText={filterMessages.noCruises}
            onFiltersChanged={markChanged}
          />

          <div className="flex items-center gap-2">
            <Checkbox
              id="trips-filter-flight"
              checked={hasFlight}
              onCheckedChange={(checked) => {
                onHasFlightChange(checked === true)
                markChanged()
              }}
            />
            <Label htmlFor="trips-filter-flight" className="font-normal">
              {filterMessages.hasFlight}
            </Label>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{filterMessages.total}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                inputMode="decimal"
                placeholder={filterMessages.min}
                value={totalMin}
                onChange={(event) => {
                  onTotalMinChange(event.target.value)
                  markChanged()
                }}
                className="w-full"
                aria-label={filterMessages.totalMinAria}
              />
              <span className="text-muted-foreground">-</span>
              <Input
                type="text"
                inputMode="decimal"
                placeholder={filterMessages.max}
                value={totalMax}
                onChange={(event) => {
                  onTotalMaxChange(event.target.value)
                  markChanged()
                }}
                className="w-full"
                aria-label={filterMessages.totalMaxAria}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{filterMessages.createdAt}</Label>
            <DateRangePicker
              value={createdRange}
              onChange={(value) => {
                onCreatedRangeChange(value)
                markChanged()
              }}
              placeholder={filterMessages.anyDate}
              clearable
              className="w-full"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
