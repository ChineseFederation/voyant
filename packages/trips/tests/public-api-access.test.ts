import type { AnyDrizzleDb } from "@voyant-travel/db"
import { sha256Hex } from "@voyant-travel/hono"
import { describe, expect, it } from "vitest"
import {
  createPublicApiTrip,
  PUBLIC_API_TRIP_CAPABILITY_TTL_MS,
  resolvePublicApiTripAccess,
} from "../src/public-api-access.js"
import {
  type TripEnvelope,
  type TripPublicAccess,
  tripComponents,
  tripEnvelopes,
  tripPublicAccess,
} from "../src/schema.js"

const CAPABILITY = `tcap_${"a".repeat(64)}`
const NOW = new Date("2026-08-08T10:00:00.000Z")
const CONTEXT = {
  channelId: "channel_direct",
  userId: "anonymous-storefront",
}
const SCOPE = { marketId: "market_ro", locale: "ro-RO", currency: "EUR" }

describe("public Trip access", () => {
  it("creates an empty managed Trip and persists only the capability digest", async () => {
    const state: { envelope?: TripEnvelope; access?: TripPublicAccess } = {}
    const result = await createPublicApiTrip(
      createDb(state),
      { title: "City and coast", scope: SCOPE },
      CONTEXT,
      { now: () => NOW, createCapability: () => CAPABILITY },
    )

    expect(result.capability).toBe(CAPABILITY)
    expect(result.trip.envelope.id).toBe("trip_storefront_1")
    expect(result.trip.envelope.travelerParty).toEqual({})
    expect(result.trip.envelope.constraints).toEqual({ publicApiScope: SCOPE })
    expect(result.trip.envelope.createdBy).toBe("channel:channel_direct:anonymous")
    expect(state.access).toMatchObject({
      envelopeId: "trip_storefront_1",
      capabilityDigest: await sha256Hex(CAPABILITY),
      channelId: CONTEXT.channelId,
      ...SCOPE,
      ownerUserId: null,
      revision: 1,
      expiresAt: new Date(NOW.getTime() + PUBLIC_API_TRIP_CAPABILITY_TTL_MS),
    })
    expect(JSON.stringify(state.access)).not.toContain(CAPABILITY)
  })

  it("resolves only in the bound channel", async () => {
    const state = await seededState()
    const db = createDb(state)
    const result = await resolvePublicApiTripAccess(db, CAPABILITY, CONTEXT, { now: () => NOW })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.access.currency).toBe("EUR")

    await expect(
      resolvePublicApiTripAccess(
        db,
        CAPABILITY,
        { ...CONTEXT, channelId: "chan_other" },
        { now: () => NOW },
      ),
    ).resolves.toEqual({ ok: false, reason: "wrong_channel" })
  })

  it("fails closed for malformed, expired, and differently-owned capabilities", async () => {
    const state = await seededState()
    const db = createDb(state)
    await expect(resolvePublicApiTripAccess(db, "trip_storefront_1", CONTEXT)).resolves.toEqual({
      ok: false,
      reason: "invalid",
    })

    state.access = { ...state.access, expiresAt: new Date("2026-08-08T09:00:00.000Z") }
    await expect(
      resolvePublicApiTripAccess(db, CAPABILITY, CONTEXT, { now: () => NOW }),
    ).resolves.toEqual({ ok: false, reason: "expired" })

    state.access = {
      ...state.access,
      expiresAt: new Date("2026-09-01T00:00:00.000Z"),
      ownerUserId: "customer_1",
    }
    await expect(
      resolvePublicApiTripAccess(
        db,
        CAPABILITY,
        { ...CONTEXT, userId: "customer_2" },
        { now: () => NOW },
      ),
    ).resolves.toEqual({ ok: false, reason: "wrong_owner" })
  })
})

async function seededState(): Promise<{ envelope: TripEnvelope; access: TripPublicAccess }> {
  const envelope = envelopeRow()
  return {
    envelope,
    access: {
      envelopeId: envelope.id,
      capabilityDigest: await sha256Hex(CAPABILITY),
      channelId: CONTEXT.channelId,
      marketId: SCOPE.marketId,
      locale: SCOPE.locale,
      currency: SCOPE.currency,
      ownerUserId: null,
      ownerBuyerAccountId: null,
      revision: 1,
      expiresAt: new Date("2026-09-01T00:00:00.000Z"),
      createdAt: NOW,
      updatedAt: NOW,
    },
  }
}

function envelopeRow(): TripEnvelope {
  return {
    id: "trip_storefront_1",
    status: "draft",
    title: "City and coast",
    description: null,
    travelerParty: {},
    constraints: { publicApiScope: SCOPE },
    aggregateCurrency: null,
    aggregateSubtotalAmountCents: null,
    aggregateTaxAmountCents: null,
    aggregateTotalAmountCents: null,
    aggregatePricingSnapshot: null,
    currentPriceExpiresAt: null,
    bookingGroupId: null,
    orderId: null,
    paymentSessionId: null,
    reserveIdempotencyKey: null,
    reserveStartedAt: null,
    reservedAt: null,
    checkoutIdempotencyKey: null,
    checkoutStartedAt: null,
    createdBy: "channel:channel_direct:anonymous",
    updatedBy: "channel:channel_direct:anonymous",
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function createDb(state: { envelope?: TripEnvelope; access?: TripPublicAccess }): AnyDrizzleDb {
  const tx = {
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          if (table === tripEnvelopes) {
            state.envelope = { ...envelopeRow(), ...values } as TripEnvelope
            return [state.envelope]
          }
          if (table === tripPublicAccess) {
            state.access = {
              revision: 1,
              createdAt: NOW,
              updatedAt: NOW,
              ...values,
            } as TripPublicAccess
            return [state.access]
          }
          return []
        },
      }),
    }),
  }
  const db = {
    transaction: async (operation: (transaction: typeof tx) => unknown) => operation(tx),
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === tripPublicAccess) return state.access ? [state.access] : []
            if (table === tripEnvelopes) return state.envelope ? [state.envelope] : []
            return []
          },
          orderBy: async () => (table === tripComponents ? [] : []),
        }),
      }),
    }),
  }
  return db as AnyDrizzleDb
}
