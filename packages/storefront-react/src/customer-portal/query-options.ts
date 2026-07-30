"use client"

import { queryOptions } from "@tanstack/react-query"

import type { FetchWithValidationOptions } from "./client.js"
import {
  getCustomerPortalBooking,
  getCustomerPortalBookingBillingContact,
  getCustomerPortalProfile,
  listCustomerPortalBookingDocuments,
  listCustomerPortalBookings,
  listCustomerPortalCompanions,
  listCustomerPortalProfileDocuments,
} from "./operations.js"
import { customerPortalQueryKeys } from "./query-keys.js"

export function getCustomerPortalProfileQueryOptions(client: FetchWithValidationOptions) {
  return queryOptions({
    queryKey: customerPortalQueryKeys.profile(),
    queryFn: () => getCustomerPortalProfile(client),
  })
}

export function getCustomerPortalProfileDocumentsQueryOptions(client: FetchWithValidationOptions) {
  return queryOptions({
    queryKey: customerPortalQueryKeys.profileDocuments(),
    queryFn: () => listCustomerPortalProfileDocuments(client),
  })
}

export function getCustomerPortalCompanionsQueryOptions(client: FetchWithValidationOptions) {
  return queryOptions({
    queryKey: customerPortalQueryKeys.companions(),
    queryFn: () => listCustomerPortalCompanions(client),
  })
}

export function getCustomerPortalBookingsQueryOptions(client: FetchWithValidationOptions) {
  return queryOptions({
    queryKey: customerPortalQueryKeys.bookings(),
    queryFn: () => listCustomerPortalBookings(client),
  })
}

export function getCustomerPortalBookingQueryOptions(
  client: FetchWithValidationOptions,
  bookingId: string,
) {
  return queryOptions({
    queryKey: customerPortalQueryKeys.booking(bookingId),
    queryFn: () => getCustomerPortalBooking(client, bookingId),
  })
}

export function getCustomerPortalBookingBillingContactQueryOptions(
  client: FetchWithValidationOptions,
  bookingId: string,
) {
  return queryOptions({
    queryKey: customerPortalQueryKeys.bookingBillingContact(bookingId),
    queryFn: () => getCustomerPortalBookingBillingContact(client, bookingId),
  })
}

export function getCustomerPortalBookingDocumentsQueryOptions(
  client: FetchWithValidationOptions,
  bookingId: string,
) {
  return queryOptions({
    queryKey: customerPortalQueryKeys.bookingDocuments(bookingId),
    queryFn: () => listCustomerPortalBookingDocuments(client, bookingId),
  })
}

export type {} from "./query-keys.js"
