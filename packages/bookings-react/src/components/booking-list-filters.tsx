"use client"

import type { Supplier } from "@voyant-travel/distribution-react/suppliers"
import { useSuppliers } from "@voyant-travel/distribution-react/suppliers"
import type {
  ProductCategoryRecord,
  ProductOptionRecord,
  ProductRecord,
} from "@voyant-travel/inventory-react"
import {
  useProductCategories,
  useProductOptions,
  useProducts,
} from "@voyant-travel/inventory-react"
import type { AvailabilitySlotRecord } from "@voyant-travel/operations-react/availability"
import { useSlots } from "@voyant-travel/operations-react/availability"
import type { OrganizationRecord, PersonRecord } from "@voyant-travel/relationships-react"
import { useOrganizations, usePeople } from "@voyant-travel/relationships-react"
import { AsyncCombobox } from "@voyant-travel/ui/components/async-combobox"
import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
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
import { ListFilter, X } from "lucide-react"
import * as React from "react"
import { BOOKING_STATUS_ALL } from "../booking-list-constants.js"
import { useBookingsUiI18nOrDefault } from "../i18n/provider.js"
import { type BookingStatus, bookingStatuses } from "../index.js"

export { BOOKING_STATUS_ALL }

export interface BookingListFiltersPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  activeFilterCount: number
  status: string
  onStatusChange: (status: string) => void
  productId: string | null
  onProductIdChange: (productId: string | null) => void
  optionId: string | null
  onOptionIdChange: (optionId: string | null) => void
  /**
   * Filter to bookings on a specific departure (availability slot).
   * Picker is only populated when a product is selected.
   */
  availabilitySlotId: string | null
  onAvailabilitySlotIdChange: (availabilitySlotId: string | null) => void
  supplierId: string | null
  onSupplierIdChange: (supplierId: string | null) => void
  productCategoryId: string | null
  onProductCategoryIdChange: (productCategoryId: string | null) => void
  personId: string | null
  onPersonIdChange: (personId: string | null) => void
  organizationId: string | null
  onOrganizationIdChange: (organizationId: string | null) => void
  dateRange: { from: string | null; to: string | null } | null
  onDateRangeChange: (dateRange: { from: string | null; to: string | null } | null) => void
  paxMin: string
  onPaxMinChange: (paxMin: string) => void
  paxMax: string
  onPaxMaxChange: (paxMax: string) => void
  onFiltersChanged: () => void
  hasActiveFilters: boolean
  onClearFilters: () => void
}

