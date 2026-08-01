import {
  type BookingSessionOutcomeV1,
  type BookingSessionRecordV1,
  type BookingSessionTargetV1,
  bookingSessionOutcomeV1,
  type CommitBookingSessionV1,
  type CreateBookingSessionV1,
  type PlaceBookingHoldV1,
  type QuoteBookingSessionV1,
  type UpdateBookingSessionV1,
} from "@voyant-travel/catalog-contracts/booking-engine/session-contracts"

import {
  requestHeaders,
  type StorefrontRequestOptions,
  storefrontFetchWithValidation,
  type VoyantStorefrontClientOptions,
} from "./client.js"

type ResolvedClientOptions = Required<Pick<VoyantStorefrontClientOptions, "baseUrl" | "fetcher">> &
  Pick<VoyantStorefrontClientOptions, "headers">

export const BOOKING_SESSION_CAPABILITY_HEADER = "Voyant-Booking-Session-Capability"

export interface BookingSessionRequestOptions extends StorefrontRequestOptions {
  /**
   * Client-held anonymous Session secret. Generate it once and reuse it for
   * create retries and every later Session mutation.
   */
  capability?: string
}

export interface OwnedProductBookingTracerInput {
  target: BookingSessionTargetV1
  journeyKey: string
  state?: Record<string, unknown>
  quantity?: number
  requestOptions?: BookingSessionRequestOptions
}

export type OwnedProductBookingTracerResult =
  | {
      kind: "completed"
      session: BookingSessionRecordV1
      quoteOutcome: BookingSessionOutcomeV1
      holdOutcome: BookingSessionOutcomeV1
      commitOutcome: BookingSessionOutcomeV1
    }
  | {
      kind: "stopped"
      stage: "create" | "update" | "quote" | "hold" | "commit"
      outcome: BookingSessionOutcomeV1
      session?: BookingSessionRecordV1
      quoteOutcome?: BookingSessionOutcomeV1
      holdOutcome?: BookingSessionOutcomeV1
    }

export function createBookingSessionV1(
  client: ResolvedClientOptions,
  input: CreateBookingSessionV1,
  options?: BookingSessionRequestOptions,
) {
  const capability = options?.capability ?? createBookingSessionCapabilityV1()
  return storefrontFetchWithValidation(
    "/v1/public/catalog/booking-sessions",
    bookingSessionOutcomeV1,
    client,
    {
      method: "POST",
      headers: bookingSessionRequestHeaders({ ...options, capability }),
      body: JSON.stringify(input),
    },
  )
}

export function updateBookingSessionV1(
  client: ResolvedClientOptions,
  sessionId: string,
  input: UpdateBookingSessionV1,
  options?: BookingSessionRequestOptions,
) {
  return storefrontFetchWithValidation(
    `/v1/public/catalog/booking-sessions/${encodeURIComponent(sessionId)}`,
    bookingSessionOutcomeV1,
    client,
    {
      method: "PATCH",
      headers: bookingSessionRequestHeaders(options),
      body: JSON.stringify(input),
    },
  )
}

export function quoteBookingSessionV1(
  client: ResolvedClientOptions,
  sessionId: string,
  input: QuoteBookingSessionV1,
  options?: BookingSessionRequestOptions,
) {
  return storefrontFetchWithValidation(
    `/v1/public/catalog/booking-sessions/${encodeURIComponent(sessionId)}/quote`,
    bookingSessionOutcomeV1,
    client,
    {
      method: "POST",
      headers: bookingSessionRequestHeaders(options),
      body: JSON.stringify(input),
    },
  )
}

export function holdBookingSessionV1(
  client: ResolvedClientOptions,
  sessionId: string,
  input: PlaceBookingHoldV1,
  options?: BookingSessionRequestOptions,
) {
  return storefrontFetchWithValidation(
    `/v1/public/catalog/booking-sessions/${encodeURIComponent(sessionId)}/hold`,
    bookingSessionOutcomeV1,
    client,
    {
      method: "POST",
      headers: bookingSessionRequestHeaders(options),
      body: JSON.stringify(input),
    },
  )
}

