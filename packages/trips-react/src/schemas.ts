import type {
  CancelTripComponentsResult,
  PriceTripResult,
  ReserveTripResult,
  StartCheckoutResult,
  Trip,
  TripCancellationPreviewResult,
  TripComponent,
  TripEnvelope,
  TripListResult,
  TripSnapshot,
} from "@voyant-travel/trips"
import { z } from "zod"

export type ProposalVersionSnapshotApplyResult = {
  snapshot: TripSnapshot
  proposalVersion: {
    id: string
    proposalId: string
    status: string
    tripSnapshotId: string | null
    currency: string
    subtotalAmountCents: number
    taxAmountCents: number
    totalAmountCents: number
    [key: string]: unknown
  }
  lines: Array<{
    id: string
    proposalVersionId: string
    productId: string | null
    supplierServiceId: string | null
    description: string
    quantity: number
    unitPriceAmountCents: number
    totalAmountCents: number
    currency: string
    [key: string]: unknown
  }>
}

export const singleEnvelope = <T extends z.ZodTypeAny>(item: T) => z.object({ data: item })

const unknownData = z.unknown()

export const tripResponseSchema = singleEnvelope(unknownData) as z.ZodType<{
  data: Trip
}>
export const tripListResponseSchema = unknownData as z.ZodType<TripListResult>
export const tripEnvelopeResponseSchema = singleEnvelope(unknownData) as z.ZodType<{
  data: TripEnvelope
}>
export const tripComponentResponseSchema = singleEnvelope(unknownData) as z.ZodType<{
  data: TripComponent
}>
export const tripComponentsResponseSchema = singleEnvelope(unknownData) as z.ZodType<{
  data: Trip["components"]
}>
export const tripSnapshotResponseSchema = singleEnvelope(unknownData) as z.ZodType<{
  data: TripSnapshot
}>
export const tripSnapshotsResponseSchema = singleEnvelope(unknownData) as z.ZodType<{
  data: TripSnapshot[]
}>
export const proposalVersionSnapshotApplyResponseSchema = singleEnvelope(unknownData) as z.ZodType<{
  data: ProposalVersionSnapshotApplyResult
}>
export const priceTripResponseSchema = singleEnvelope(unknownData) as z.ZodType<{
  data: PriceTripResult
}>
export const reserveTripResponseSchema = singleEnvelope(unknownData) as z.ZodType<{
  data: ReserveTripResult
}>
export const startTripCheckoutResponseSchema = singleEnvelope(unknownData) as z.ZodType<{
  data: StartCheckoutResult
}>
export const previewTripCancellationResponseSchema = singleEnvelope(unknownData) as z.ZodType<{
  data: TripCancellationPreviewResult
}>
export const cancelTripComponentsResponseSchema = singleEnvelope(unknownData) as z.ZodType<{
  data: CancelTripComponentsResult
}>
