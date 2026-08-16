import {
  type AcceptBookingAmendmentInput,
  type ApplyBookingAmendmentInput,
  acceptBookingAmendmentSchema,
  applyBookingAmendmentSchema,
  bookingAmendmentPreviewResultSchema,
  bookingAmendmentSchema,
  type PreviewTravelerCorrectionInput,
  previewTravelerCorrectionSchema,
} from "@voyant-travel/bookings-contracts"
import { z } from "zod"

import {
  type PublicApiRequestOptions,
  publicApiFetchWithValidation,
  requestHeaders,
  type VoyantPublicApiClientOptions,
} from "./client.js"

type ResolvedClientOptions = Required<Pick<VoyantPublicApiClientOptions, "baseUrl" | "fetcher">> &
  Pick<VoyantPublicApiClientOptions, "headers">

export interface BookingAmendmentMutationOptions extends PublicApiRequestOptions {
  idempotencyKey: string
}

export type {
  AcceptBookingAmendmentInput,
  ApplyBookingAmendmentInput,
  BookingAmendment,
  PreviewTravelerCorrectionInput,
} from "@voyant-travel/bookings-contracts"

const amendmentResponseSchema = z.object({ data: bookingAmendmentSchema })
const amendmentListResponseSchema = z.object({ data: z.array(bookingAmendmentSchema) })
const amendmentPreviewResponseSchema = z.object({ data: bookingAmendmentPreviewResultSchema })

function amendmentPath(bookingId: string, suffix = "") {
  return `/v1/public/bookings/${encodeURIComponent(bookingId)}/amendments${suffix}`
}

export function previewTravelerCorrection(
  client: ResolvedClientOptions,
  bookingId: string,
  input: PreviewTravelerCorrectionInput,
  options: BookingAmendmentMutationOptions,
) {
  const body = previewTravelerCorrectionSchema.parse(input)
  return publicApiFetchWithValidation(
    amendmentPath(bookingId, "/traveler-corrections/preview"),
    amendmentPreviewResponseSchema,
    client,
    { method: "POST", headers: requestHeaders(options), body: JSON.stringify(body) },
  ).then((response) => response.data)
}

export function listBookingAmendments(
  client: ResolvedClientOptions,
  bookingId: string,
  options?: PublicApiRequestOptions,
) {
  return publicApiFetchWithValidation(
    amendmentPath(bookingId),
    amendmentListResponseSchema,
    client,
    { headers: requestHeaders(options) },
  ).then((response) => response.data)
}

export function getBookingAmendment(
  client: ResolvedClientOptions,
  bookingId: string,
  amendmentId: string,
  options?: PublicApiRequestOptions,
) {
  return publicApiFetchWithValidation(
    amendmentPath(bookingId, `/${encodeURIComponent(amendmentId)}`),
    amendmentResponseSchema,
    client,
    { headers: requestHeaders(options) },
  ).then((response) => response.data)
}

export function acceptBookingAmendment(
  client: ResolvedClientOptions,
  bookingId: string,
  amendmentId: string,
  input: AcceptBookingAmendmentInput,
  options: BookingAmendmentMutationOptions,
) {
  const body = acceptBookingAmendmentSchema.parse(input)
  return publicApiFetchWithValidation(
    amendmentPath(bookingId, `/${encodeURIComponent(amendmentId)}/accept`),
    amendmentResponseSchema,
    client,
    { method: "POST", headers: requestHeaders(options), body: JSON.stringify(body) },
  ).then((response) => response.data)
}

export function applyBookingAmendment(
  client: ResolvedClientOptions,
  bookingId: string,
  amendmentId: string,
  input: ApplyBookingAmendmentInput,
  options: BookingAmendmentMutationOptions,
) {
  const body = applyBookingAmendmentSchema.parse(input)
  return publicApiFetchWithValidation(
    amendmentPath(bookingId, `/${encodeURIComponent(amendmentId)}/apply`),
    amendmentResponseSchema,
    client,
    { method: "POST", headers: requestHeaders(options), body: JSON.stringify(body) },
  ).then((response) => response.data)
}
