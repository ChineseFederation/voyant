import { handleApiError } from "@voyant-travel/hono"
import { Hono } from "hono"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createSelfServiceBookingRoutes } from "../../src/routes-public-self-service-create.js"

const CAPABILITY_ENV = {
  VOYANT_CHECKOUT_CAPABILITY_SECRET: "checkout-capability-test-secret-32chars",
}

const BOOKING = { status: "ok" as const, bookingId: "book_1", bookingNumber: "VY-1" }
const ACTIVE_STOREFRONT_CHANNEL = {
  storefrontId: "sf_web",
  channelId: "chan_web",
  channelStatus: "active",
}

/**
 * The route was unreachable in every deployment once already — no provider was
 * contributed, so it answered 501 and nothing noticed. These exercise the
 * handler itself: what it refuses, what it forwards, and what it returns.
 */
describe("POST /v1/public/bookings", () => {
  const createFromDraft = vi.fn()

  beforeEach(() => {
    createFromDraft.mockReset()
    createFromDraft.mockResolvedValue(BOOKING)
  })

  it("reports 501 when the deployment selected no create provider", async () => {
    const response = await call({ withProvider: false })

    expect(response.status).toBe(501)
    expect(createFromDraft).not.toHaveBeenCalled()
  })

  it("refuses an anonymous caller with no challenge", async () => {
    const response = await call({ body: { draftId: "bdrf_1", quoteId: "cquo_1" } })

    expect(response.status).toBe(401)
    expect(createFromDraft).not.toHaveBeenCalled()
  })

  it("refuses creation without an active storefront channel context", async () => {
    const response = await call({
      storefrontChannel: null,
      options: { resolveAuthenticatedPersonId: () => "per_1" },
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: "active_storefront_channel_required",
    })
    expect(createFromDraft).not.toHaveBeenCalled()
  })

  it("refuses a challenge id from an already-authenticated caller", async () => {
    // The challenge reaches the ledger principal and the durable claim scope,
    // so an authenticated caller must not be able to supply one.
    const response = await call({
      options: { resolveAuthenticatedPersonId: () => "per_1" },
      body: { draftId: "bdrf_1", quoteId: "cquo_1", verificationChallengeId: "svch_x" },
    })

    expect(response.status).toBe(400)
    expect(createFromDraft).not.toHaveBeenCalled()
  })

  it("creates for an authenticated customer and issues the checkout capability", async () => {
    const response = await call({
      options: {
        resolveAuthenticatedPersonId: () => "per_1",
        resolveAuthenticatedUserId: () => "usr_1",
      },
    })

    expect(response.status).toBe(201)
    const payload = (await response.json()) as { data: { checkoutCapability: { token: string } } }
    expect(payload.data.checkoutCapability.token).toBeTruthy()
    expect(response.headers.get("set-cookie")).toContain("voyant_checkout_session")
    // Identified by the account, never by a challenge.
    expect(createFromDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        caller: expect.objectContaining({ personId: "per_1" }),
        storefront: {
          storefrontId: "sf_web",
          channelId: "chan_web",
        },
        userId: "usr_1",
      }),
    )
    expect(createFromDraft.mock.calls[0]?.[0]).not.toHaveProperty("guestChallengeId")
  })

  it("creates for a verified guest using only the channel the challenge proved", async () => {
    const response = await call({
      body: { draftId: "bdrf_1", quoteId: "cquo_1", verificationChallengeId: "svch_1" },
      options: {
        resolveGuestVerification: () => ({
          peekVerifiedDestination: async () => ({
            channel: "sms" as const,
            destination: "+40712345678",
          }),
          consume: async () => ({ status: "consumed" as const, destination: "+40712345678" }),
        }),
      },
    })

    expect(response.status).toBe(201)
    expect(createFromDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        caller: { verifiedPhone: "+40712345678" },
        guestChallengeId: "svch_1",
        storefront: {
          storefrontId: "sf_web",
          channelId: "chan_web",
        },
      }),
    )
  })

  it("maps a source rejection to a status the caller can act on", async () => {
    createFromDraft.mockResolvedValue({ status: "rejected", reason: "price_changed" })

    const response = await call({ options: { resolveAuthenticatedPersonId: () => "per_1" } })

    expect(response.status).toBe(409)
  })

  /** No prior replay record; captures the stored one. */
  function idempotencyDb() {
    return {
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [] }) }),
      }),
      insert: () => ({ values: async () => undefined }),
      delete: () => ({ where: async () => undefined }),
    }
  }

  async function call(input: {
    options?: Record<string, unknown>
    body?: Record<string, unknown>
    /** Whether the deployment selected a create provider. */
    withProvider?: boolean
    storefrontChannel?: typeof ACTIVE_STOREFRONT_CHANNEL | null
  }) {
    const app = new Hono()
    app.onError(handleApiError)
    // The idempotency middleware looks up and stores a replay record, so the
    // double implements exactly the select/insert it performs.
    app.use("*", async (c, next) => {
      c.set("db" as never, idempotencyDb() as never)
      if (input.storefrontChannel !== null) {
        c.set(
          "storefrontChannel" as never,
          (input.storefrontChannel ?? ACTIVE_STOREFRONT_CHANNEL) as never,
        )
      }
      await next()
    })
    const options = {
      ...input.options,
      ...(input.withProvider === false
        ? {}
        : { resolveSelfServiceCreate: () => ({ createFromDraft }) }),
    }
    app.route("/", createSelfServiceBookingRoutes(options as never) as never)

    return app.request(
      "/",
      {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": "req_1" },
        body: JSON.stringify(input.body ?? { draftId: "bdrf_1", quoteId: "cquo_1" }),
      },
      CAPABILITY_ENV,
    )
  }
})
