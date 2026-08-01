"use client"

import type {
  CancelTripComponentsInput,
  CreateTripComponentBodyInput,
  CreateTripEnvelopeInput,
  CreateTripSnapshotInput,
  PreviewTripCancellationInput,
  PriceTripInput,
  ReserveTripInput,
  StartTripCheckoutInput,
  TripEnvelopeStatus,
  TripsListSortDir,
  TripsListSortField,
} from "@voyant-travel/trips"

import { type FetchWithValidationOptions, fetchWithValidation } from "./client.js"
import {
  cancelTripComponentsResponseSchema,
  previewTripCancellationResponseSchema,
  priceTripResponseSchema,
  proposalVersionSnapshotApplyResponseSchema,
  reserveTripResponseSchema,
  startTripCheckoutResponseSchema,
  tripComponentResponseSchema,
  tripEnvelopeResponseSchema,
  tripListResponseSchema,
  tripResponseSchema,
  tripSnapshotResponseSchema,
  tripSnapshotsResponseSchema,
} from "./schemas.js"

export type ListTripsParams = {
  status?: TripEnvelopeStatus
  search?: string
  productId?: string
  accommodationId?: string
  cruiseId?: string
  hasFlight?: boolean
  totalMinCents?: number
  totalMaxCents?: number
  createdFrom?: string
  createdTo?: string
  sortBy?: TripsListSortField
  sortDir?: TripsListSortDir
  limit?: number
  offset?: number
}
export type CreateTripBody = Omit<CreateTripEnvelopeInput, "travelerParty" | "constraints"> &
  Partial<Pick<CreateTripEnvelopeInput, "travelerParty" | "constraints">>
export type AddTripComponentBody = Omit<CreateTripComponentBodyInput, "sequence" | "metadata"> &
  Partial<Pick<CreateTripComponentBodyInput, "sequence" | "metadata">>
export type UpdateTripComponentBody = {
  sequence?: number
  status?: string
  description?: string | null
  catalogRef?: unknown
  metadata?: Record<string, unknown>
  warningCodes?: string[]
}
export type UpdateTripBody = {
  title?: string | null
  description?: string | null
  travelerParty?: Record<string, unknown>
  constraints?: Record<string, unknown>
  status?: TripEnvelopeStatus
  updatedBy?: string | null
}
export type PriceTripBody = Omit<PriceTripInput, "envelopeId">
export type ReserveTripBody = Omit<ReserveTripInput, "envelopeId">
export type StartTripCheckoutBody = Omit<StartTripCheckoutInput, "envelopeId">
export type PreviewTripCancellationBody = Omit<
  PreviewTripCancellationInput,
  "envelopeId" | "request"
> &
  Partial<Pick<PreviewTripCancellationInput, "request">>
export type CancelTripComponentsBody = Omit<CancelTripComponentsInput, "envelopeId" | "request"> &
  Partial<Pick<CancelTripComponentsInput, "request">>
export type CreateTripSnapshotBody = Omit<CreateTripSnapshotInput, "envelopeId">

function composerPath(client: FetchWithValidationOptions, path: string): string {
  return `/v1/${client.surface ?? "admin"}/trips${path}`
}

function adminComposerPath(path: string): string {
  return `/v1/admin/trips${path}`
}

function withQuery(path: string, params: ListTripsParams = {}): string {
  const search = new URLSearchParams()
  if (params.status) search.set("status", params.status)
  if (params.search) search.set("search", params.search)
  if (params.productId) search.set("productId", params.productId)
  if (params.accommodationId) search.set("accommodationId", params.accommodationId)
  if (params.cruiseId) search.set("cruiseId", params.cruiseId)
  if (params.hasFlight !== undefined) search.set("hasFlight", String(params.hasFlight))
  if (params.totalMinCents !== undefined) {
    search.set("totalMinCents", String(params.totalMinCents))
  }
  if (params.totalMaxCents !== undefined) {
    search.set("totalMaxCents", String(params.totalMaxCents))
  }
  if (params.createdFrom) search.set("createdFrom", params.createdFrom)
  if (params.createdTo) search.set("createdTo", params.createdTo)
  if (params.sortBy) search.set("sortBy", params.sortBy)
  if (params.sortDir) search.set("sortDir", params.sortDir)
  if (params.limit !== undefined) search.set("limit", String(params.limit))
  if (params.offset !== undefined) search.set("offset", String(params.offset))
  const suffix = search.toString()
  return suffix ? `${path}?${suffix}` : path
}

export function listTrips(client: FetchWithValidationOptions, params: ListTripsParams = {}) {
  return fetchWithValidation(
    composerPath(client, withQuery("", params)),
    tripListResponseSchema,
    client,
  )
}

export function createTrip(client: FetchWithValidationOptions, input: CreateTripBody) {
  return fetchWithValidation(composerPath(client, ""), tripResponseSchema, client, {
    method: "POST",
    body: JSON.stringify(input),
  }).then((response) => response.data)
}

export function getTrip(client: FetchWithValidationOptions, envelopeId: string) {
  return fetchWithValidation(
    composerPath(client, `/${encodeURIComponent(envelopeId)}`),
    tripResponseSchema,
    client,
  ).then((response) => response.data)
}