export function commitBookingSessionV1(
  client: ResolvedClientOptions,
  sessionId: string,
  input: CommitBookingSessionV1,
  options?: BookingSessionRequestOptions,
) {
  return storefrontFetchWithValidation(
    `/v1/public/catalog/booking-sessions/${encodeURIComponent(sessionId)}/commit`,
    bookingSessionOutcomeV1,
    client,
    {
      method: "POST",
      headers: bookingSessionRequestHeaders(options),
      body: JSON.stringify(input),
    },
  )
}

export async function runOwnedProductBookingTracerV1(
  client: ResolvedClientOptions,
  input: OwnedProductBookingTracerInput,
): Promise<OwnedProductBookingTracerResult> {
  const capability = input.requestOptions?.capability ?? createBookingSessionCapabilityV1()
  const created = await createBookingSessionV1(
    client,
    { idempotencyKey: `${input.journeyKey}:create`, target: input.target },
    { ...input.requestOptions, capability },
  )
  if (created.kind !== "session_created") {
    return { kind: "stopped", stage: "create", outcome: created }
  }
  let session = created.session
  const sessionRequestOptions: BookingSessionRequestOptions = {
    ...input.requestOptions,
    capability,
  }

  if (input.state) {
    const updated = await updateBookingSessionV1(
      client,
      session.id,
      {
        expectedRevision: session.revision,
        selection: input.state,
        idempotencyKey: `${input.journeyKey}:update`,
      },
      sessionRequestOptions,
    )
    if (updated.kind !== "session_updated") {
      return { kind: "stopped", stage: "update", outcome: updated, session }
    }
    session = updated.session
  }

  const quoteOutcome = await quoteBookingSessionV1(
    client,
    session.id,
    {
      expectedRevision: session.revision,
      idempotencyKey: `${input.journeyKey}:quote`,
    },
    sessionRequestOptions,
  )
  if (quoteOutcome.kind !== "quote_created") {
    return { kind: "stopped", stage: "quote", outcome: quoteOutcome, session }
  }

  const holdOutcome = await holdBookingSessionV1(
    client,
    session.id,
    {
      expectedRevision: session.revision,
      quoteId: quoteOutcome.quote.id,
      quantity: input.quantity ?? 1,
      idempotencyKey: `${input.journeyKey}:hold`,
    },
    sessionRequestOptions,
  )
  if (holdOutcome.kind !== "hold_created") {
    return { kind: "stopped", stage: "hold", outcome: holdOutcome, session, quoteOutcome }
  }

  const commitOutcome = await commitBookingSessionV1(
    client,
    session.id,
    {
      expectedRevision: session.revision,
      quoteId: quoteOutcome.quote.id,
      holdId: holdOutcome.hold.id,
      idempotencyKey: `${input.journeyKey}:commit`,
    },
    sessionRequestOptions,
  )

  if (commitOutcome.kind !== "commit_result") {
    return {
      kind: "stopped",
      stage: "commit",
      outcome: commitOutcome,
      session,
      quoteOutcome,
      holdOutcome,
    }
  }

  return { kind: "completed", session, quoteOutcome, holdOutcome, commitOutcome }
}

/** Creates a portable 256-bit anonymous Booking Session capability. */
export function createBookingSessionCapabilityV1(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return `bcap_${base64Url(bytes)}`
}

function bookingSessionRequestHeaders(
  options?: BookingSessionRequestOptions,
): HeadersInit | undefined {
  if (!options?.capability) {
    return requestHeaders(options)
  }

  const headers = new Headers(requestHeaders(options))
  headers.set(BOOKING_SESSION_CAPABILITY_HEADER, options.capability)
  return headers
}

function base64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}
