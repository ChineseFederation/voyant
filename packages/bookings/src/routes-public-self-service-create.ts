/**
 * `POST /v1/public/bookings` — public self-service booking creation.
 *
 * The resource is a booking, so the route lives with the rest of the public
 * booking surface rather than under the package that happens to compose the
 * command. Finance owns that command and supplies it through
 * `bookings.self-service-create.runtime`, which inverts the package dependency
 * the same way `bookings.finance.runtime` already does.
 *
 * A caller supplies three identifiers and nothing else. Booking numbers,
 * prices, tax lines, relationship ids, and status are all derived server-side:
 * a public caller can write the draft, so anything read from it is untrusted
 * input rather than intent.
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { idempotencyKey, openApiValidationHook } from "@voyant-travel/hono"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"

import { checkoutCapabilityCookie, issueCheckoutCapability } from "./checkout-capability.js"
import { getRuntimeEnv } from "./routes-shared.js"
import type { BookingsSelfServiceCreateRuntime } from "./runtime-port.js"

/** Spends the verified challenge inside the create transaction. */
export interface SelfServiceGuestVerification {
  consume(
    tx: PostgresJsDatabase,
    input: {
      challengeId: string
      subjectRef: string
      destination: string
      consumedRef: string
    },
  ): Promise<{ status: "consumed"; destination: string } | { status: "rejected" }>
  /** Reads the destination a challenge was verified for, before the command runs. */
  peekVerifiedDestination(
    db: PostgresJsDatabase,
    input: { challengeId: string; subjectRef: string },
  ): Promise<{ channel: "email" | "sms"; destination: string } | null>
}

export interface SelfServiceCreateRouteOptions {
  /** Finance's durable create command, when the deployment selected a provider. */
  resolveSelfServiceCreate?(c: Context): BookingsSelfServiceCreateRuntime | undefined
  resolveGuestVerification?(c: Context): SelfServiceGuestVerification | undefined
  /** The authenticated customer's CRM person id, when the caller has an account. */
  resolveAuthenticatedPersonId?(c: Context): string | undefined
  /** The authenticated customer's user id, for ledger attribution. */
  resolveAuthenticatedUserId?(c: Context): string | undefined
}

type Env = {
  Bindings: Record<string, string | undefined>
  Variables: { db: PostgresJsDatabase }
}

const errorResponseSchema = z.object({ error: z.string() })

const createBookingRequestSchema = z.object({
  draftId: z.string().trim().min(1),
  quoteId: z.string().trim().min(1),
  /** Omitted for an authenticated customer. */
  verificationChallengeId: z.string().trim().min(1).optional(),
})

const createBookingResponseSchema = z.object({
  data: z.object({
    bookingId: z.string(),
    bookingNumber: z.string(),
    status: z.string(),
    checkoutCapability: z.object({
      token: z.string(),
      expiresAt: z.string(),
      actions: z.array(z.string()),
    }),
  }),
})

/** Reads the draft capability from the header or its HttpOnly cookie. */
function readDraftCapabilityToken(c: Context): string | undefined {
  const header = c.req.header("X-Voyant-Booking-Draft")
  if (header) return header
  const cookie = c.req.header("Cookie") ?? ""
  const match = /(?:^|;\s*)voyant_booking_draft=([^;]+)/.exec(cookie)
  return match?.[1] ? decodeURIComponent(match[1]) : undefined
}

/** Rejections map to a status the caller can act on without string matching. */
const REJECTION_STATUS: Record<string, 403 | 404 | 409 | 422> = {
  draft_not_found: 404,
  quote_not_found: 404,
  // The caller does not hold this draft. Deliberately indistinguishable from
  // a missing draft would be nicer, but 403 is the honest status and draft
  // ids are not enumerable.
  draft_forbidden: 403,
  entity_not_found: 404,
  entity_not_bookable: 409,
  draft_consumed: 409,
  quote_consumed: 409,
  quote_expired: 409,
  hold_expired: 409,
  hold_required: 409,
  price_changed: 409,
  entity_mismatch: 422,
  not_public: 422,
  contact_mismatch: 422,
  incomplete_draft: 422,
  unsupported_vertical: 422,
}