export function updateTrip(
  client: FetchWithValidationOptions,
  envelopeId: string,
  input: UpdateTripBody,
) {
  return fetchWithValidation(
    composerPath(client, `/${encodeURIComponent(envelopeId)}`),
    tripEnvelopeResponseSchema,
    client,
    { method: "PATCH", body: JSON.stringify(input) },
  ).then((response) => response.data)
}

export function listTripSnapshots(client: FetchWithValidationOptions, envelopeId: string) {
  return fetchWithValidation(
    composerPath(client, `/${encodeURIComponent(envelopeId)}/snapshots`),
    tripSnapshotsResponseSchema,
    client,
  ).then((response) => response.data)
}

export function getTripSnapshot(client: FetchWithValidationOptions, snapshotId: string) {
  return fetchWithValidation(
    composerPath(client, `/snapshots/${encodeURIComponent(snapshotId)}`),
    tripSnapshotResponseSchema,
    client,
  ).then((response) => response.data)
}

export function freezeTripSnapshot(
  client: FetchWithValidationOptions,
  envelopeId: string,
  input: CreateTripSnapshotBody = {},
) {
  return fetchWithValidation(
    composerPath(client, `/${encodeURIComponent(envelopeId)}/snapshots`),
    tripSnapshotResponseSchema,
    client,
    { method: "POST", body: JSON.stringify(input) },
  ).then((response) => response.data)
}

export function freezeTripSnapshotForProposalVersion(
  client: FetchWithValidationOptions,
  envelopeId: string,
  proposalVersionId: string,
  input: CreateTripSnapshotBody = {},
) {
  return fetchWithValidation(
    adminComposerPath(
      `/${encodeURIComponent(envelopeId)}/proposal-versions/${encodeURIComponent(
        proposalVersionId,
      )}/snapshot`,
    ),
    proposalVersionSnapshotApplyResponseSchema,
    client,
    { method: "POST", body: JSON.stringify(input) },
  ).then((response) => response.data)
}

export function addTripComponent(
  client: FetchWithValidationOptions,
  envelopeId: string,
  input: AddTripComponentBody,
) {
  return fetchWithValidation(
    composerPath(client, `/${encodeURIComponent(envelopeId)}/components`),
    tripComponentResponseSchema,
    client,
    { method: "POST", body: JSON.stringify(input) },
  ).then((response) => response.data)
}

export function removeTripComponent(client: FetchWithValidationOptions, componentId: string) {
  return fetchWithValidation(
    composerPath(client, `/components/${encodeURIComponent(componentId)}`),
    tripComponentResponseSchema,
    client,
    { method: "DELETE" },
  ).then((response) => response.data)
}

export function updateTripComponent(
  client: FetchWithValidationOptions,
  componentId: string,
  input: UpdateTripComponentBody,
) {
  return fetchWithValidation(
    composerPath(client, `/components/${encodeURIComponent(componentId)}`),
    tripComponentResponseSchema,
    client,
    { method: "PATCH", body: JSON.stringify(input) },
  ).then((response) => response.data)
}

export function priceTrip(
  client: FetchWithValidationOptions,
  envelopeId: string,
  input: PriceTripBody,
) {
  return fetchWithValidation(
    composerPath(client, `/${encodeURIComponent(envelopeId)}/price`),
    priceTripResponseSchema,
    client,
    { method: "POST", body: JSON.stringify(input) },
  ).then((response) => response.data)
}

export function reserveTrip(
  client: FetchWithValidationOptions,
  envelopeId: string,
  input: ReserveTripBody = {},
) {
  return fetchWithValidation(
    composerPath(client, `/${encodeURIComponent(envelopeId)}/reserve`),
    reserveTripResponseSchema,
    client,
    { method: "POST", body: JSON.stringify(input) },
  ).then((response) => response.data)
}

export function startTripCheckout(
  client: FetchWithValidationOptions,
  envelopeId: string,
  input: StartTripCheckoutBody,
) {
  return fetchWithValidation(
    composerPath(client, `/${encodeURIComponent(envelopeId)}/checkout`),
    startTripCheckoutResponseSchema,
    client,
    { method: "POST", body: JSON.stringify(input) },
  ).then((response) => response.data)
}

export function previewTripCancellation(
  client: FetchWithValidationOptions,
  envelopeId: string,
  input: PreviewTripCancellationBody,
) {
  return fetchWithValidation(
    composerPath(client, `/${encodeURIComponent(envelopeId)}/cancellation-preview`),
    previewTripCancellationResponseSchema,
    client,
    { method: "POST", body: JSON.stringify(input) },
  ).then((response) => response.data)
}

export function cancelTripComponents(
  client: FetchWithValidationOptions,
  envelopeId: string,
  input: CancelTripComponentsBody,
) {
  return fetchWithValidation(
    composerPath(client, `/${encodeURIComponent(envelopeId)}/cancel-components`),
    cancelTripComponentsResponseSchema,
    client,
    { method: "POST", body: JSON.stringify(input) },
  ).then((response) => response.data)
}
