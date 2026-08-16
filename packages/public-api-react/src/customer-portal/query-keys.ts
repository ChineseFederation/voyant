export const customerPortalQueryKeys = {
  all: ["customer-portal"] as const,
  profile: () => [...customerPortalQueryKeys.all, "profile"] as const,
  profileDocuments: () => [...customerPortalQueryKeys.profile(), "documents"] as const,
  companions: () => [...customerPortalQueryKeys.all, "companions"] as const,
  bookings: () => [...customerPortalQueryKeys.all, "bookings"] as const,
  booking: (bookingId: string) => [...customerPortalQueryKeys.bookings(), bookingId] as const,
  bookingBillingContact: (bookingId: string) =>
    [...customerPortalQueryKeys.booking(bookingId), "billing-contact"] as const,
  bookingDocuments: (bookingId: string) =>
    [...customerPortalQueryKeys.booking(bookingId), "documents"] as const,
}