export function BookingListFiltersPopover({
  open,
  onOpenChange,
  activeFilterCount,
  status,
  onStatusChange,
  productId,
  onProductIdChange,
  optionId,
  onOptionIdChange,
  availabilitySlotId,
  onAvailabilitySlotIdChange,
  supplierId,
  onSupplierIdChange,
  productCategoryId,
  onProductCategoryIdChange,
  personId,
  onPersonIdChange,
  organizationId,
  onOrganizationIdChange,
  dateRange,
  onDateRangeChange,
  paxMin,
  onPaxMinChange,
  paxMax,
  onPaxMaxChange,
  onFiltersChanged,
  hasActiveFilters,
  onClearFilters,
}: BookingListFiltersPopoverProps) {
  const { locale, messages } = useBookingsUiI18nOrDefault()
  const filterMessages = messages.bookingList.filters
  const statusLabels = messages.common.bookingStatusLabels

  const [selectedProduct, setSelectedProduct] = React.useState<ProductRecord | null>(null)
  const [productSearch, setProductSearch] = React.useState("")
  const [selectedOption, setSelectedOption] = React.useState<ProductOptionRecord | null>(null)
  const [selectedSlot, setSelectedSlot] = React.useState<AvailabilitySlotRecord | null>(null)
  const [selectedSupplier, setSelectedSupplier] = React.useState<Supplier | null>(null)
  const [supplierSearch, setSupplierSearch] = React.useState("")
  const [selectedProductCategory, setSelectedProductCategory] =
    React.useState<ProductCategoryRecord | null>(null)
  const [productCategorySearch, setProductCategorySearch] = React.useState("")
  const [selectedPerson, setSelectedPerson] = React.useState<PersonRecord | null>(null)
  const [personSearch, setPersonSearch] = React.useState("")
  const [selectedOrganization, setSelectedOrganization] = React.useState<OrganizationRecord | null>(
    null,
  )
  const [organizationSearch, setOrganizationSearch] = React.useState("")

  const { data: productsData } = useProducts({
    search: productSearch || undefined,
    limit: 20,
  })
  const products = productsData?.data ?? []
  const { data: optionsData } = useProductOptions({
    productId: productId ?? undefined,
    status: "active",
    limit: 20,
    enabled: productId !== null,
  })
  const productOptions = optionsData?.data ?? []
  // Departure picker is product-scoped. The list endpoint orders
  // results most-recent-first; capping at 50 keeps the dropdown
  // workable while still surfacing the active season's slots.
  const { data: slotsData } = useSlots({
    productId: productId ?? undefined,
    limit: 50,
    enabled: productId !== null,
  })
  const slots = slotsData?.data ?? []
  const { data: suppliersData } = useSuppliers({
    search: supplierSearch || undefined,
    limit: 20,
  })
  const suppliers = suppliersData?.data ?? []
  const { data: productCategoriesData } = useProductCategories({
    search: productCategorySearch || undefined,
    active: true,
    limit: 20,
  })
  const productCategories = productCategoriesData?.data ?? []
  const { data: peopleData } = usePeople({
    search: personSearch || undefined,
    limit: 20,
  })
  const people = peopleData?.data ?? []
  const { data: organizationsData } = useOrganizations({
    search: organizationSearch || undefined,
    limit: 20,
  })
  const organizations = organizationsData?.data ?? []

  const markChanged = () => onFiltersChanged()

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="default">
            <ListFilter className="mr-2 size-4" />
            {filterMessages.button}
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-2 px-1.5">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        }
      />
      <PopoverContent
        align="start"
        className="max-h-[75vh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto p-4"
      >
        <div className="flex flex-col gap-4">
          {hasActiveFilters && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onClearFilters()
                }}
              >
                <X className="mr-1 size-4" />
                {filterMessages.clear}
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bookings-filter-status">{filterMessages.statusLabel}</Label>
            <Select
              value={status}
              onValueChange={(value) => {
                onStatusChange(value ?? BOOKING_STATUS_ALL)
                markChanged()
              }}
            >
              <SelectTrigger id="bookings-filter-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={BOOKING_STATUS_ALL}>{filterMessages.statusAll}</SelectItem>
                {bookingStatuses.map((value: BookingStatus) => (
                  <SelectItem key={value} value={value}>
                    {statusLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bookings-filter-product">{filterMessages.productLabel}</Label>
            <AsyncCombobox<ProductRecord>
              value={productId}
              onChange={(value) => {
                onProductIdChange(value)
                onOptionIdChange(null)
                setSelectedOption(null)
                if (!value) {
                  setSelectedProduct(null)
                } else {
                  const match = products.find((product) => product.id === value)
                  if (match) setSelectedProduct(match)
                }
                markChanged()
              }}
              items={products}
              selectedItem={selectedProduct}
              getKey={(product) => product.id}
              getLabel={(product) => product.name}
              onSearchChange={setProductSearch}
              placeholder={filterMessages.product}
              emptyText={filterMessages.productEmpty}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bookings-filter-option">{filterMessages.optionLabel}</Label>
            <AsyncCombobox<ProductOptionRecord>
              value={optionId}
              onChange={(value) => {
                onOptionIdChange(value)
                if (!value) setSelectedOption(null)
                else {
                  const match = productOptions.find((option) => option.id === value)
                  if (match) setSelectedOption(match)
                }
                markChanged()
              }}
              items={productOptions}
              selectedItem={selectedOption}
              getKey={(option) => option.id}
              getLabel={(option) => option.name}
              getSecondary={(option) => option.code ?? undefined}
              placeholder={filterMessages.option}
              emptyText={productId ? filterMessages.optionEmpty : filterMessages.optionNeedsProduct}
              disabled={productId === null}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bookings-filter-departure">{filterMessages.departureLabel}</Label>
            <AsyncCombobox<AvailabilitySlotRecord>
              value={availabilitySlotId}
              onChange={(value) => {
                onAvailabilitySlotIdChange(value)
                if (!value) setSelectedSlot(null)
                else {
                  const match = slots.find((slot) => slot.id === value)
                  if (match) setSelectedSlot(match)
                }
                markChanged()
              }}
              items={slots}
              selectedItem={selectedSlot}
              getKey={(slot) => slot.id}
              getLabel={(slot) => formatSlotLabel(slot, locale)}
              getSecondary={(slot) => slot.status}
              placeholder={filterMessages.departure}
              emptyText={
                productId ? filterMessages.departureEmpty : filterMessages.departureNeedsProduct
              }
              disabled={productId === null}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bookings-filter-category">{filterMessages.categoryLabel}</Label>
            <AsyncCombobox<ProductCategoryRecord>
              value={productCategoryId}
              onChange={(value) => {
                onProductCategoryIdChange(value)
                if (!value) setSelectedProductCategory(null)
                else {
                  const match = productCategories.find((category) => category.id === value)
                  if (match) setSelectedProductCategory(match)
                }
                markChanged()
              }}
              items={productCategories}
              selectedItem={selectedProductCategory}
              getKey={(category) => category.id}
              getLabel={(category) => category.name}
              onSearchChange={setProductCategorySearch}
              placeholder={filterMessages.category}
              emptyText={filterMessages.categoryEmpty}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bookings-filter-supplier">{filterMessages.supplierLabel}</Label>
            <AsyncCombobox<Supplier>
              value={supplierId}
              onChange={(value) => {
                onSupplierIdChange(value)
                if (!value) setSelectedSupplier(null)
                else {
                  const match = suppliers.find((supplier) => supplier.id === value)
                  if (match) setSelectedSupplier(match)
                }
                markChanged()
              }}
              items={suppliers}
              selectedItem={selectedSupplier}
              getKey={(supplier) => supplier.id}
              getLabel={(supplier) => supplier.name}
              getSecondary={(supplier) => supplier.type}
              onSearchChange={setSupplierSearch}
              placeholder={filterMessages.supplier}
              emptyText={filterMessages.supplierEmpty}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bookings-filter-person">{filterMessages.personLabel}</Label>
            <AsyncCombobox<PersonRecord>
              value={personId}
              onChange={(value) => {
                onPersonIdChange(value)
                if (!value) setSelectedPerson(null)
                else {
                  const match = people.find((person) => person.id === value)
                  if (match) setSelectedPerson(match)
                }
                markChanged()
              }}
              items={people}
              selectedItem={selectedPerson}
              getKey={(person) => person.id}
              getLabel={formatPersonName}
              getSecondary={(person) => person.email ?? undefined}
              onSearchChange={setPersonSearch}
              placeholder={filterMessages.person}
              emptyText={filterMessages.personEmpty}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bookings-filter-organization">{filterMessages.organizationLabel}</Label>
            <AsyncCombobox<OrganizationRecord>
              value={organizationId}
              onChange={(value) => {
                onOrganizationIdChange(value)
                if (!value) setSelectedOrganization(null)
                else {
                  const match = organizations.find((organization) => organization.id === value)
                  if (match) setSelectedOrganization(match)
                }
                markChanged()
              }}
              items={organizations}
              selectedItem={selectedOrganization}
              getKey={(organization) => organization.id}
              getLabel={(organization) => organization.name}
              getSecondary={(organization) => organization.taxId ?? undefined}
              onSearchChange={setOrganizationSearch}
              placeholder={filterMessages.organization}
              emptyText={filterMessages.organizationEmpty}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bookings-filter-date">{filterMessages.dateRangeLabel}</Label>
            <DateRangePicker
              value={dateRange}
              onChange={(value) => {
                onDateRangeChange(value)
                markChanged()
              }}
              placeholder={filterMessages.dateRange}
              clearable
              className="w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{filterMessages.paxLabel}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                placeholder={filterMessages.paxMin}
                value={paxMin}
                onChange={(event) => {
                  onPaxMinChange(event.target.value)
                  markChanged()
                }}
                className="w-full"
                aria-label={filterMessages.paxMin}
              />
              <span className="text-muted-foreground">-</span>
              <Input
                type="number"
                min={0}
                placeholder={filterMessages.paxMax}
                value={paxMax}
                onChange={(event) => {
                  onPaxMaxChange(event.target.value)
                  markChanged()
                }}
                className="w-full"
                aria-label={filterMessages.paxMax}
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function formatPersonName(person: PersonRecord) {
  const name = [person.firstName, person.lastName].filter(Boolean).join(" ").trim()
  return name || person.email || person.id
}

/**
 * Human-friendly departure label. Renders the local date + start time
 * in the slot's own timezone so the operator sees what the customer
 * sees, not whatever the admin's browser locale converts it to.
 */
function formatSlotLabel(slot: AvailabilitySlotRecord, locale: string): string {
  try {
    const formatter = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: slot.timezone,
    })
    return formatter.format(new Date(slot.startsAt))
  } catch {
    return slot.startsAt
  }
}
