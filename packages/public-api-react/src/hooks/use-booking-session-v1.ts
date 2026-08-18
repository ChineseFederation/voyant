"use client"

import { useMutation } from "@tanstack/react-query"
import {
  type AbandonBookingSessionV1,
  type AdoptBookingSessionV1,
  type BookingSessionRequestOptions,
  type BookingSessionViewV1,
  type CommitBookingSessionV1,
  type CreateBookingSessionV1,
  createBookingSessionCapabilityV1,
  createVoyantPublicApiClient,
  type OwnedProductBookingTracerInput,
  type OwnedProductBookingTracerResult,
  type RenewBookingSessionV1,
  type UpdateBookingSessionV1,
} from "../legacy-client/index.js"

import { useVoyantPublicApiContext } from "../provider.js"

export function useOwnedProductBookingTracerV1() {
  const client = useBookingSessionClient()

  return useMutation<OwnedProductBookingTracerResult, Error, OwnedProductBookingTracerInput>({
    mutationFn: (input) => client.bookingSessionsV1.runOwnedProductTracer(input),
  })
}

export function useCreateBookingSessionV1() {
  const client = useBookingSessionClient()
  return useMutation({
    mutationFn: async (request: {
      input: CreateBookingSessionV1
      capability?: string
      requestOptions?: Omit<BookingSessionRequestOptions, "capability">
    }) => {
      const capability = request.capability ?? createBookingSessionCapabilityV1()
      const outcome = await client.bookingSessionsV1.create(request.input, {
        ...request.requestOptions,
        capability,
      })
      return { outcome, capability }
    },
  })
}

export function useResumeBookingSessionV1() {
  const client = useBookingSessionClient()
  return useMutation({
    mutationFn: (request: { sessionId: string; requestOptions: BookingSessionRequestOptions }) =>
      client.bookingSessionsV1.resume(request.sessionId, request.requestOptions),
  })
}

export function useAdoptBookingSessionV1() {
  const client = useBookingSessionClient()
  return useMutation({
    mutationFn: (request: {
      sessionId: string
      input: AdoptBookingSessionV1
      requestOptions: BookingSessionRequestOptions
    }) => client.bookingSessionsV1.adopt(request.sessionId, request.input, request.requestOptions),
  })
}

export function useUpdateBookingSessionV1() {
  const client = useBookingSessionClient()
  return useMutation({
    mutationFn: (request: {
      sessionId: string
      input: UpdateBookingSessionV1
      requestOptions: BookingSessionRequestOptions
    }) => client.bookingSessionsV1.update(request.sessionId, request.input, request.requestOptions),
  })
}

export function useRenewBookingSessionV1() {
  const client = useBookingSessionClient()
  return useMutation({
    mutationFn: (request: {
      sessionId: string
      input: RenewBookingSessionV1
      requestOptions: BookingSessionRequestOptions
    }) => client.bookingSessionsV1.renew(request.sessionId, request.input, request.requestOptions),
  })
}

export function useAbandonBookingSessionV1() {
  const client = useBookingSessionClient()
  return useMutation({
    mutationFn: (request: {
      sessionId: string
      input: AbandonBookingSessionV1
      requestOptions: BookingSessionRequestOptions
    }) =>
      client.bookingSessionsV1.abandon(request.sessionId, request.input, request.requestOptions),
  })
}

/** Retry Commit after a payment redirect/callback using the same Session authority. */
export function useCommitBookingSessionV1() {
  const client = useBookingSessionClient()
  return useMutation({
    mutationFn: (request: {
      sessionId: string
      input: CommitBookingSessionV1
      requestOptions: BookingSessionRequestOptions
    }) => client.bookingSessionsV1.commit(request.sessionId, request.input, request.requestOptions),
  })
}

/** Expired recovery creates a new aggregate; it never revives stale spend authority. */
export function useRecoverExpiredBookingSessionV1() {
  const client = useBookingSessionClient()
  return useMutation({
    mutationFn: async (request: {
      expiredSession: BookingSessionViewV1
      idempotencyKey: string
      capability?: string
      requestOptions?: Omit<BookingSessionRequestOptions, "capability">
    }) => {
      if (request.expiredSession.state !== "expired") {
        throw new Error("booking_session_recovery_requires_expired_session")
      }
      const target = request.expiredSession.target
      if (target.kind !== "product" && target.kind !== "catalog_item") {
        throw new Error("booking_session_recovery_requires_public_target")
      }
      const capability = request.capability ?? createBookingSessionCapabilityV1()
      const outcome = await client.bookingSessionsV1.create(
        {
          idempotencyKey: request.idempotencyKey,
          target,
          selection: request.expiredSession.selection,
        },
        { ...request.requestOptions, capability },
      )
      return { outcome, capability }
    },
  })
}

function useBookingSessionClient() {
  const { baseUrl, fetcher } = useVoyantPublicApiContext()
  return createVoyantPublicApiClient({ baseUrl, fetcher })
}
