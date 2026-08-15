export type BookingsListSortField =
  | "bookingNumber"
  | "status"
  | "sellAmount"
  | "pax"
  | "startDate"
  | "endDate"
  | "createdAt"

export type BookingsListSortDir = "asc" | "desc"

export interface BookingsListFilters {
  status?: string | undefined
  /**
   * Statuses to omit from the result. The bookings index uses this to
   * hide noise (e.g. drafts + expired) from the default "All" view.
   */
  excludeStatuses?: string[] | undefined
  search?: string | undefined
  productId?: string | undefined
  optionId?: string | undefined
  /**
   * Restrict to bookings whose items reference this availability slot
   * (i.e. departure). Typically paired with `productId`.
   */
  availabilitySlotId?: string | undefined
  supplierId?: string | undefined
  productCategoryId?: string | undefined
  personId?: string | undefined
  organizationId?: string | undefined
  dateFrom?: string | undefined
  dateTo?: string | undefined
  paxMin?: number | undefined
  paxMax?: number | undefined
  sortBy?: BookingsListSortField | undefined
  sortDir?: BookingsListSortDir | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface BookingGroupsListFilters {
  kind?: string | undefined
  productId?: string | undefined
  optionUnitId?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface PricingPreviewFilters {
  productId: string
  optionId?: string | null | undefined
  catalogId?: string | null | undefined
}

export interface TaxPreviewFilters {
  productId: string
  subtotalCents: number
  currency: string
}

export const bookingsQueryKeys = {
  all: ["voyant", "bookings"] as const,

  bookings: () => [...bookingsQueryKeys.all, "bookings"] as const,
  bookingsList: (filters: BookingsListFilters) =>
    [...bookingsQueryKeys.bookings(), "list", filters] as const,
  booking: (id: string) => [...bookingsQueryKeys.bookings(), "detail", id] as const,
  items: (bookingId: string) => [...bookingsQueryKeys.booking(bookingId), "items"] as const,
  itemTravelers: (bookingId: string, itemId: string) =>
    [...bookingsQueryKeys.items(bookingId), itemId, "travelers"] as const,
  travelers: (bookingId: string) => [...bookingsQueryKeys.booking(bookingId), "travelers"] as const,
  sharingGroupsForSlot: (slotId: string) =>
    [...bookingsQueryKeys.all, "sharing-groups", "slot", slotId] as const,
  travelersBySharingGroup: (slotId: string, groupId: string) =>
    [...bookingsQueryKeys.sharingGroupsForSlot(slotId), groupId, "travelers"] as const,
  documents: (bookingId: string) => [...bookingsQueryKeys.booking(bookingId), "documents"] as const,
  supplierStatuses: (bookingId: string) =>
    [...bookingsQueryKeys.booking(bookingId), "supplier-statuses"] as const,
  activity: (bookingId: string) => [...bookingsQueryKeys.booking(bookingId), "activity"] as const,
  amendments: (bookingId: string) =>
    [...bookingsQueryKeys.booking(bookingId), "amendments"] as const,
  actionLedger: (bookingId: string) =>
    [...bookingsQueryKeys.booking(bookingId), "action-ledger"] as const,
  notes: (bookingId: string) => [...bookingsQueryKeys.booking(bookingId), "notes"] as const,

  groups: () => [...bookingsQueryKeys.all, "groups"] as const,
  groupsList: (filters: BookingGroupsListFilters) =>
    [...bookingsQueryKeys.groups(), "list", filters] as const,
  group: (id: string) => [...bookingsQueryKeys.groups(), "detail", id] as const,
  groupMembers: (id: string) => [...bookingsQueryKeys.group(id), "members"] as const,
  groupForBooking: (bookingId: string) =>
    [...bookingsQueryKeys.booking(bookingId), "group"] as const,

  pricingPreview: (filters: PricingPreviewFilters) =>
    [...bookingsQueryKeys.all, "pricing-preview", filters] as const,

  taxPreview: (filters: TaxPreviewFilters) =>
    [...bookingsQueryKeys.all, "tax-preview", filters] as const,
} as const