const createBookingRoute = createRoute({
  method: "post",
  path: "/",
  request: {
    // Declared so the published contract states it. Presence is enforced by
    // the idempotency middleware, which runs first, so its clearer 400 is what
    // a caller actually sees when the header is missing.
    headers: z.object({
      "Idempotency-Key": z
        .string()
        .max(255)
        .describe("Stable key identifying this create attempt."),
    }),
    body: {
      required: true,
      content: { "application/json": { schema: createBookingRequestSchema } },
    },
  },
  responses: {
    201: {
      description: "Booking created, with the scoped checkout capability",
      content: { "application/json": { schema: createBookingResponseSchema } },
    },
    400: {
      description: "invalid_request: body failed validation or Idempotency-Key is missing",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    401: {
      description: "Neither an authenticated customer nor a verified challenge",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "The caller does not hold the capability for this draft",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Draft or quote not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Draft, quote, or hold is no longer spendable",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    422: {
      description: "Draft cannot produce a booking for this caller",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    501: {
      description: "This deployment has no self-service booking create provider",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

export function createSelfServiceBookingRoutes(options: SelfServiceCreateRouteOptions = {}) {
  const routes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })

  // A create without a stable key cannot be retried safely, so the key is
  // required. Response bodies are deliberately NOT cached: this one carries a
  // checkout capability, an HMAC bearer credential that would otherwise sit in
  // `infra_idempotency_keys` for 24 hours, and the middleware's replay path
  // reconstructs the body without its `Set-Cookie`, silently stripping the
  // caller's session on every retry.
  //
  // Nothing is lost by opting out. The durable command claim underneath is
  // what prevents a duplicate booking: a retry falls through to the handler,
  // replays the original booking at the claim, and is issued a fresh
  // capability and cookie. Same-key-different-body conflicts are caught by the
  // command's own fingerprint rather than by the HTTP cache.
  routes.use("/", idempotencyKey({ required: true, replayResponses: false }))

  return routes.openapi(createBookingRoute, async (c) => {
    const body = c.req.valid("json")
    const db = c.get("db")

    const create = options.resolveSelfServiceCreate?.(c)
    if (!create) return c.json({ error: "self_service_booking_unavailable" }, 501)

    // Either an account or a verified challenge — never neither, never both.
    const personId = options.resolveAuthenticatedPersonId?.(c)
    const verification = options.resolveGuestVerification?.(c)
    let verified: { channel: "email" | "sms"; destination: string } | null = null

    if (personId && body.verificationChallengeId) {
      // The challenge id reaches the ledger principal and the durable
      // idempotency scope. Accepting it from a caller who is already
      // authenticated would let them choose both.
      return c.json({ error: "verification_challenge_not_applicable" }, 400)
    }

    if (!personId) {
      if (!body.verificationChallengeId || !verification) {
        return c.json({ error: "verification_required" }, 401)
      }
      verified = await verification.peekVerifiedDestination(db, {
        challengeId: body.verificationChallengeId,
        subjectRef: body.draftId,
      })
      if (!verified) return c.json({ error: "verification_required" }, 401)
    }

    const challengeId = body.verificationChallengeId
    const result = await create.createFromDraft({
      db,
      draftId: body.draftId,
      quoteId: body.quoteId,
      caller: {
        ...(personId ? { personId } : {}),
        ...(verified?.channel === "email" ? { verifiedEmail: verified.destination } : {}),
        ...(verified?.channel === "sms" ? { verifiedPhone: verified.destination } : {}),
      },
      idempotencyKey: c.req.header("Idempotency-Key") ?? "",
      // Issued when the draft was created. Presented as a header by
      // non-browser callers, or as the HttpOnly cookie for browsers.
      ...(readDraftCapabilityToken(c) ? { draftCapabilityToken: readDraftCapabilityToken(c) } : {}),
      // Only set for a guest; refused above when the caller is authenticated,
      // so it can never be a caller-chosen ledger principal or claim scope.
      ...(challengeId ? { guestChallengeId: challengeId } : {}),
      ...(options.resolveAuthenticatedUserId?.(c)
        ? { userId: options.resolveAuthenticatedUserId(c) }
        : {}),
      ...(challengeId && verification
        ? {
            async consumeSources(tx: PostgresJsDatabase, bookingId: string) {
              const spent = await verification.consume(tx, {
                challengeId,
                subjectRef: body.draftId,
                destination: verified?.destination ?? "",
                consumedRef: bookingId,
              })
              // Rolls the whole create back rather than letting one challenge
              // authorize a second booking.
              if (spent.status !== "consumed") {
                throw new Error("verification challenge could not be consumed")
              }
            },
          }
        : {}),
    })

    if (result.status !== "ok") {
      return c.json({ error: result.reason }, REJECTION_STATUS[result.reason] ?? 422)
    }

    // `getRuntimeEnv` merges process.env; reading `c.env` alone resolves an
    // empty secret on the Node-first operator and throws AFTER the booking has
    // durably committed and the draft, quote, and challenge are spent.
    const capability = await issueCheckoutCapability(result.bookingId, getRuntimeEnv(c))
    c.header("Set-Cookie", checkoutCapabilityCookie(capability.token, capability.expiresAt))

    return c.json(
      {
        data: {
          bookingId: result.bookingId,
          bookingNumber: result.bookingNumber,
          status: result.bookingStatus ?? "created",
          checkoutCapability: {
            token: capability.token,
            expiresAt: capability.expiresAt.toISOString(),
            actions: [...capability.payload.actions],
          },
        },
      },
      201,
    )
  })
}
