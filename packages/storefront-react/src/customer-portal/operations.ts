"use client"

import { type FetchWithValidationOptions, fetchWithValidation } from "./client.js"
import {
  type BootstrapCustomerPortalInput,
  type CreateCustomerPortalCompanionInput,
  type CreateCustomerPortalProfileDocumentInput,
  customerPortalBookingBillingContactResponseSchema,
  customerPortalBookingDocumentsResponseSchema,
  customerPortalBookingResponseSchema,
  customerPortalBookingsResponseSchema,
  customerPortalBootstrapResponseSchema,
  customerPortalCompanionImportResponseSchema,
  customerPortalCompanionResponseSchema,
  customerPortalCompanionsResponseSchema,
  customerPortalProfileDocumentResponseSchema,
  customerPortalProfileDocumentsResponseSchema,
  customerPortalProfileResponseSchema,
  type ImportCustomerPortalBookingTravelersInput,
  successEnvelope,
  type UpdateCustomerPortalCompanionInput,
  type UpdateCustomerPortalProfileDocumentInput,
  type UpdateCustomerPortalProfileInput,
} from "./schemas.js"

export function getCustomerPortalProfile(client: FetchWithValidationOptions) {
  return fetchWithValidation(
    "/v1/public/customer-portal/me",
    customerPortalProfileResponseSchema,
    client,
  )
}

export function updateCustomerPortalProfile(
  client: FetchWithValidationOptions,
  input: UpdateCustomerPortalProfileInput,
) {
  return fetchWithValidation(
    "/v1/public/customer-portal/me",
    customerPortalProfileResponseSchema,
    client,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  )
}

export function bootstrapCustomerPortal(
  client: FetchWithValidationOptions,
  input: BootstrapCustomerPortalInput,
) {
  return fetchWithValidation(
    "/v1/public/customer-portal/bootstrap",
    customerPortalBootstrapResponseSchema,
    client,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  )
}

export function listCustomerPortalCompanions(client: FetchWithValidationOptions) {
  return fetchWithValidation(
    "/v1/public/customer-portal/companions",
    customerPortalCompanionsResponseSchema,
    client,
  )
}

export function createCustomerPortalCompanion(
  client: FetchWithValidationOptions,
  input: CreateCustomerPortalCompanionInput,
) {
  return fetchWithValidation(
    "/v1/public/customer-portal/companions",
    customerPortalCompanionResponseSchema,
    client,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  )
}

export function importCustomerPortalBookingTravelers(
  client: FetchWithValidationOptions,
  input: ImportCustomerPortalBookingTravelersInput = {},
) {
  return fetchWithValidation(
    "/v1/public/customer-portal/companions/import-booking-travelers",
    customerPortalCompanionImportResponseSchema,
    client,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  )
}

export const importCustomerPortalBookingParticipants = importCustomerPortalBookingTravelers

export function updateCustomerPortalCompanion(
  client: FetchWithValidationOptions,
  companionId: string,
  input: UpdateCustomerPortalCompanionInput,
) {
  return fetchWithValidation(
    `/v1/public/customer-portal/companions/${companionId}`,
    customerPortalCompanionResponseSchema,
    client,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  )
}

export function deleteCustomerPortalCompanion(
  client: FetchWithValidationOptions,
  companionId: string,
) {
  return fetchWithValidation(
    `/v1/public/customer-portal/companions/${companionId}`,
    successEnvelope,
    client,
    {
      method: "DELETE",
    },
  )
}

export function listCustomerPortalBookings(client: FetchWithValidationOptions) {
  return fetchWithValidation(
    "/v1/public/customer-portal/bookings",
    customerPortalBookingsResponseSchema,
    client,
  )
}

export function getCustomerPortalBooking(client: FetchWithValidationOptions, bookingId: string) {
  return fetchWithValidation(
    `/v1/public/customer-portal/bookings/${bookingId}`,
    customerPortalBookingResponseSchema,
    client,
  )
}

export function getCustomerPortalBookingBillingContact(
  client: FetchWithValidationOptions,
  bookingId: string,
) {
  return fetchWithValidation(
    `/v1/public/customer-portal/bookings/${bookingId}/billing-contact`,
    customerPortalBookingBillingContactResponseSchema,
    client,
  )
}

export function listCustomerPortalBookingDocuments(
  client: FetchWithValidationOptions,
  bookingId: string,
) {
  return fetchWithValidation(
    `/v1/public/customer-portal/bookings/${bookingId}/documents`,
    customerPortalBookingDocumentsResponseSchema,
    client,
  )
}

export function listCustomerPortalProfileDocuments(client: FetchWithValidationOptions) {
  return fetchWithValidation(
    "/v1/public/customer-portal/me/documents",
    customerPortalProfileDocumentsResponseSchema,
    client,
  )
}

export function createCustomerPortalProfileDocument(
  client: FetchWithValidationOptions,
  input: CreateCustomerPortalProfileDocumentInput,
) {
  return fetchWithValidation(
    "/v1/public/customer-portal/me/documents",
    customerPortalProfileDocumentResponseSchema,
    client,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  )
}

export function updateCustomerPortalProfileDocument(
  client: FetchWithValidationOptions,
  documentId: string,
  input: UpdateCustomerPortalProfileDocumentInput,
) {
  return fetchWithValidation(
    `/v1/public/customer-portal/me/documents/${documentId}`,
    customerPortalProfileDocumentResponseSchema,
    client,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  )
}

export function deleteCustomerPortalProfileDocument(
  client: FetchWithValidationOptions,
  documentId: string,
) {
  return fetchWithValidation(
    `/v1/public/customer-portal/me/documents/${documentId}`,
    successEnvelope,
    client,
    { method: "DELETE" },
  )
}

export function setPrimaryCustomerPortalProfileDocument(
  client: FetchWithValidationOptions,
  documentId: string,
) {
  return fetchWithValidation(
    `/v1/public/customer-portal/me/documents/${documentId}/set-primary`,
    customerPortalProfileDocumentResponseSchema,
    client,
    { method: "POST" },
  )
}
